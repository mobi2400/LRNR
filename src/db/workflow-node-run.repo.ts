import { and, eq, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import { workflowNodeRuns } from '@/db/schema';
import { assertDbActor, jsonObjectSchema, type DbActor } from '@/db/repository-helpers';
import type { WorkflowNodeRunRow } from '@/db/types';
import { nodeStatusSchema, workflowErrorSchema } from '@/workflows/phase1/state-machine';

const workflowNodeRunRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workflowRunId: z.string(),
  nodeName: z.string(),
  status: nodeStatusSchema,
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  input: jsonObjectSchema,
  output: jsonObjectSchema.nullable(),
  error: workflowErrorSchema.nullable(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const createNodeRunSchema = z.object({
  workflowRunId: z.string().min(1),
  nodeName: z.string().min(1),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  input: jsonObjectSchema.default({}),
  idempotencyKey: z.string().min(1).optional(),
});

export type WorkflowNodeRunRecord = z.infer<typeof workflowNodeRunRecordSchema>;
export type CreateWorkflowNodeRunInput = z.input<typeof createNodeRunSchema>;

function parseRow(row: WorkflowNodeRunRow): WorkflowNodeRunRecord {
  return workflowNodeRunRecordSchema.parse(row);
}

export function createWorkflowNodeRunRepository(database: DbClient = db) {
  return {
    async createNodeRun(actor: DbActor, input: CreateWorkflowNodeRunInput): Promise<WorkflowNodeRunRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = createNodeRunSchema.parse(input);
      const [row] = await database
        .insert(workflowNodeRuns)
        .values({ userId: validatedActor.userId, ...validatedInput })
        .onConflictDoUpdate({
          target: [workflowNodeRuns.userId, workflowNodeRuns.workflowRunId, workflowNodeRuns.nodeName],
          set: { updatedAt: new Date() },
        })
        .returning();

      if (row === undefined) {
        throw new Error('Workflow node run could not be created or loaded.');
      }

      return parseRow(row);
    },

    async claimReadyNode(actor: DbActor, input: { id: string; leaseOwner: string; leaseSeconds: number }): Promise<WorkflowNodeRunRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validated = z.object({ id: z.string().uuid(), leaseOwner: z.string().min(1), leaseSeconds: z.number().int().positive().max(3600) }).parse(input);
      const now = new Date();
      const [row] = await database
        .update(workflowNodeRuns)
        .set({ status: 'running', leaseOwner: validated.leaseOwner, leaseExpiresAt: new Date(now.getTime() + validated.leaseSeconds * 1000), startedAt: now, updatedAt: now })
        .where(and(eq(workflowNodeRuns.id, validated.id), eq(workflowNodeRuns.userId, validatedActor.userId), or(eq(workflowNodeRuns.status, 'ready'), and(eq(workflowNodeRuns.status, 'running'), lt(workflowNodeRuns.leaseExpiresAt, now)))!))
        .returning();

      return row === undefined ? null : parseRow(row);
    },

    async completeNode(actor: DbActor, input: { id: string; output?: Record<string, unknown> }): Promise<WorkflowNodeRunRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validated = z.object({ id: z.string().uuid(), output: jsonObjectSchema.default({}) }).parse(input);
      const now = new Date();
      const [row] = await database
        .update(workflowNodeRuns)
        .set({ status: 'succeeded', output: validated.output, leaseOwner: null, leaseExpiresAt: null, finishedAt: now, updatedAt: now })
        .where(and(eq(workflowNodeRuns.id, validated.id), eq(workflowNodeRuns.userId, validatedActor.userId), eq(workflowNodeRuns.status, 'running')))
        .returning();

      return row === undefined ? null : parseRow(row);
    },

    async failNode(actor: DbActor, input: { id: string; error: z.infer<typeof workflowErrorSchema> }): Promise<WorkflowNodeRunRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validated = z.object({ id: z.string().uuid(), error: workflowErrorSchema }).parse(input);
      const status = validated.error.retryable ? 'failed_retryable' : 'failed_terminal';
      const now = new Date();
      const [row] = await database
        .update(workflowNodeRuns)
        .set({ status, error: validated.error, leaseOwner: null, leaseExpiresAt: null, finishedAt: now, updatedAt: now })
        .where(and(eq(workflowNodeRuns.id, validated.id), eq(workflowNodeRuns.userId, validatedActor.userId)))
        .returning();

      return row === undefined ? null : parseRow(row);
    },

    async markRetryReady(actor: DbActor, id: string): Promise<WorkflowNodeRunRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedId = z.string().uuid().parse(id);
      const [row] = await database
        .update(workflowNodeRuns)
        .set({ status: 'ready', attempt: sql`${workflowNodeRuns.attempt} + 1`, error: null, updatedAt: new Date() })
        .where(and(eq(workflowNodeRuns.id, validatedId), eq(workflowNodeRuns.userId, validatedActor.userId), eq(workflowNodeRuns.status, 'failed_retryable')))
        .returning();

      return row === undefined ? null : parseRow(row);
    },

    async listWorkflowNodes(actor: DbActor, workflowRunId: string): Promise<WorkflowNodeRunRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedWorkflowRunId = z.string().min(1).parse(workflowRunId);
      const rows = await database
        .select()
        .from(workflowNodeRuns)
        .where(and(eq(workflowNodeRuns.userId, validatedActor.userId), eq(workflowNodeRuns.workflowRunId, validatedWorkflowRunId)));

      return rows.map(parseRow);
    },
  };
}

export const workflowNodeRunRepository = createWorkflowNodeRunRepository();
