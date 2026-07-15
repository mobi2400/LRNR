import { z } from 'zod';

import { lessonPayloadSchema } from '@/schemas/lesson.schema';
import type { DbActor } from '@/db/repository-helpers';
import type { DeliveryOutboxRecord } from '@/db/outbox.repo';
import type { RagMemoryRecord } from '@/db/rag.repo';

const persistedLessonInputSchema = z.object({
  userId: z.string().uuid(),
  topicSlug: z.string().trim().min(1).max(255),
  sessionId: z.string().trim().min(1),
  lessonStatus: z.literal('ready'),
  lessonRevision: z.number().int().min(0),
  lesson: lessonPayloadSchema,
});

export const postLessonSideEffectPlanSchema = z.object({
  delivery: z.object({
    deliveryKey: z.string().min(1),
    sessionId: z.string().min(1),
    title: z.string().min(1),
  }),
  rag: z.object({
    idempotencyKey: z.string().min(1),
    topicSlug: z.string().min(1),
    sessionId: z.string().min(1),
    content: z.string().min(1),
  }),
});

export const sideEffectExecutionResultSchema = z.object({
  deliveryQueued: z.boolean(),
  ragWriteQueued: z.boolean(),
  repairableFailures: z.array(z.enum(['delivery', 'rag'])).default([]),
});

export type PersistedLessonInput = z.input<typeof persistedLessonInputSchema>;
export type PostLessonSideEffectPlan = z.infer<typeof postLessonSideEffectPlanSchema>;
export type SideEffectExecutionResult = z.infer<typeof sideEffectExecutionResultSchema>;

export interface PostLessonSideEffectDependencies {
  queueLessonReadyAlert(actor: DbActor, input: { sessionId: string; title: string }): Promise<DeliveryOutboxRecord>;
  writeLessonReadySummary(actor: DbActor, input: { topicSlug: string; content: string; idempotencyKey: string; sessionId: string }): Promise<RagMemoryRecord>;
}

export function buildDeliveryIdempotencyKey(input: { userId: string; sessionId: string }): string {
  const parsed = z.object({ userId: z.string().uuid(), sessionId: z.string().min(1) }).parse(input);

  return ['lesson-ready', parsed.userId, parsed.sessionId].join(':');
}

export function buildRagLessonReadyIdempotencyKey(input: { userId: string; sessionId: string; lessonRevision: number }): string {
  const parsed = z.object({ userId: z.string().uuid(), sessionId: z.string().min(1), lessonRevision: z.number().int().min(0) }).parse(input);

  return ['rag-session-summary', parsed.userId, parsed.sessionId, 'lesson-ready', String(parsed.lessonRevision)].join(':');
}

export function planPostLessonSideEffects(input: PersistedLessonInput): PostLessonSideEffectPlan {
  const parsed = persistedLessonInputSchema.parse(input);
  const content = [
    `Lesson ready: ${parsed.lesson.title}.`,
    `Objective: ${parsed.lesson.objective}`,
    `Review: ${parsed.lesson.reviewQuestions.map((question) => question.question).join(' | ')}`,
  ].join(' ');

  return postLessonSideEffectPlanSchema.parse({
    delivery: {
      deliveryKey: buildDeliveryIdempotencyKey(parsed),
      sessionId: parsed.sessionId,
      title: parsed.lesson.title,
    },
    rag: {
      idempotencyKey: buildRagLessonReadyIdempotencyKey(parsed),
      topicSlug: parsed.topicSlug,
      sessionId: parsed.sessionId,
      content,
    },
  });
}

export async function executePostLessonSideEffects(input: {
  actor: DbActor;
  plan: PostLessonSideEffectPlan;
  dependencies: PostLessonSideEffectDependencies;
}): Promise<SideEffectExecutionResult> {
  const plan = postLessonSideEffectPlanSchema.parse(input.plan);
  const repairableFailures: Array<'delivery' | 'rag'> = [];
  let deliveryQueued = false;
  let ragWriteQueued = false;

  try {
    await input.dependencies.queueLessonReadyAlert(input.actor, {
      sessionId: plan.delivery.sessionId,
      title: plan.delivery.title,
    });
    deliveryQueued = true;
  } catch {
    repairableFailures.push('delivery');
  }

  try {
    await input.dependencies.writeLessonReadySummary(input.actor, {
      topicSlug: plan.rag.topicSlug,
      content: plan.rag.content,
      idempotencyKey: plan.rag.idempotencyKey,
      sessionId: plan.rag.sessionId,
    });
    ragWriteQueued = true;
  } catch {
    repairableFailures.push('rag');
  }

  return sideEffectExecutionResultSchema.parse({
    deliveryQueued,
    ragWriteQueued,
    repairableFailures,
  });
}
