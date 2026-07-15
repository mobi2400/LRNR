import { z } from 'zod';

import { ragRepository, type RagRetrievalResult } from '@/db/rag.repo';
import { embeddingModelRegistry, embeddingModelIdSchema, embedTexts } from '@/lib/embeddings';

const ragAgentSchema = z.enum(['architect', 'cartographer', 'curriculum_builder', 'teaching', 'evaluation', 'system']);
const ragIntentSchema = z.enum(['learn', 'review', 'answer_followup', 'diagnose_gap', 'research']);
const ragRiskLevelSchema = z.enum(['low', 'medium', 'high']);
const retrievalModeSchema = z.enum(['lexical', 'vector', 'hybrid']);

export const ragRetrievalDefaults = {
  lexicalCandidates: 20,
  vectorCandidates: 20,
  rrfConstant: 60,
  rerankCandidates: 20,
  finalContextItems: 6,
  refinementAttempts: 1,
} as const;

export const ragFiltersSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255).optional(),
  conceptSlug: z.string().trim().min(1).max(255).optional(),
  unresolvedOnly: z.boolean().default(false),
});

export const ragRetrievalRequestSchema = z.object({
  requestId: z.string().trim().min(1),
  userId: z.string().uuid(),
  agent: ragAgentSchema,
  intent: ragIntentSchema.optional(),
  originalQuery: z.string().trim().min(1).max(1000),
  riskLevel: ragRiskLevelSchema.default('low'),
  retrievalMode: retrievalModeSchema.default('hybrid'),
  filters: ragFiltersSchema.default({ unresolvedOnly: false }),
  allowedEmbeddingModel: embeddingModelIdSchema.default('lrnr-deterministic-1536'),
  finalContextItems: z.number().int().positive().max(10).default(ragRetrievalDefaults.finalContextItems),
});

export const ragRankingSignalsSchema = z.object({
  lexicalRank: z.number().int().positive().nullable(),
  vectorRank: z.number().int().positive().nullable(),
  rrfScore: z.number(),
  recencyScore: z.number(),
  qualityScore: z.number(),
});

export const ragContextItemSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  sourceUri: z.string().nullable(),
  topicSlug: z.string().nullable(),
  conceptSlug: z.string().nullable(),
  embeddingVersion: z.string(),
  rankingSignals: ragRankingSignalsSchema,
});

export const ragRetrievalTraceSchema = z.object({
  requestId: z.string(),
  normalizedQuery: z.string(),
  inferredIntent: ragIntentSchema,
  retrievalMode: retrievalModeSchema,
  lexicalCandidateCount: z.number().int().min(0),
  vectorCandidateCount: z.number().int().min(0),
  finalContextCount: z.number().int().min(0),
  embeddingVersion: z.string(),
});

export const ragContextPackSchema = z.object({
  requestId: z.string(),
  items: z.array(ragContextItemSchema),
  trace: ragRetrievalTraceSchema,
});

export type RagRetrievalRequest = z.input<typeof ragRetrievalRequestSchema>;
export type RagContextPack = z.infer<typeof ragContextPackSchema>;

export interface RagRetrievalRepository {
  retrieveContext(
    actor: { userId: string; requestId?: string },
    input: {
      topicSlug?: string;
      conceptSlug?: string;
      query?: string;
      queryEmbedding?: number[];
      embeddingVersion?: string;
      candidateLimit?: number;
      finalLimit?: number;
      unresolvedOnly?: boolean;
    },
  ): Promise<RagRetrievalResult>;
}

export function normalizeRetrievalQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

export function inferRetrievalIntent(query: string): z.infer<typeof ragIntentSchema> {
  const normalized = query.toLowerCase();

  if (/gap|confus|weak|mistake/.test(normalized)) {
    return 'diagnose_gap';
  }

  if (/review|recap|revise/.test(normalized)) {
    return 'review';
  }

  if (/research|source|paper|latest/.test(normalized)) {
    return 'research';
  }

  if (/\?|how|why|what/.test(normalized)) {
    return 'answer_followup';
  }

  return 'learn';
}

