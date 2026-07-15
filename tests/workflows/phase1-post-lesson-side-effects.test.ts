import { describe, expect, it, vi } from 'vitest';

import {
  buildDeliveryIdempotencyKey,
  buildRagLessonReadyIdempotencyKey,
  executePostLessonSideEffects,
  planPostLessonSideEffects,
} from '@/workflows/phase1/post-lesson-side-effects';
import type { DbActor } from '@/db/repository-helpers';
import type { LessonPayload } from '@/schemas/lesson.schema';

const userId = '00000000-0000-4000-8000-000000000001';
const actor: DbActor = { userId, requestId: 'request-1' };
const lesson: LessonPayload = {
  sessionId: 'session-1',
  topicSlug: 'agentic-ai',
  title: 'Day 1: RAG',
  objective: 'Explain RAG clearly.',
  mentalModel: 'RAG joins retrieval with generation.',
  explanation: [{ heading: 'Core idea', body: 'Retrieve evidence before answering.' }],
  diagram: { type: 'description', content: 'query -> retrieve -> answer' },
  codeExamples: [],
  commonMistakes: ['Treating citations as decoration.'],
  reviewQuestions: [{ id: 'q1', question: 'What does retrieval add?', expectedPoints: ['Evidence'], hint: 'Start with sources.' }],
  sourceReferences: [{ label: 'Topic brief', url: 'lrnr://topic-briefs/1' }],
  nextAction: 'Review the source.',
  generatedBy: 'teaching_node',
};

describe('post lesson side effects', () => {
  it('refuses to plan side effects before the lesson is ready', () => {
    expect(() =>
      planPostLessonSideEffects({
        userId,
        topicSlug: 'agentic-ai',
        sessionId: 'session-1',
        lessonStatus: 'delivered' as 'ready',
        lessonRevision: 1,
        lesson,
      }),
    ).toThrow();
  });

  it('builds stable delivery and RAG idempotency keys', () => {
    expect(buildDeliveryIdempotencyKey({ userId, sessionId: 'session-1' })).toBe(`lesson-ready:${userId}:session-1`);
    expect(buildRagLessonReadyIdempotencyKey({ userId, sessionId: 'session-1', lessonRevision: 7 })).toBe(`rag-session-summary:${userId}:session-1:lesson-ready:7`);
  });

  it('plans both side effects from the persisted lesson boundary', () => {
    const plan = planPostLessonSideEffects({
      userId,
      topicSlug: 'agentic-ai',
      sessionId: 'session-1',
      lessonStatus: 'ready',
      lessonRevision: 1,
      lesson,
    });

    expect(plan.delivery).toMatchObject({ sessionId: 'session-1', title: 'Day 1: RAG' });
    expect(plan.rag.content).toContain('Lesson ready: Day 1: RAG.');
  });

  it('records repairable RAG failure without duplicating delivery work', async () => {
    const plan = planPostLessonSideEffects({
      userId,
      topicSlug: 'agentic-ai',
      sessionId: 'session-1',
      lessonStatus: 'ready',
      lessonRevision: 1,
      lesson,
    });
    const queueLessonReadyAlert = vi.fn().mockResolvedValue({});
    const writeLessonReadySummary = vi.fn().mockRejectedValue(new Error('redis unavailable'));

    const result = await executePostLessonSideEffects({
      actor,
      plan,
      dependencies: { queueLessonReadyAlert, writeLessonReadySummary },
    });

    expect(result).toEqual({ deliveryQueued: true, ragWriteQueued: false, repairableFailures: ['rag'] });
    expect(queueLessonReadyAlert).toHaveBeenCalledTimes(1);
    expect(writeLessonReadySummary).toHaveBeenCalledWith(actor, expect.objectContaining({ idempotencyKey: plan.rag.idempotencyKey }));
  });
});


