import { createHash } from 'node:crypto';

import pLimit from 'p-limit';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

import { appLogger } from '@/lib/logger';
import { serverConfig } from '@/server/config';
import { incrementMetric, observeMetric } from '@/server/metrics';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/embeddings.ts');

export const embeddingModelIdSchema = z.enum([
  'lrnr-deterministic-1536',
  'gemini-embedding-1536',
]);

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
  // Real Gemini embeddings, dimension-reduced to 1536 so they drop into the
  // existing vector(1536) columns without a migration.
  'gemini-embedding-1536': {
    model: 'gemini-embedding-1536',
    provider: 'gemini',
    dimensions: 1536,
    embeddingVersion: 'gemini-embedding-001-1536-v1',
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

const GEMINI_EMBED_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const geminiEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number().finite()) })).min(1),
});

/**
 * Real Gemini embeddings via batchEmbedContents. The output is reduced to the
 * registry dimension so it fits the existing vector columns. A 4xx aborts (bad
 * key/model); embedTexts owns the retry/timeout budget around this call.
 */
export const geminiEmbeddingProvider: EmbeddingProvider = {
  async embedBatch(input) {
    const apiModel = serverConfig.providers.embeddingModel;
    const response = await fetch(
      `${GEMINI_EMBED_BASE_URL}/${apiModel}:batchEmbedContents`,
      {
        method: 'POST',
        signal: input.signal,
        headers: {
          'x-goog-api-key': serverConfig.providers.embeddingApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requests: input.texts.map((text) => ({
            model: `models/${apiModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: input.config.dimensions,
          })),
        }),
      },
    );

    if (!response.ok) {
      const safeBody = (await response.text()).slice(0, 500);
      const error = new Error(
        `Gemini embedding request failed (${response.status}): ${safeBody}`,
      );

      if (response.status < 500) {
        throw new AbortError(error);
      }

      throw error;
    }

    const parsed = geminiEmbeddingResponseSchema.parse(await response.json());

    return parsed.embeddings.map((embedding) => embedding.values);
  },
};

/**
 * Chooses the provider that matches a model config. Callers may still inject a
 * provider explicitly (tests do), but by default a gemini model uses the real
 * Gemini API and the deterministic model stays network-free.
 */
export function selectEmbeddingProvider(
  config: EmbeddingModelConfig,
): EmbeddingProvider {
  return config.provider === 'gemini'
    ? geminiEmbeddingProvider
    : deterministicEmbeddingProvider;
}

/**
 * The embedding model the RAG system uses by default. Tests and offline runs
 * stay deterministic; production uses real Gemini embeddings when configured.
 */
export function resolveDefaultEmbeddingModelId(): EmbeddingModelId {
  if (serverConfig.nodeEnv === 'test') {
    return 'lrnr-deterministic-1536';
  }

  return serverConfig.providers.embeddingModel.startsWith('gemini')
    ? 'gemini-embedding-1536'
    : 'lrnr-deterministic-1536';
}

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
  const provider = input.provider ?? selectEmbeddingProvider(config);
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
