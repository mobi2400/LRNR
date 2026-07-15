import { createHash } from 'node:crypto';

import pLimit from 'p-limit';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

import { appLogger } from '@/lib/logger';
import { incrementMetric, observeMetric } from '@/server/metrics';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/embeddings.ts');

export const embeddingModelIdSchema = z.enum(['lrnr-deterministic-1536']);

export const embeddingModelRegistry = {
  'lrnr-deterministic-1536': {
    model: 'lrnr-deterministic-1536',
    provider: 'deterministic-test',
    dimensions: 1536,
    embeddingVersion: 'deterministic-1536-v1',
    normalizationVersion: 'canonical-text-v1',
    maxBatchSize: 32,
    maxConcurrency: 2,
  },
} as const;

export type EmbeddingModelId = z.infer<typeof embeddingModelIdSchema>;
export type EmbeddingModelConfig = (typeof embeddingModelRegistry)[EmbeddingModelId];

export const embeddingInputSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1).max(20_000),
  contentHash: z.string().length(64).optional(),
});

export const embeddingVectorSchema = z.array(z.number().finite()).length(1536);

export const embeddingResultSchema = z.object({
  id: z.string(),
  contentHash: z.string().length(64),
  vector: embeddingVectorSchema,
  model: embeddingModelIdSchema,
  embeddingVersion: z.string(),
  normalizationVersion: z.string(),
  dimensions: z.literal(1536),
});

export type EmbeddingInput = z.input<typeof embeddingInputSchema>;
export type EmbeddingResult = z.infer<typeof embeddingResultSchema>;

export interface EmbeddingProvider {
  embedBatch(input: {
    texts: string[];
    config: EmbeddingModelConfig;
    signal: AbortSignal;
  }): Promise<number[][]>;
}

const embeddingCache = new Map<string, EmbeddingResult>();

export function canonicalizeEmbeddingText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function hashEmbeddingContent(value: string): string {
  return createHash('sha256').update(canonicalizeEmbeddingText(value), 'utf8').digest('hex');
}

function deterministicVector(text: string, dimensions: number): number[] {
  const seed = createHash('sha256').update(text, 'utf8').digest();
  const vector: number[] = [];

  for (let index = 0; index < dimensions; index += 1) {
    const byte = seed[index % seed.length] ?? 0;
    vector.push((byte / 127.5) - 1);
  }

  return vector;
}

export const deterministicEmbeddingProvider: EmbeddingProvider = {
  async embedBatch(input) {
    if (input.signal.aborted) {
      throw new AbortError('Embedding request aborted before start.');
    }

    return input.texts.map((text) => deterministicVector(text, input.config.dimensions));
  },
};

async function withTimeout<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function validateVectors(vectors: number[][], config: EmbeddingModelConfig): number[][] {
  return vectors.map((vector) => {
    if (vector.length !== config.dimensions) {
      throw new AbortError(`Embedding dimension mismatch for ${config.model}.`);
    }

    if (!vector.every(Number.isFinite)) {
      throw new AbortError(`Embedding vector contains non-finite numbers for ${config.model}.`);
    }

    return vector;
  });
}

export async function embedTexts(input: {
  values: EmbeddingInput[];
  model: EmbeddingModelId;
  provider?: EmbeddingProvider;
  timeoutMs?: number;
  useCache?: boolean;
}): Promise<EmbeddingResult[]> {
  const config = embeddingModelRegistry[embeddingModelIdSchema.parse(input.model)];
  const provider = input.provider ?? deterministicEmbeddingProvider;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const useCache = input.useCache ?? true;
  const validated = z.array(embeddingInputSchema).max(config.maxBatchSize).parse(input.values);
  const byHash = new Map<string, { id: string; text: string; contentHash: string }>();

  for (const item of validated) {
    const text = canonicalizeEmbeddingText(item.text);
    const contentHash = item.contentHash ?? hashEmbeddingContent(text);

    if (!byHash.has(contentHash)) {
      byHash.set(contentHash, { id: item.id, text, contentHash });
    }
  }

  const uniqueItems = [...byHash.values()];
  const limit = pLimit(config.maxConcurrency);
  const startedAt = performance.now();
  const generated = await Promise.all(
    uniqueItems.map((item) =>
      limit(async () => {
        const cacheKey = `${config.embeddingVersion}:${config.normalizationVersion}:${item.contentHash}`;
        const cached = useCache ? embeddingCache.get(cacheKey) : undefined;

        if (cached !== undefined) {
          incrementMetric('embedding_cache_access_total', { result: 'hit', model: config.model });
          return cached;
        }

        incrementMetric('embedding_cache_access_total', { result: 'miss', model: config.model });

        const [vector] = await pRetry(
          () =>
            withTimeout(timeoutMs, async (signal) => {
              const vectors = await provider.embedBatch({ texts: [item.text], config, signal });
              return validateVectors(vectors, config);
            }),
          {
            retries: 2,
            factor: 2,
            minTimeout: 100,
            maxTimeout: 1_000,
            randomize: true,
            onFailedAttempt(error) {
              appLogger.warn('embedding.retry', {
                model: config.model,
                attemptNumber: error.attemptNumber,
                retriesLeft: error.retriesLeft,
              });
            },
          },
        );

        const result = embeddingResultSchema.parse({
          id: item.id,
          contentHash: item.contentHash,
          vector,
          model: config.model,
          embeddingVersion: config.embeddingVersion,
          normalizationVersion: config.normalizationVersion,
          dimensions: config.dimensions,
        });

        if (useCache) {
          embeddingCache.set(cacheKey, result);
        }

        return result;
      }),
    ),
  );

  const byContentHash = new Map(generated.map((result) => [result.contentHash, result]));
  observeMetric('embedding_batch_latency_ms', performance.now() - startedAt, { model: config.model });
  observeMetric('embedding_batch_size', validated.length, { model: config.model });

  return validated.map((item) => {
    const contentHash = item.contentHash ?? hashEmbeddingContent(item.text);
    const result = byContentHash.get(contentHash);

    if (result === undefined) {
      throw new Error('Embedding result missing after deduplication.');
    }

    return { ...result, id: item.id };
  });
}

export function validateQueryEmbedding(input: {
  vector: number[];
  embeddingVersion: string;
  model: EmbeddingModelId;
}): void {
  const config = embeddingModelRegistry[embeddingModelIdSchema.parse(input.model)];

  if (input.embeddingVersion !== config.embeddingVersion) {
    throw new Error('Query embedding version does not match selected model registry.');
  }

  validateVectors([input.vector], config);
}

export function resetEmbeddingCacheForTests(): void {
  embeddingCache.clear();
}
