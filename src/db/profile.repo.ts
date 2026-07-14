import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonArraySchema,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import { userProfile } from '@/db/schema';
import { AppError } from '@/server/errors';
import type { UserProfileRow } from '@/db/types';

const profileRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string().nullable(),
  currentGoal: z.string().nullable(),
  currentTopicId: z.string().uuid().nullable(),
  currentTopicSlug: z.string().nullable(),
  curriculumPosition: jsonObjectSchema,
  learnerPreferences: jsonObjectSchema,
  stableMasterySummary: jsonObjectSchema,
  activeMisconceptions: jsonArraySchema,
  nextEvaluationDueAt: z.date().nullable(),
  lastActiveAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const upsertProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(255).nullable().optional(),
  currentGoal: z.string().trim().min(1).max(4000).nullable().optional(),
  currentTopicId: z.string().uuid().nullable().optional(),
  currentTopicSlug: z.string().trim().min(1).max(255).nullable().optional(),
  curriculumPosition: jsonObjectSchema.optional(),
  learnerPreferences: jsonObjectSchema.optional(),
  stableMasterySummary: jsonObjectSchema.optional(),
  activeMisconceptions: jsonArraySchema.optional(),
  nextEvaluationDueAt: z.date().nullable().optional(),
  lastActiveAt: z.date().nullable().optional(),
});

const currentTopicMetadataSchema = z.object({
  currentTopicId: z.string().uuid().nullable().optional(),
  currentTopicSlug: z.string().trim().min(1).max(255).nullable().optional(),
  curriculumPosition: jsonObjectSchema.optional(),
  nextEvaluationDueAt: z.date().nullable().optional(),
  lastActiveAt: z.date().nullable().optional(),
});

export type ProfileRecord = z.infer<typeof profileRecordSchema>;
export type UpsertProfileInput = z.infer<typeof upsertProfileInputSchema>;
export type CurrentTopicMetadataInput = z.infer<typeof currentTopicMetadataSchema>;

function parseProfileRow(row: UserProfileRow): ProfileRecord {
  return profileRecordSchema.parse(row);
}

/**
 * Profile repository owns the stable learner profile row and the small subset
 * of topic-position metadata that belongs in user_profile rather than RAG.
 */
export function createProfileRepository(database: DbClient = db) {
  return {
    async getCurrentProfile(actor: DbActor): Promise<ProfileRecord | null> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select()
        .from(userProfile)
        .where(eq(userProfile.userId, validatedActor.userId))
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseProfileRow(row);
    },

    async upsertProfile(
      actor: DbActor,
      input: UpsertProfileInput,
    ): Promise<ProfileRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertProfileInputSchema.parse(input);
      const [row] = await database
        .insert(userProfile)
        .values({
          userId: validatedActor.userId,
          displayName: validatedInput.displayName ?? null,
          currentGoal: validatedInput.currentGoal ?? null,
          currentTopicId: validatedInput.currentTopicId ?? null,
          currentTopicSlug: validatedInput.currentTopicSlug ?? null,
          curriculumPosition: validatedInput.curriculumPosition ?? {},
          learnerPreferences: validatedInput.learnerPreferences ?? {},
          stableMasterySummary: validatedInput.stableMasterySummary ?? {},
          activeMisconceptions: validatedInput.activeMisconceptions ?? [],
          nextEvaluationDueAt: validatedInput.nextEvaluationDueAt ?? null,
          lastActiveAt: validatedInput.lastActiveAt ?? null,
        })
        .onConflictDoUpdate({
          target: userProfile.userId,
          set: {
            ...validatedInput,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseProfileRow(
        requireMutationRow(row, 'Profile write did not return a row.'),
      );
    },

    async updateCurrentTopicMetadata(
      actor: DbActor,
      input: CurrentTopicMetadataInput,
    ): Promise<ProfileRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = currentTopicMetadataSchema.parse(input);
      const [row] = await database
        .update(userProfile)
        .set({
          ...validatedInput,
          ...buildUpdatedAtPatch(),
        })
        .where(eq(userProfile.userId, validatedActor.userId))
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Profile not found for the current owner.',
          status: 404,
        });
      }

      return parseProfileRow(row);
    },
  };
}

export const profileRepository = createProfileRepository();
