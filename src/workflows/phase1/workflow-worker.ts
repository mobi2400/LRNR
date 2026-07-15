import { z } from 'zod';

import { nodeStatusSchema, phase1RouteSchema, type WorkflowError } from './state-machine';
import { selectNextPhase1Node, type WorkflowCheckpoint } from './workflow-service';

export const workflowQueuePayloadSchema = z.object({
  workflowRunId: z.string().min(1),
  userId: z.string().uuid(),
  requestId: z.string().min(1),
  route: phase1RouteSchema,
  attempt: z.number().int().min(0).default(0),
});

export const workflowQueueOptionsSchema = z.object({
  jobId: z.string().min(1),
  delayMs: z.number().int().min(0).default(0),
});

export const workflowLeaseSchema = z.object({
  lockKey: z.string().min(1),
  ownerId: z.string().min(1),
  fencingToken: z.number().int().positive(),
  expiresAt: z.date(),
});

const workflowWorkerSnapshotSchema = z.object({
  checkpoints: z.array(
    z.object({
      nodeName: z.string().min(1),
      status: nodeStatusSchema,
      critical: z.boolean(),
      updatedAt: z.date().default(() => new Date()),
    }),
  ),
});

export type WorkflowQueuePayload = z.infer<typeof workflowQueuePayloadSchema>;
export type WorkflowQueueOptions = z.infer<typeof workflowQueueOptionsSchema>;
export type WorkflowLease = z.infer<typeof workflowLeaseSchema>;
export type WorkflowWorkerSnapshot = z.input<typeof workflowWorkerSnapshotSchema>;

export type WorkflowNodeExecutionResult =
  | { status: 'succeeded'; output?: Record<string, unknown> }
  | { status: 'waiting_for_owner'; reason: string }
  | { status: 'failed'; error: WorkflowError };

export interface WorkflowQueueAdapter {
  enqueue(payload: WorkflowQueuePayload, options: WorkflowQueueOptions): Promise<{ accepted: boolean; jobId: string }>;
  close(): Promise<void>;
}

export interface WorkflowLockStore {
  acquire(input: { lockKey: string; ownerId: string; ttlMs: number; now: Date }): Promise<WorkflowLease | null>;
  renew(input: { lease: WorkflowLease; ttlMs: number; now: Date }): Promise<WorkflowLease | null>;
  release(lease: WorkflowLease): Promise<void>;
}

export interface WorkflowWorkerDependencies {
  queue: WorkflowQueueAdapter;
  locks: WorkflowLockStore;
  loadSnapshot(payload: WorkflowQueuePayload): Promise<WorkflowWorkerSnapshot>;
  executeNode(input: { payload: WorkflowQueuePayload; nodeName: string; lease: WorkflowLease }): Promise<WorkflowNodeExecutionResult>;
  persistNodeResult(input: { payload: WorkflowQueuePayload; nodeName: string; result: WorkflowNodeExecutionResult }): Promise<void>;
  deadLetter(input: { payload: WorkflowQueuePayload; reason: string }): Promise<void>;
  now?: () => Date;
}

export function buildWorkflowJobId(payload: WorkflowQueuePayload): string {
  const parsed = workflowQueuePayloadSchema.parse(payload);

  return ['phase1-workflow', parsed.userId, parsed.workflowRunId, parsed.requestId].join(':');
}

export function computeWorkflowRetryDelayMs(attempt: number): number {
  const parsedAttempt = z.number().int().min(0).parse(attempt);
  const baseDelayMs = 1_000;
  const maxDelayMs = 60_000;

  return Math.min(maxDelayMs, baseDelayMs * 2 ** parsedAttempt);
}

export function shouldDeadLetter(input: { attempt: number; maxAttempts: number; error: WorkflowError }): boolean {
  const parsed = z.object({ attempt: z.number().int().min(0), maxAttempts: z.number().int().min(1), error: z.custom<WorkflowError>() }).parse(input);

  return !parsed.error.retryable || parsed.attempt + 1 >= parsed.maxAttempts;
}

export function findStaleLeases(input: { checkpoints: WorkflowCheckpoint[]; now: Date }): string[] {
  const parsed = z.object({ checkpoints: workflowWorkerSnapshotSchema.shape.checkpoints, now: z.date() }).parse(input);

  return parsed.checkpoints
    .filter((checkpoint) => checkpoint.status === 'running')
    .filter((checkpoint) => checkpoint.updatedAt.getTime() < parsed.now.getTime())
    .map((checkpoint) => checkpoint.nodeName);
}

export async function enqueueWorkflowRun(queue: WorkflowQueueAdapter, payload: WorkflowQueuePayload): Promise<{ accepted: boolean; jobId: string }> {
  const parsed = workflowQueuePayloadSchema.parse(payload);

  return queue.enqueue(parsed, { jobId: buildWorkflowJobId(parsed), delayMs: 0 });
}

export async function runNextWorkflowNode(dependencies: WorkflowWorkerDependencies, payload: WorkflowQueuePayload): Promise<{ nodeName: string | null; result: WorkflowNodeExecutionResult | null }> {
  const parsedPayload = workflowQueuePayloadSchema.parse(payload);
  const now = dependencies.now?.() ?? new Date();
  const lockKey = ['phase1-workflow-lock', parsedPayload.userId, parsedPayload.workflowRunId].join(':');
  const lease = await dependencies.locks.acquire({ lockKey, ownerId: parsedPayload.requestId, ttlMs: 30_000, now });

  if (lease === null) {
    await dependencies.queue.enqueue(parsedPayload, {
      jobId: buildWorkflowJobId(parsedPayload),
      delayMs: computeWorkflowRetryDelayMs(parsedPayload.attempt),
    });
    return { nodeName: null, result: null };
  }

  try {
    const snapshot = workflowWorkerSnapshotSchema.parse(await dependencies.loadSnapshot(parsedPayload));
    const nodeName = selectNextPhase1Node({ route: parsedPayload.route, checkpoints: snapshot.checkpoints });

    if (nodeName === null) {
      return { nodeName: null, result: null };
    }

    const renewedLease = await dependencies.locks.renew({ lease, ttlMs: 30_000, now: dependencies.now?.() ?? new Date() });
    if (renewedLease === null) {
      await dependencies.deadLetter({ payload: parsedPayload, reason: 'lease_lost_before_node_execution' });
      return { nodeName, result: null };
    }

    const result = await dependencies.executeNode({ payload: parsedPayload, nodeName, lease: renewedLease });
    await dependencies.persistNodeResult({ payload: parsedPayload, nodeName, result });

    return { nodeName, result };
  } finally {
    await dependencies.locks.release(lease);
  }
}

export function createInMemoryWorkflowQueueAdapter(): WorkflowQueueAdapter & { readonly jobs: ReadonlyMap<string, { payload: WorkflowQueuePayload; options: WorkflowQueueOptions }> } {
  const jobs = new Map<string, { payload: WorkflowQueuePayload; options: WorkflowQueueOptions }>();

  return {
    get jobs() {
      return jobs;
    },
    async enqueue(payload, options) {
      const parsedPayload = workflowQueuePayloadSchema.parse(payload);
      const parsedOptions = workflowQueueOptionsSchema.parse(options);
      const accepted = !jobs.has(parsedOptions.jobId);
      jobs.set(parsedOptions.jobId, { payload: parsedPayload, options: parsedOptions });

      return { accepted, jobId: parsedOptions.jobId };
    },
    async close() {
      jobs.clear();
    },
  };
}
