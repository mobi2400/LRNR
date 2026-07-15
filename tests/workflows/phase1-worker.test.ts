import { describe, expect, it, vi } from 'vitest';

import {
  buildWorkflowJobId,
  computeWorkflowRetryDelayMs,
  createInMemoryWorkflowQueueAdapter,
  enqueueWorkflowRun,
  findStaleLeases,
  runNextWorkflowNode,
  shouldDeadLetter,
  type WorkflowLockStore,
  type WorkflowQueuePayload,
  type WorkflowLease,
} from '@/workflows/phase1/workflow-worker';

const payload: WorkflowQueuePayload = {
  workflowRunId: 'workflow-1',
  userId: '00000000-0000-4000-8000-000000000001',
  requestId: 'request-1',
  route: 'new_goal',
  attempt: 0,
};

function createLockStore(): WorkflowLockStore {
  const lease: WorkflowLease = {
    lockKey: 'phase1-workflow-lock:00000000-0000-4000-8000-000000000001:workflow-1',
    ownerId: 'request-1',
    fencingToken: 1,
    expiresAt: new Date(Date.now() + 30_000),
  };

  return {
    acquire: vi.fn().mockResolvedValue(lease),
    renew: vi.fn().mockResolvedValue(lease),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

describe('phase 1 workflow worker', () => {
  it('deduplicates queue deliveries by stable workflow job id', async () => {
    const queue = createInMemoryWorkflowQueueAdapter();

    const first = await enqueueWorkflowRun(queue, payload);
    const second = await enqueueWorkflowRun(queue, payload);

    expect(first).toEqual({ accepted: true, jobId: buildWorkflowJobId(payload) });
    expect(second).toEqual({ accepted: false, jobId: buildWorkflowJobId(payload) });
    expect(queue.jobs.size).toBe(1);
  });

  it('caps delayed retry backoff', () => {
    expect(computeWorkflowRetryDelayMs(0)).toBe(1_000);
    expect(computeWorkflowRetryDelayMs(20)).toBe(60_000);
  });

  it('dead-letters terminal or exhausted retryable failures', () => {
    expect(
      shouldDeadLetter({
        attempt: 0,
        maxAttempts: 3,
        error: { code: 'provider_timeout', message: 'timeout', retryable: true, stableCategory: 'transient' },
      }),
    ).toBe(false);
    expect(
      shouldDeadLetter({
        attempt: 2,
        maxAttempts: 3,
        error: { code: 'provider_timeout', message: 'timeout', retryable: true, stableCategory: 'transient' },
      }),
    ).toBe(true);
    expect(
      shouldDeadLetter({
        attempt: 0,
        maxAttempts: 3,
        error: { code: 'schema_invalid', message: 'schema invalid', retryable: false, stableCategory: 'safety_gate' },
      }),
    ).toBe(true);
  });

  it('detects stale running checkpoints for recovery', () => {
    const stale = findStaleLeases({
      now: new Date('2026-01-01T00:10:00Z'),
      checkpoints: [
        { nodeName: 'teaching', status: 'running', critical: true, updatedAt: new Date('2026-01-01T00:00:00Z') },
        { nodeName: 'delivery_side_effects', status: 'succeeded', critical: false, updatedAt: new Date('2026-01-01T00:00:00Z') },
      ],
    });

    expect(stale).toEqual(['teaching']);
  });

  it('runs the next safe node under a fenced lease', async () => {
    const queue = createInMemoryWorkflowQueueAdapter();
    const locks = createLockStore();
    const executeNode = vi.fn().mockResolvedValue({ status: 'succeeded', output: { ok: true } });
    const persistNodeResult = vi.fn().mockResolvedValue(undefined);

    const result = await runNextWorkflowNode(
      {
        queue,
        locks,
        loadSnapshot: vi.fn().mockResolvedValue({
          checkpoints: [{ nodeName: 'route', status: 'ready', critical: true, updatedAt: new Date() }],
        }),
        executeNode,
        persistNodeResult,
        deadLetter: vi.fn().mockResolvedValue(undefined),
      },
      payload,
    );

    expect(result.nodeName).toBe('route');
    expect(executeNode).toHaveBeenCalledWith(expect.objectContaining({ nodeName: 'route' }));
    expect(persistNodeResult).toHaveBeenCalledWith(expect.objectContaining({ nodeName: 'route' }));
    expect(locks.release).toHaveBeenCalledTimes(1);
  });

  it('requeues promptly when another worker owns the workflow lock', async () => {
    const queue = createInMemoryWorkflowQueueAdapter();

    const result = await runNextWorkflowNode(
      {
        queue,
        locks: {
          acquire: vi.fn().mockResolvedValue(null),
          renew: vi.fn(),
          release: vi.fn(),
        },
        loadSnapshot: vi.fn(),
        executeNode: vi.fn(),
        persistNodeResult: vi.fn(),
        deadLetter: vi.fn(),
      },
      payload,
    );

    expect(result).toEqual({ nodeName: null, result: null });
    expect(queue.jobs.get(buildWorkflowJobId(payload))?.options.delayMs).toBe(1_000);
  });

  it('closes queue resources during safe shutdown', async () => {
    const queue = createInMemoryWorkflowQueueAdapter();
    await enqueueWorkflowRun(queue, payload);

    await queue.close();

    expect(queue.jobs.size).toBe(0);
  });
});
