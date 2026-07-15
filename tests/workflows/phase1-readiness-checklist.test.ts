import { describe, expect, it, vi } from 'vitest';

import { validatePhase1NodeOutput } from '@/workflows/phase1/node-orchestration';
import {
  executePostLessonSideEffects,
  planPostLessonSideEffects,
} from '@/workflows/phase1/post-lesson-side-effects';
import {
  createInMemoryWorkflowQueueAdapter,
  runNextWorkflowNode,
  type WorkflowLease,
  type WorkflowLockStore,
  type WorkflowQueuePayload,
} from '@/workflows/phase1/workflow-worker';
import type { DbActor } from '@/db/repository-helpers';
import type { LessonPayload } from '@/schemas/lesson.schema';

const userId = '00000000-0000-4000-8000-000000000001';
const payload: WorkflowQueuePayload = {
  workflowRunId: 'workflow-1',
  userId,
  requestId: 'request-1',
  route: 'new_goal',
  attempt: 0,
};
const actor: DbActor = { userId, requestId: 'request-1' };
const lease: WorkflowLease = {
  lockKey: `phase1-workflow-lock:${userId}:workflow-1`,
  ownerId: 'request-1',
  fencingToken: 1,
  expiresAt: new Date('2026-01-01T00:01:00Z'),
};
const lesson: LessonPayload = {
  sessionId: 'session-1',
  topicSlug: 'agentic-ai',
  title: 'Day 1: RAG',
  objective: 'Explain RAG clearly.',
  mentalModel: 'RAG retrieves source evidence before generation so answers are constrained by context.',
  explanation: [{ heading: 'Core idea', body: 'The workflow retrieves trustworthy context, then generates from that bounded context.' }],
  diagram: { type: 'description', content: 'query -> retrieve -> answer' },
  codeExamples: [],
  commonMistakes: ['Treating citations as decoration.'],
  reviewQuestions: [{ id: 'q1', question: 'What does retrieval add?', expectedPoints: ['Evidence'], hint: 'Start with sources.' }],
  sourceReferences: [{ label: 'Topic brief', url: 'lrnr://topic-briefs/1' }],
  nextAction: 'Review the cited source.',
  generatedBy: 'teaching_node',
};

function lockStore(overrides?: Partial<WorkflowLockStore>): WorkflowLockStore {
  return {
    acquire: vi.fn().mockResolvedValue(lease),
    renew: vi.fn().mockResolvedValue(lease),
    release: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function snapshot() {
  return {
    checkpoints: [{ nodeName: 'route', status: 'ready' as const, critical: true, updatedAt: new Date() }],
  };
}

describe('phase 1 orchestration readiness checklist', () => {
  it('dead-letters visibly when a worker loses the lease before node execution', async () => {
    const deadLetter = vi.fn().mockResolvedValue(undefined);

    await expect(
      runNextWorkflowNode(
        {
          queue: createInMemoryWorkflowQueueAdapter(),
          locks: lockStore({ renew: vi.fn().mockResolvedValue(null) }),
          loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
          executeNode: vi.fn(),
          persistNodeResult: vi.fn(),
          deadLetter,
        },
        payload,
      ),
    ).resolves.toEqual({ nodeName: 'route', result: null });

    expect(deadLetter).toHaveBeenCalledWith({ payload, reason: 'lease_lost_before_node_execution' });
  });

  it('releases the workflow lease when execution crashes before completion is written', async () => {
    const locks = lockStore();

    await expect(
      runNextWorkflowNode(
        {
          queue: createInMemoryWorkflowQueueAdapter(),
          locks,
          loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
          executeNode: vi.fn().mockRejectedValue(new Error('worker crashed before completion write')),
          persistNodeResult: vi.fn(),
          deadLetter: vi.fn(),
        },
        payload,
      ),
    ).rejects.toThrow(/worker crashed/);

    expect(locks.release).toHaveBeenCalledWith(lease);
  });

  it('releases the workflow lease when result persistence crashes after node output', async () => {
    const locks = lockStore();

    await expect(
      runNextWorkflowNode(
        {
          queue: createInMemoryWorkflowQueueAdapter(),
          locks,
          loadSnapshot: vi.fn().mockResolvedValue(snapshot()),
          executeNode: vi.fn().mockResolvedValue({ status: 'succeeded', output: { ok: true } }),
          persistNodeResult: vi.fn().mockRejectedValue(new Error('database unavailable after output')),
          deadLetter: vi.fn(),
        },
        payload,
      ),
    ).rejects.toThrow(/database unavailable/);

    expect(locks.release).toHaveBeenCalledWith(lease);
  });

  it('rejects invalid agent JSON at the node-output boundary', () => {
    expect(() =>
      validatePhase1NodeOutput('teaching', {
        lesson: {
          sessionId: 'session-1',
          title: 'Missing required lesson fields',
          generatedBy: 'teaching_node',
        },
      }),
    ).toThrow();
  });

  it('keeps post-lesson side-effect retries idempotent and independently repairable', async () => {
    const plan = planPostLessonSideEffects({
      userId,
      topicSlug: 'agentic-ai',
      sessionId: 'session-1',
      lessonStatus: 'ready',
      lessonRevision: 2,
      lesson,
    });
    const queueLessonReadyAlert = vi.fn().mockResolvedValue({});
    const writeLessonReadySummary = vi.fn().mockResolvedValue({});

    await executePostLessonSideEffects({
      actor,
      plan,
      dependencies: { queueLessonReadyAlert, writeLessonReadySummary },
    });
    await executePostLessonSideEffects({
      actor,
      plan,
      dependencies: { queueLessonReadyAlert, writeLessonReadySummary },
    });

    expect(queueLessonReadyAlert).toHaveBeenNthCalledWith(1, actor, { sessionId: 'session-1', title: 'Day 1: RAG' });
    expect(queueLessonReadyAlert).toHaveBeenNthCalledWith(2, actor, { sessionId: 'session-1', title: 'Day 1: RAG' });
    expect(writeLessonReadySummary).toHaveBeenNthCalledWith(1, actor, expect.objectContaining({ idempotencyKey: plan.rag.idempotencyKey }));
    expect(writeLessonReadySummary).toHaveBeenNthCalledWith(2, actor, expect.objectContaining({ idempotencyKey: plan.rag.idempotencyKey }));
  });
});
