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
import { topicKnowledgeBase } from '@/db/schema';
import type { TopicKnowledgeBaseRow } from '@/db/types';

const topicKnowledgeBaseRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicBriefId: z.string().uuid().nullable(),
  topicSlug: z.string(),
  sourceInventory: jsonArraySchema,
  conceptMap: jsonArraySchema,
  claims: jsonArraySchema,
  limitations: jsonArraySchema,
  codePatterns: jsonArraySchema,
  versionNotes: jsonArraySchema,
  interviewPatterns: jsonArraySchema,
  metadata: jsonObjectSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

const upsertKnowledgeBaseInputSchema = z.object({
  topicBriefId: z.string().uuid().nullable().optional(),
  topicSlug: z.string().trim().min(1).max(255),
  sourceInventory: jsonArraySchema.default([]),
  conceptMap: jsonArraySchema.default([]),
  claims: jsonArraySchema.default([]),
  limitations: jsonArraySchema.default([]),
  codePatterns: jsonArraySchema.default([]),
  versionNotes: jsonArraySchema.default([]),
  interviewPatterns: jsonArraySchema.default([]),
  metadata: jsonObjectSchema.default({}),
});

export type TopicKnowledgeBaseRecord = z.infer<
  typeof topicKnowledgeBaseRecordSchema
>;
export type UpsertKnowledgeBaseInput = z.infer<
  typeof upsertKnowledgeBaseInputSchema
>;

function parseKnowledgeBaseRow(
  row: TopicKnowledgeBaseRow,
): TopicKnowledgeBaseRecord {
  return topicKnowledgeBaseRecordSchema.parse(row);
}

/**
 * Knowledge repository persists the researched topic authority document that
 * later teaching and curriculum steps should read instead of raw web results.
 */
export function createKnowledgeRepository(database: DbClient = db) {
  return {
    async upsertTopicKnowledgeBase(
      actor: DbActor,
      input: UpsertKnowledgeBaseInput,
    ): Promise<TopicKnowledgeBaseRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertKnowledgeBaseInputSchema.parse(input);
      const [row] = await database
        .insert(topicKnowledgeBase)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoUpdate({
          target: [topicKnowledgeBase.userId, topicKnowledgeBase.topicSlug],
          set: {
            ...validatedInput,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseKnowledgeBaseRow(
        requireMutationRow(row, 'Knowledge base write did not return a row.'),
      );
    },

    async getByTopicSlug(
      actor: DbActor,
      topicSlug: string,
    ): Promise<TopicKnowledgeBaseRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const rows = await database
        .select()
        .from(topicKnowledgeBase)
        .where(
          and(
            eq(topicKnowledgeBase.userId, validatedActor.userId),
            eq(topicKnowledgeBase.topicSlug, validatedTopicSlug),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseKnowledgeBaseRow(row);
    },
  };
}

export const knowledgeRepository = createKnowledgeRepository();
