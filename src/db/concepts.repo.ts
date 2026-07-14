import { and, asc, eq, gt, or } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import { conceptPrerequisites, concepts } from '@/db/schema';
import { AppError } from '@/server/errors';
import type { ConceptPrerequisiteRow, ConceptRow } from '@/db/types';

const conceptRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicSlug: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  difficulty: z.number().int().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

const conceptPrerequisiteRecordSchema = z.object({
  userId: z.string().uuid(),
  topicSlug: z.string(),
  conceptId: z.string().uuid(),
  prerequisiteConceptId: z.string().uuid(),
  strength: z.string(),
  reason: z.string().nullable(),
  createdAt: z.date(),
});

const upsertConceptInputSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(4000).nullable().optional(),
  difficulty: z.number().int().min(0).max(10).nullable().optional(),
  metadata: jsonObjectSchema.default({}),
});

const conceptAlphaCursorSchema = z.object({
  slug: z.string().trim().min(1).max(255),
  id: z.string().uuid(),
});

const listConceptsInputSchema = z.object({
  limit: z.number().int().positive().max(100).default(50),
  cursor: conceptAlphaCursorSchema.optional(),
});

const replaceConceptPrerequisitesInputSchema = z.object({
  conceptId: z.string().uuid(),
  topicSlug: z.string().trim().min(1).max(255),
  prerequisites: z.array(
    z.object({
      prerequisiteConceptId: z.string().uuid(),
      strength: z.string().trim().min(1).max(255).default('required'),
      reason: z.string().trim().min(1).max(2000).nullable().optional(),
    }),
  ),
});

export type ConceptRecord = z.infer<typeof conceptRecordSchema>;
export type ConceptPrerequisiteRecord = z.infer<
  typeof conceptPrerequisiteRecordSchema
>;

function parseConceptRow(row: ConceptRow): ConceptRecord {
  return conceptRecordSchema.parse(row);
}

function parseConceptPrerequisiteRow(
  row: ConceptPrerequisiteRow,
): ConceptPrerequisiteRecord {
  return conceptPrerequisiteRecordSchema.parse(row);
}

/**
 * Concepts repository gives curriculum generation explicit concept nodes and
 * prerequisite edges instead of hiding all dependency ordering inside JSON.
 */
export function createConceptsRepository(database: DbClient = db) {
  return {
    async upsertConcept(
      actor: DbActor,
      input: z.infer<typeof upsertConceptInputSchema>,
    ): Promise<ConceptRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertConceptInputSchema.parse(input);
      const [row] = await database
        .insert(concepts)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoUpdate({
          target: [concepts.userId, concepts.topicSlug, concepts.slug],
          set: {
            name: validatedInput.name,
            summary: validatedInput.summary ?? null,
            difficulty: validatedInput.difficulty ?? null,
            metadata: validatedInput.metadata,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseConceptRow(
        requireMutationRow(row, 'Concept write did not return a row.'),
      );
    },

    async listByTopicSlug(
      actor: DbActor,
      topicSlug: string,
      input?: Partial<z.infer<typeof listConceptsInputSchema>>,
    ): Promise<ConceptRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedTopicSlug = z.string().trim().min(1).parse(topicSlug);
      const validatedInput = listConceptsInputSchema.parse(input ?? {});
      const conditions = [
        eq(concepts.userId, validatedActor.userId),
        eq(concepts.topicSlug, validatedTopicSlug),
      ];

      if (validatedInput.cursor !== undefined) {
        conditions.push(
          or(
            gt(concepts.slug, validatedInput.cursor.slug),
            and(
              eq(concepts.slug, validatedInput.cursor.slug),
              gt(concepts.id, validatedInput.cursor.id),
            ),
          )!,
        );
      }

      const rows = await database
        .select()
        .from(concepts)
        .where(and(...conditions))
        .orderBy(asc(concepts.slug), asc(concepts.id))
        .limit(validatedInput.limit);

      return rows.map(parseConceptRow);
    },

    async replaceConceptPrerequisites(
      actor: DbActor,
      input: z.infer<typeof replaceConceptPrerequisitesInputSchema>,
    ): Promise<ConceptPrerequisiteRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = replaceConceptPrerequisitesInputSchema.parse(input);
      const conceptRow = getOneOrNull(
        await database
          .select()
          .from(concepts)
          .where(
            and(
              eq(concepts.id, validatedInput.conceptId),
              eq(concepts.userId, validatedActor.userId),
            ),
          )
          .limit(1),
      );

      if (conceptRow === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Concept not found for the current owner.',
          status: 404,
        });
      }

      return database.transaction(async (transaction) => {
        await transaction
          .delete(conceptPrerequisites)
          .where(
            and(
              eq(conceptPrerequisites.userId, validatedActor.userId),
              eq(conceptPrerequisites.conceptId, validatedInput.conceptId),
            ),
          );

        if (validatedInput.prerequisites.length === 0) {
          return [];
        }

        const rows = await transaction
          .insert(conceptPrerequisites)
          .values(
            validatedInput.prerequisites.map((prerequisite) => ({
              userId: validatedActor.userId,
              topicSlug: validatedInput.topicSlug,
              conceptId: validatedInput.conceptId,
              prerequisiteConceptId: prerequisite.prerequisiteConceptId,
              strength: prerequisite.strength,
              reason: prerequisite.reason ?? null,
            })),
          )
          .returning();

        return rows.map(parseConceptPrerequisiteRow);
      });
    },
  };
}

export const conceptsRepository = createConceptsRepository();
