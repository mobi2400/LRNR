import { and, desc, eq, gt, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
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

const ragMemorySummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicSlug: z.string().nullable(),
  conceptSlug: z.string().nullable(),
  eventType: ragEventTypeSchema,
  sourceAgent: z.string(),
  sourceId: z.string().uuid().nullable(),
  sourceUri: z.string().nullable(),
  confidence: z.string(),
  qualityScore: z.string().nullable(),
  isResolved: z.boolean(),
  tokenCount: z.number().int().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const ragRetrievalContextItemSchema = z.object({
  id: z.string().uuid(),
  topicSlug: z.string().nullable(),
  conceptSlug: z.string().nullable(),
  eventType: ragEventTypeSchema,
  content: z.string(),
  sourceAgent: z.string(),
  sourceUri: z.string().nullable(),
  confidence: z.string(),
  embeddingVersion: z.string(),
  score: z.number(),
  createdAt: z.date(),
});

const ragRetrievalResultSchema = z.object({
  items: z.array(ragRetrievalContextItemSchema),
  lexicalCandidateCount: z.number().int().min(0),
  vectorCandidateCount: z.number().int().min(0),
  finalContextCount: z.number().int().min(0),
  embeddingVersion: z.string(),
});

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

const createdAtIdCursorSchema = z.object({
  createdAt: z.date(),
  id: z.string().uuid(),
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

const ragRetrievalInputSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255).optional(),
  conceptSlug: z.string().trim().min(1).max(255).optional(),
  eventType: ragEventTypeSchema.optional(),
  query: z.string().trim().min(1).max(1000).optional(),
  queryEmbedding: z.array(z.number()).length(1536).optional(),
  embeddingVersion: z.string().trim().min(1).max(80).default('v1'),
  candidateLimit: z.number().int().positive().max(50).default(25),
  finalLimit: z.number().int().positive().max(10).default(6),
  unresolvedOnly: z.boolean().default(false),
});

const ragQueryInputSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255).optional(),
  conceptSlug: z.string().trim().min(1).max(255).optional(),
  eventType: ragEventTypeSchema.optional(),
  metadataFilters: jsonObjectSchema.optional(),
  unresolvedOnly: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(20),
  cursor: createdAtIdCursorSchema.optional(),
});

export type RagRetrievalContextItem = z.infer<typeof ragRetrievalContextItemSchema>;
export type RagRetrievalResult = z.infer<typeof ragRetrievalResultSchema>;
export type RagRetrievalInput = z.infer<typeof ragRetrievalInputSchema>;
export type RagMemorySummary = z.infer<typeof ragMemorySummarySchema>;
export type RagMemoryRecord = z.infer<typeof ragMemoryRecordSchema>;
export type RagMemoryWriteInput = z.infer<typeof ragMemoryWriteSchema>;
export type RagMemoryQueryInput = z.infer<typeof ragQueryInputSchema>;

function parseRagMemoryRow(row: RagMemoryRow): RagMemoryRecord {
  return ragMemoryRecordSchema.parse(row);
}

function parseRagMemorySummary(row: unknown): RagMemorySummary {
  return ragMemorySummarySchema.parse(row);
}

