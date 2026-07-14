import { and, desc, eq, lt, or } from 'drizzle-orm';
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
import { topicBriefs } from '@/db/schema';
import type { TopicBriefRow } from '@/db/types';

const topicBriefRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicSlug: z.string(),
  title: z.string(),
  goal: z.string(),
  requiredDepth: z.string(),
  learnerContext: jsonObjectSchema,
  prerequisiteMap: jsonArraySchema,
  conceptOutline: jsonArraySchema,
  masteryIntent: jsonObjectSchema,
  sourceAgent: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const upsertTopicBriefInputSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  goal: z.string().trim().min(1).max(4000),
  requiredDepth: z.string().trim().min(1).max(255),
  learnerContext: jsonObjectSchema.default({}),
  prerequisiteMap: jsonArraySchema.default([]),
  conceptOutline: jsonArraySchema.default([]),
  masteryIntent: jsonObjectSchema.default({}),
  sourceAgent: z.string().trim().min(1).max(255).default('architect_node'),
});

const topicBriefCursorSchema = z.object({
  createdAt: z.date(),
  id: z.string().uuid(),
});

const listRecentBriefsInputSchema = z.object({
  limit: z.number().int().positive().max(50).default(10),
  cursor: topicBriefCursorSchema.optional(),
});

export type TopicBriefRecord = z.infer<typeof topicBriefRecordSchema>;
export type UpsertTopicBriefInput = z.infer<typeof upsertTopicBriefInputSchema>;

function parseTopicBriefRow(row: TopicBriefRow): TopicBriefRecord {
  return topicBriefRecordSchema.parse(row);
}

/**
 * Topic-brief repository owns the Architect handoff rows that connect a user,
 * a topic slug, and the structured onboarding/context summary for that topic.
 */
export function createTopicBriefsRepository(database: DbClient = db) {
  return {
    async createTopicBrief(
      actor: DbActor,
      input: UpsertTopicBriefInput,
    ): Promise<TopicBriefRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertTopicBriefInputSchema.parse(input);
      const [row] = await database
        .insert(topicBriefs)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoUpdate({
          target: [topicBriefs.userId, topicBriefs.topicSlug],
          set: {
            ...validatedInput,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseTopicBriefRow(
        requireMutationRow(row, 'Topic brief write did not return a row.'),
      );
    },

    async getByTopicSlug(
      actor: DbActor,
      topicSlug: string,
    ): Promise<TopicBriefRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const rows = await database
        .select()
        .from(topicBriefs)
        .where(
          and(
            eq(topicBriefs.userId, validatedActor.userId),
            eq(topicBriefs.topicSlug, validatedTopicSlug),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseTopicBriefRow(row);
    },

    async listRecentBriefs(
      actor: DbActor,
      input?: Partial<z.infer<typeof listRecentBriefsInputSchema>>,
    ): Promise<TopicBriefRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = listRecentBriefsInputSchema.parse(input ?? {});
      const conditions = [eq(topicBriefs.userId, validatedActor.userId)];

      if (validatedInput.cursor !== undefined) {
        conditions.push(
          or(
            lt(topicBriefs.createdAt, validatedInput.cursor.createdAt),
            and(
              eq(topicBriefs.createdAt, validatedInput.cursor.createdAt),
              lt(topicBriefs.id, validatedInput.cursor.id),
            ),
          )!,
        );
      }

      const rows = await database
        .select()
        .from(topicBriefs)
        .where(and(...conditions))
        .orderBy(desc(topicBriefs.createdAt), desc(topicBriefs.id))
        .limit(validatedInput.limit);

      return rows.map(parseTopicBriefRow);
    },
  };
}

export const topicBriefsRepository = createTopicBriefsRepository();
