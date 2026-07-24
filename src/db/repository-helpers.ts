import { AppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';
import { z } from 'zod';

assertServerOnly('src/db/repository-helpers.ts');

/**
 * Repository helpers keep ownership checks, loose JSON validation, and common
 * row-shape utilities consistent across every Phase 1 data-access module.
 */
export const jsonObjectSchema = z.record(z.string(), z.unknown());
export const jsonArraySchema = z.array(z.unknown());
export const nullableDateSchema = z.date().nullable();

export const dbActorSchema = z.object({
  userId: z.string().uuid('Repository access requires a UUID userId.'),
  requestId: z.string().trim().min(1).optional(),
});

export type DbActor = z.infer<typeof dbActorSchema>;

export const topicStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'archived',
]);

export const sessionStatusSchema = z.enum([
  'planned',
  'ready',
  'delivered',
  'completed',
  'skipped',
  'rescheduled',
]);

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const outboxStatusSchema = z.enum([
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

export const notificationChannelSchema = z.enum([
  'telegram',
  'in_app',
  'email',
  'push',
]);

export const ragEventTypeSchema = z.enum([
  'onboarding_response',
  'session_summary',
  'question_asked',
  'evaluation_response',
  'gap_detected',
  'misconception_detected',
  'misconception_corrected',
  'concept_mastered',
  'contradiction_resolved',
  'layer3_injection',
]);

export const curriculumSessionDocumentSchema = z
  .object({
    id: z.string().trim().min(1, 'Session id is required.'),
    status: sessionStatusSchema.optional(),
    lesson: z.unknown().optional(),
  })
  .passthrough();

export type CurriculumSessionDocument = z.infer<
  typeof curriculumSessionDocumentSchema
>;

/**
 * Every repository call must carry a real, UUID-shaped owner id. This used to
 * silently rewrite a bad id to a fallback UUID outside production, which meant
 * a broken session would quietly read and write another identity's rows. It now
 * fails loudly in every environment: ownership bugs must surface, not be masked.
 */
export function assertDbActor(actor: DbActor): DbActor {
  return dbActorSchema.parse(actor);
}

export function getOneOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

export function requireRow<T>(
  row: T | null,
  message: string,
  details?: Record<string, unknown>,
): T {
  if (row === null) {
    throw new AppError({
      code: 'NOT_FOUND',
      message,
      status: 404,
      details,
    });
  }

  return row;
}

export function requireMutationRow<T>(
  row: T | undefined,
  message: string,
  details?: Record<string, unknown>,
): T {
  if (row === undefined) {
    throw new AppError({
      code: 'NOT_FOUND',
      message,
      status: 404,
      details,
    });
  }

  return row;
}

export function buildUpdatedAtPatch(): { updatedAt: Date } {
  return {
    updatedAt: new Date(),
  };
}

export function matchesMetadataFilters(
  metadata: Record<string, unknown>,
  filters: Record<string, unknown>,
): boolean {
  return Object.entries(filters).every(([key, expectedValue]) => {
    const actualValue = metadata[key];

    if (Array.isArray(expectedValue)) {
      return (
        Array.isArray(actualValue) &&
        expectedValue.every((item) => actualValue.includes(item))
      );
    }

    if (
      expectedValue !== null &&
      typeof expectedValue === 'object' &&
      !Array.isArray(expectedValue)
    ) {
      return (
        actualValue !== null &&
        typeof actualValue === 'object' &&
        !Array.isArray(actualValue) &&
        matchesMetadataFilters(
          actualValue as Record<string, unknown>,
          expectedValue as Record<string, unknown>,
        )
      );
    }

    return actualValue === expectedValue;
  });
}


