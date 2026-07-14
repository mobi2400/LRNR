import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import { ragMemory } from '@/db/schema';
import {
  assertDbActor,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  ragEventTypeSchema,
} from '@/db/repository-helpers';
import type { RagMemoryRow } from '@/db/types';

const ragMemoryRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  topicSlug: z.string().nullable(),
  conceptId: z.string().uuid().nullable(),
  conceptSlug: z.string().nullable(),
  eventType: ragEventTypeSchema,
  content: z.string(),
  retrievalText: z.string().nullable(),
  synthesisText: z.string().nullable(),
  embedding: z.array(z.number()).nullable(),
  embeddingVersion: z.string(),
  lexicalSearchText: z.string().nullable(),
  sourceAgent: z.string(),
  sourceId: z.string().uuid().nullable(),
  sourceUri: z.string().nullable(),
  parentDocumentId: z.string().uuid().nullable(),
  chunkOrdinal: z.number().int().nullable(),
  tokenCount: z.number().int().nullable(),
  confidence: z.string(),
  qualityScore: z.string().nullable(),
  isResolved: z.boolean(),
  supersededById: z.string().uuid().nullable(),
  freshnessAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  stalenessReason: z.string().nullable(),
  metadata: jsonObjectSchema,
  idempotencyKey: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const ragMemoryWriteSchema = z.object({
  topicId: z.string().uuid().nullable().optional(),
  topicSlug: z.string().trim().min(1).max(255).nullable().optional(),
  conceptId: z.string().uuid().nullable().optional(),
  conceptSlug: z.string().trim().min(1).max(255).nullable().optional(),
  eventType: ragEventTypeSchema,
  content: z.string().trim().min(1),
  retrievalText: z.string().trim().min(1).nullable().optional(),
  synthesisText: z.string().trim().min(1).nullable().optional(),
  lexicalSearchText: z.string().trim().min(1).nullable().optional(),
  sourceAgent: z.string().trim().min(1).max(255),
  sourceId: z.string().uuid().nullable().optional(),
  sourceUri: z.string().trim().url().nullable().optional(),
  parentDocumentId: z.string().uuid().nullable().optional(),
  chunkOrdinal: z.number().int().min(0).nullable().optional(),
  tokenCount: z.number().int().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  qualityScore: z.number().min(0).max(1).nullable().optional(),
  isResolved: z.boolean().default(false),
  freshnessAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  stalenessReason: z.string().trim().min(1).nullable().optional(),
  metadata: jsonObjectSchema.default({}),
  idempotencyKey: z.string().trim().min(1).max(255).nullable().optional(),
});

const ragQueryInputSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255).optional(),
  conceptSlug: z.string().trim().min(1).max(255).optional(),
  eventType: ragEventTypeSchema.optional(),
  metadataFilters: jsonObjectSchema.optional(),
  unresolvedOnly: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(20),
});

export type RagMemoryRecord = z.infer<typeof ragMemoryRecordSchema>;
export type RagMemoryWriteInput = z.infer<typeof ragMemoryWriteSchema>;
export type RagMemoryQueryInput = z.infer<typeof ragQueryInputSchema>;

function parseRagMemoryRow(row: RagMemoryRow): RagMemoryRecord {
  return ragMemoryRecordSchema.parse(row);
}

/**
 * RAG repository keeps retrieval memory writes meaningful and idempotent so
 * later agents can reuse learner context without turning transcripts into dumps.
 */