export function reciprocalRankFusion(input: {
  lexicalIds: string[];
  vectorIds: string[];
  constant?: number;
}): Map<string, { lexicalRank: number | null; vectorRank: number | null; rrfScore: number }> {
  const constant = input.constant ?? ragRetrievalDefaults.rrfConstant;
  const scores = new Map<string, { lexicalRank: number | null; vectorRank: number | null; rrfScore: number }>();

  function add(id: string, rank: number, kind: 'lexicalRank' | 'vectorRank') {
    const existing = scores.get(id) ?? { lexicalRank: null, vectorRank: null, rrfScore: 0 };
    scores.set(id, {
      ...existing,
      [kind]: rank,
      rrfScore: existing.rrfScore + 1 / (constant + rank),
    });
  }

  input.lexicalIds.forEach((id, index) => add(id, index + 1, 'lexicalRank'));
  input.vectorIds.forEach((id, index) => add(id, index + 1, 'vectorRank'));

  return scores;
}

export async function retrieveRagContext(
  request: RagRetrievalRequest,
  dependencies: { repository?: RagRetrievalRepository } = {},
): Promise<RagContextPack> {
  const validated = ragRetrievalRequestSchema.parse(request);
  const repository = dependencies.repository ?? ragRepository;
  const normalizedQuery = normalizeRetrievalQuery(validated.originalQuery);
  const config = embeddingModelRegistry[validated.allowedEmbeddingModel];
  const embedding =
    validated.retrievalMode === 'lexical'
      ? undefined
      : (
          await embedTexts({
            model: validated.allowedEmbeddingModel,
            values: [{ id: validated.requestId, text: normalizedQuery }],
          })
        )[0]?.vector;

  const retrievalInput: Parameters<RagRetrievalRepository['retrieveContext']>[1] = {
    embeddingVersion: config.embeddingVersion,
    candidateLimit: ragRetrievalDefaults.rerankCandidates,
    finalLimit: validated.finalContextItems,
    unresolvedOnly: validated.filters.unresolvedOnly,
  };

  if (validated.filters.topicSlug !== undefined) {
    retrievalInput.topicSlug = validated.filters.topicSlug;
  }

  if (validated.filters.conceptSlug !== undefined) {
    retrievalInput.conceptSlug = validated.filters.conceptSlug;
  }

  if (validated.retrievalMode !== 'vector') {
    retrievalInput.query = normalizedQuery;
  }

  if (embedding !== undefined) {
    retrievalInput.queryEmbedding = embedding;
  }

  const result = await repository.retrieveContext(
    { userId: validated.userId, requestId: validated.requestId },
    retrievalInput,
  );
  const fused = reciprocalRankFusion({
    lexicalIds: result.items.map((item) => item.id),
    vectorIds: result.items.map((item) => item.id),
  });

  return ragContextPackSchema.parse({
    requestId: validated.requestId,
    items: result.items.map((item) => {
      const signals = fused.get(item.id) ?? { lexicalRank: null, vectorRank: null, rrfScore: item.score };

      return {
        id: item.id,
        content: item.content,
        sourceUri: item.sourceUri,
        topicSlug: item.topicSlug,
        conceptSlug: item.conceptSlug,
        embeddingVersion: item.embeddingVersion,
        rankingSignals: {
          ...signals,
          recencyScore: item.createdAt.getTime(),
          qualityScore: Number(item.confidence),
        },
      };
    }),
    trace: {
      requestId: validated.requestId,
      normalizedQuery,
      inferredIntent: validated.intent ?? inferRetrievalIntent(normalizedQuery),
      retrievalMode: validated.retrievalMode,
      lexicalCandidateCount: result.lexicalCandidateCount,
      vectorCandidateCount: result.vectorCandidateCount,
      finalContextCount: result.finalContextCount,
      embeddingVersion: result.embeddingVersion,
    },
  });
}