function buildActiveRagConditions(
  userId: string,
  input: {
    topicSlug?: string | undefined;
    conceptSlug?: string | undefined;
    eventType?: z.infer<typeof ragEventTypeSchema> | undefined;
    unresolvedOnly?: boolean | undefined;
    embeddingVersion?: string | undefined;
  },
) {
  const conditions = [
    eq(ragMemory.userId, userId),
    isNull(ragMemory.supersededById),
    isNull(ragMemory.stalenessReason),
    or(isNull(ragMemory.expiresAt), gt(ragMemory.expiresAt, new Date()))!,
  ];

  if (input.embeddingVersion !== undefined) {
    conditions.push(eq(ragMemory.embeddingVersion, input.embeddingVersion));
  }

  if (input.topicSlug !== undefined) {
    conditions.push(eq(ragMemory.topicSlug, input.topicSlug));
  }

  if (input.conceptSlug !== undefined) {
    conditions.push(eq(ragMemory.conceptSlug, input.conceptSlug));
  }

  if (input.eventType !== undefined) {
    conditions.push(eq(ragMemory.eventType, input.eventType));
  }

  if (input.unresolvedOnly === true) {
    conditions.push(eq(ragMemory.isResolved, false));
  }

  return conditions;
}

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export function createRagRepository(database: DbClient = db) {
  return {
    async writeMemory(actor: DbActor, input: RagMemoryWriteInput): Promise<RagMemoryRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragMemoryWriteSchema.parse(input);
      const [insertedRow] = await database
        .insert(ragMemory)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
          confidence: validatedInput.confidence.toFixed(4),
          qualityScore:
            validatedInput.qualityScore === undefined || validatedInput.qualityScore === null
              ? null
              : validatedInput.qualityScore.toFixed(4),
        })
        .onConflictDoNothing()
        .returning();

      if (insertedRow !== undefined) {
        return parseRagMemoryRow(insertedRow);
      }

      if (validatedInput.idempotencyKey === undefined || validatedInput.idempotencyKey === null) {
        throw new Error('RAG write unexpectedly failed without an idempotency key.');
      }

      const existing = await this.getByIdempotencyKey(validatedActor, validatedInput.idempotencyKey);

      if (existing === null) {
        throw new Error('RAG write conflict occurred but no existing row could be loaded.');
      }

      return existing;
    },

    async writeMemories(actor: DbActor, inputs: RagMemoryWriteInput[]): Promise<RagMemoryRecord[]> {
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
        records.map((record) => record.idempotencyKey).filter((key): key is string => key !== null),
      );

      for (const input of validatedInputs) {
        if (input.idempotencyKey === undefined || input.idempotencyKey === null) {
          throw new Error('Batched RAG write conflicted for a row without an idempotency key.');
        }

        if (insertedKeys.has(input.idempotencyKey)) {
          continue;
        }

        const existing = await this.getByIdempotencyKey(validatedActor, input.idempotencyKey);

        if (existing === null) {
          throw new Error('Batched RAG write conflict occurred but no existing row could be loaded.');
        }

        records.push(existing);
      }

      return records;
    },

    async writeOnboardingSeed(
      actor: DbActor,
      input: Omit<RagMemoryWriteInput, 'eventType'>,
    ): Promise<RagMemoryRecord> {
      return this.writeMemory(actor, { ...input, eventType: 'onboarding_response' });
    },

    async writeSessionSummary(
      actor: DbActor,
      input: Omit<RagMemoryWriteInput, 'eventType'>,
    ): Promise<RagMemoryRecord> {
      return this.writeMemory(actor, { ...input, eventType: 'session_summary' });
    },

    async getByIdempotencyKey(actor: DbActor, idempotencyKey: string): Promise<RagMemoryRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedKey = z.string().trim().min(1).parse(idempotencyKey);
      const rows = await database
        .select()
        .from(ragMemory)
        .where(and(eq(ragMemory.userId, validatedActor.userId), eq(ragMemory.idempotencyKey, validatedKey)))
        .limit(1);
      const row = getOneOrNull(rows);

      return row === null ? null : parseRagMemoryRow(row);
    },

    async queryMemory(actor: DbActor, input?: Partial<RagMemoryQueryInput>): Promise<RagMemoryRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragQueryInputSchema.parse(input ?? {});
      const baseConditions = buildActiveRagConditions(validatedActor.userId, validatedInput);

      if (validatedInput.cursor !== undefined) {
        baseConditions.push(
          or(
            lt(ragMemory.createdAt, validatedInput.cursor.createdAt),
            and(eq(ragMemory.createdAt, validatedInput.cursor.createdAt), lt(ragMemory.id, validatedInput.cursor.id)),
          )!,
        );
      }

      if (validatedInput.metadataFilters !== undefined) {
        baseConditions.push(sql`${ragMemory.metadata} @> ${JSON.stringify(validatedInput.metadataFilters)}::jsonb`);
      }

      const rows = await database
        .select()
        .from(ragMemory)
        .where(and(...baseConditions))
        .orderBy(desc(ragMemory.createdAt), desc(ragMemory.id))
        .limit(validatedInput.limit);

      return rows.map(parseRagMemoryRow);
    },

    async listMemorySummaries(actor: DbActor, input?: Partial<RagMemoryQueryInput>): Promise<RagMemorySummary[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragQueryInputSchema.parse(input ?? {});
      const conditions = buildActiveRagConditions(validatedActor.userId, validatedInput);

      if (validatedInput.cursor !== undefined) {
        conditions.push(
          or(
            lt(ragMemory.createdAt, validatedInput.cursor.createdAt),
            and(eq(ragMemory.createdAt, validatedInput.cursor.createdAt), lt(ragMemory.id, validatedInput.cursor.id)),
          )!,
        );
      }

      if (validatedInput.metadataFilters !== undefined) {
        conditions.push(sql`${ragMemory.metadata} @> ${JSON.stringify(validatedInput.metadataFilters)}::jsonb`);
      }

      const rows = await database
        .select({
          id: ragMemory.id,
          userId: ragMemory.userId,
          topicSlug: ragMemory.topicSlug,
          conceptSlug: ragMemory.conceptSlug,
          eventType: ragMemory.eventType,
          sourceAgent: ragMemory.sourceAgent,
          sourceId: ragMemory.sourceId,
          sourceUri: ragMemory.sourceUri,
          confidence: ragMemory.confidence,
          qualityScore: ragMemory.qualityScore,
          isResolved: ragMemory.isResolved,
          tokenCount: ragMemory.tokenCount,
          createdAt: ragMemory.createdAt,
          updatedAt: ragMemory.updatedAt,
        })
        .from(ragMemory)
        .where(and(...conditions))
        .orderBy(desc(ragMemory.createdAt), desc(ragMemory.id))
        .limit(validatedInput.limit);

      return rows.map(parseRagMemorySummary);
    },

    async retrieveContext(actor: DbActor, input?: Partial<RagRetrievalInput>): Promise<RagRetrievalResult> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = ragRetrievalInputSchema.parse(input ?? {});
      const baseConditions = buildActiveRagConditions(validatedActor.userId, {
        topicSlug: validatedInput.topicSlug,
        conceptSlug: validatedInput.conceptSlug,
        eventType: validatedInput.eventType,
        unresolvedOnly: validatedInput.unresolvedOnly,
        embeddingVersion: validatedInput.embeddingVersion,
      });
      const contextProjection = {
        id: ragMemory.id,
        topicSlug: ragMemory.topicSlug,
        conceptSlug: ragMemory.conceptSlug,
        eventType: ragMemory.eventType,
        content: sql<string>`coalesce(${ragMemory.synthesisText}, ${ragMemory.retrievalText}, ${ragMemory.content})`,
        sourceAgent: ragMemory.sourceAgent,
        sourceUri: ragMemory.sourceUri,
        confidence: ragMemory.confidence,
        embeddingVersion: ragMemory.embeddingVersion,
        createdAt: ragMemory.createdAt,
      };

      const lexicalRows =
        validatedInput.query === undefined
          ? []
          : await database
              .select({ ...contextProjection, score: sql<number>`1` })
              .from(ragMemory)
              .where(
                and(
                  ...baseConditions,
                  or(
                    ilike(ragMemory.content, `%${validatedInput.query}%`),
                    ilike(ragMemory.retrievalText, `%${validatedInput.query}%`),
                    ilike(ragMemory.lexicalSearchText, `%${validatedInput.query}%`),
                  )!,
                ),
              )
              .orderBy(desc(ragMemory.createdAt), desc(ragMemory.id))
              .limit(validatedInput.candidateLimit);

      const vectorRows =
        validatedInput.queryEmbedding === undefined
          ? []
          : await database
              .select({
                ...contextProjection,
                score: sql<number>`1 - (${ragMemory.embedding} <=> ${vectorLiteral(validatedInput.queryEmbedding)}::vector)`,
              })
              .from(ragMemory)
              .where(and(...baseConditions, isNotNull(ragMemory.embedding)))
              .orderBy(sql`${ragMemory.embedding} <=> ${vectorLiteral(validatedInput.queryEmbedding)}::vector`)
              .limit(validatedInput.candidateLimit);

      const merged = new Map<string, RagRetrievalContextItem>();

      for (const row of [...lexicalRows, ...vectorRows]) {
        const parsed = ragRetrievalContextItemSchema.parse(row);
        const existing = merged.get(parsed.id);

        if (existing === undefined || parsed.score > existing.score) {
          merged.set(parsed.id, parsed);
        }
      }

      const items = [...merged.values()]
        .sort((left, right) => right.score - left.score || right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, validatedInput.finalLimit);

      return ragRetrievalResultSchema.parse({
        items,
        lexicalCandidateCount: lexicalRows.length,
        vectorCandidateCount: vectorRows.length,
        finalContextCount: items.length,
        embeddingVersion: validatedInput.embeddingVersion,
      });
    },

    async hasIdempotentWrite(actor: DbActor, idempotencyKey: string): Promise<boolean> {
      const existing = await this.getByIdempotencyKey(actor, idempotencyKey);

      return existing !== null;
    },
  };
}

export const ragRepository = createRagRepository();