export function createRagRepository(database: DbClient = db) {
  return {
    async writeMemory(
      actor: DbActor,
      input: RagMemoryWriteInput,
    ): Promise<RagMemoryRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragMemoryWriteSchema.parse(input);
      const [insertedRow] = await database
        .insert(ragMemory)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
          confidence: validatedInput.confidence.toFixed(4),
          qualityScore:
            validatedInput.qualityScore === undefined ||
            validatedInput.qualityScore === null
              ? null
              : validatedInput.qualityScore.toFixed(4),
        })
        .onConflictDoNothing()
        .returning();

      if (insertedRow !== undefined) {
        return parseRagMemoryRow(insertedRow);
      }

      if (
        validatedInput.idempotencyKey === undefined ||
        validatedInput.idempotencyKey === null
      ) {
        throw new Error(
          'RAG write unexpectedly failed without an idempotency key.',
        );
      }

      const existing = await this.getByIdempotencyKey(
        validatedActor,
        validatedInput.idempotencyKey,
      );

      if (existing === null) {
        throw new Error(
          'RAG write conflict occurred but no existing row could be loaded.',
        );
      }

      return existing;
    },

    async writeMemories(
      actor: DbActor,
      inputs: RagMemoryWriteInput[],
    ): Promise<RagMemoryRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInputs = z.array(ragMemoryWriteSchema).parse(inputs);

      if (validatedInputs.length === 0) {
        return [];
      }

      const insertedRows = await database
        .insert(ragMemory)
        .values(
          validatedInputs.map((input) => ({
            userId: validatedActor.userId,
            ...input,
            confidence: input.confidence.toFixed(4),
            qualityScore:
              input.qualityScore === undefined || input.qualityScore === null
                ? null
                : input.qualityScore.toFixed(4),
          })),
        )
        .onConflictDoNothing()
        .returning();

      if (insertedRows.length === validatedInputs.length) {
        return insertedRows.map(parseRagMemoryRow);
      }

      const records: RagMemoryRecord[] = insertedRows.map(parseRagMemoryRow);
      const insertedKeys = new Set(
        records
          .map((record) => record.idempotencyKey)
          .filter((key): key is string => key !== null),
      );

      for (const input of validatedInputs) {
        if (input.idempotencyKey === undefined || input.idempotencyKey === null) {
          throw new Error(
            'Batched RAG write conflicted for a row without an idempotency key.',
          );
        }

        if (insertedKeys.has(input.idempotencyKey)) {
          continue;
        }

        const existing = await this.getByIdempotencyKey(
          validatedActor,
          input.idempotencyKey,
        );

        if (existing === null) {
          throw new Error(
            'Batched RAG write conflict occurred but no existing row could be loaded.',
          );
        }

        records.push(existing);
      }

      return records;
    },
    async writeOnboardingSeed(
      actor: DbActor,
      input: Omit<RagMemoryWriteInput, 'eventType'>,
    ): Promise<RagMemoryRecord> {
      return this.writeMemory(actor, {
        ...input,
        eventType: 'onboarding_response',
      });
    },

    async writeSessionSummary(
      actor: DbActor,
      input: Omit<RagMemoryWriteInput, 'eventType'>,
    ): Promise<RagMemoryRecord> {
      return this.writeMemory(actor, {
        ...input,
        eventType: 'session_summary',
      });
    },

    async getByIdempotencyKey(
      actor: DbActor,
      idempotencyKey: string,
    ): Promise<RagMemoryRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedKey = z.string().trim().min(1).parse(idempotencyKey);
      const rows = await database
        .select()
        .from(ragMemory)
        .where(
          and(
            eq(ragMemory.userId, validatedActor.userId),
            eq(ragMemory.idempotencyKey, validatedKey),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseRagMemoryRow(row);
    },

    async queryMemory(
      actor: DbActor,
      input?: Partial<RagMemoryQueryInput>,
    ): Promise<RagMemoryRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragQueryInputSchema.parse(input ?? {});
      const baseConditions = [
        eq(ragMemory.userId, validatedActor.userId),
        isNull(ragMemory.supersededById),
        isNull(ragMemory.stalenessReason),
        or(isNull(ragMemory.expiresAt), gt(ragMemory.expiresAt, new Date()))!,
      ];

      if (validatedInput.topicSlug !== undefined) {
        baseConditions.push(eq(ragMemory.topicSlug, validatedInput.topicSlug));
      }

      if (validatedInput.conceptSlug !== undefined) {
        baseConditions.push(
          eq(ragMemory.conceptSlug, validatedInput.conceptSlug),
        );
      }

      if (validatedInput.eventType !== undefined) {
        baseConditions.push(eq(ragMemory.eventType, validatedInput.eventType));
      }

      if (validatedInput.unresolvedOnly) {
        baseConditions.push(eq(ragMemory.isResolved, false));
      }

      if (validatedInput.metadataFilters !== undefined) {
        baseConditions.push(
          sql`${ragMemory.metadata} @> ${JSON.stringify(
            validatedInput.metadataFilters,
          )}::jsonb`,
        );
      }

      const rows = await database
        .select()
        .from(ragMemory)
        .where(and(...baseConditions))
        .orderBy(desc(ragMemory.createdAt), asc(ragMemory.chunkOrdinal))
        .limit(validatedInput.limit);

      return rows.map(parseRagMemoryRow);
    },

    async hasIdempotentWrite(
      actor: DbActor,
      idempotencyKey: string,
    ): Promise<boolean> {
      const existing = await this.getByIdempotencyKey(actor, idempotencyKey);

      return existing !== null;
    },
  };
}

export const ragRepository = createRagRepository();
