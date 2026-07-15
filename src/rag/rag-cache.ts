import { createHash } from 'node:crypto';

import { z } from 'zod';

const ragCacheSchemaVersion = 'rag-cache-v1';
const ragRetrievalConfigVersion = 'retrieval-config-v1';

export const ragCacheKindSchema = z.enum(['embedding', 'candidate_ids', 'rerank_result', 'context_pack']);

export const ragCacheKeyInputSchema = z.object({
  environment: z.string().min(1),
  kind: ragCacheKindSchema,
  userId: z.string().uuid(),
  normalizedQuery: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).default({}),
  embeddingVersion: z.string().min(1),
  rerankerVersion: z.string().min(1).default('deterministic-rerank-v1'),
  corpusGeneration: z.string().min(1).default('corpus-v1'),
});

export const ragCacheEnvelopeSchema = z.object({
  schemaVersion: z.literal(ragCacheSchemaVersion),
  cachedAt: z.string().datetime(),
  ttlSeconds: z.number().int().positive(),
  value: z.unknown(),
});

export type RagCacheKeyInput = z.input<typeof ragCacheKeyInputSchema>;
export type RagCacheEnvelope = z.infer<typeof ragCacheEnvelopeSchema>;

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, Object.keys(value as object).sort()), 'utf8').digest('hex');
}

export function buildRagCacheKey(input: RagCacheKeyInput): string {
  const validated = ragCacheKeyInputSchema.parse(input);
  const queryHash = stableHash(validated.normalizedQuery);
  const filterHash = stableHash(validated.filters);
  const userNamespace = stableHash(validated.userId).slice(0, 24);

  return [
    'lrnr',
    validated.environment,
    ragCacheSchemaVersion,
    validated.kind,
    `user:${userNamespace}`,
    `query:${queryHash}`,
    `filters:${filterHash}`,
    `retrieval:${ragRetrievalConfigVersion}`,
    `embedding:${validated.embeddingVersion}`,
    `reranker:${validated.rerankerVersion}`,
    `corpus:${validated.corpusGeneration}`,
  ].join(':');
}

export function ragCacheTtlSeconds(kind: z.infer<typeof ragCacheKindSchema>): number {
  switch (kind) {
    case 'embedding':
      return 60 * 60 * 24 * 7;
    case 'candidate_ids':
      return 60 * 10;
    case 'rerank_result':
      return 60 * 10;
    case 'context_pack':
      return 60 * 5;
  }
}

export function createRagCacheEnvelope(input: { kind: z.infer<typeof ragCacheKindSchema>; value: unknown; now?: Date }): RagCacheEnvelope {
  return ragCacheEnvelopeSchema.parse({
    schemaVersion: ragCacheSchemaVersion,
    cachedAt: (input.now ?? new Date()).toISOString(),
    ttlSeconds: ragCacheTtlSeconds(input.kind),
    value: input.value,
  });
}

export function buildRagInvalidationPrefix(input: { environment: string; userId: string }): string {
  const userNamespace = stableHash(z.string().uuid().parse(input.userId)).slice(0, 24);

  return ['lrnr', input.environment, ragCacheSchemaVersion, '', `user:${userNamespace}`].join(':');
}
