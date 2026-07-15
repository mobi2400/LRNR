import { describe, expect, it } from 'vitest';

import {
  deterministicEmbeddingProvider,
  embedTexts,
  embeddingModelRegistry,
  hashEmbeddingContent,
  resetEmbeddingCacheForTests,
  validateQueryEmbedding,
  type EmbeddingProvider,
} from '../../src/lib/embeddings';

describe('embedding wrapper', () => {
  it('embeds through the deterministic adapter with explicit version metadata', async () => {
    resetEmbeddingCacheForTests();

    const [result] = await embedTexts({
      model: 'lrnr-deterministic-1536',
      provider: deterministicEmbeddingProvider,
      values: [{ id: 'a', text: ' scoped RAG evidence ' }],
    });

    expect(result?.vector).toHaveLength(1536);
    expect(result?.embeddingVersion).toBe(
      embeddingModelRegistry['lrnr-deterministic-1536'].embeddingVersion,
    );
    expect(result?.normalizationVersion).toBe('canonical-text-v1');
    expect(result?.contentHash).toBe(hashEmbeddingContent('scoped RAG evidence'));
  });

  it('deduplicates identical content hashes while preserving caller ids', async () => {
    resetEmbeddingCacheForTests();
    let providerCalls = 0;
    const provider: EmbeddingProvider = {
      async embedBatch(input) {
        providerCalls += 1;
        return deterministicEmbeddingProvider.embedBatch(input);
      },
    };

    const results = await embedTexts({
      model: 'lrnr-deterministic-1536',
      provider,
      values: [
        { id: 'first', text: 'same text' },
        { id: 'second', text: 'same   text' },
      ],
      useCache: false,
    });

    expect(providerCalls).toBe(1);
    expect(results.map((result) => result.id)).toEqual(['first', 'second']);
    expect(results[0]?.contentHash).toBe(results[1]?.contentHash);
  });

  it('rejects incompatible query embedding versions and dimensions', () => {
    const vector = Array.from({ length: 1536 }, () => 0);

    expect(() =>
      validateQueryEmbedding({
        vector,
        embeddingVersion: 'wrong-version',
        model: 'lrnr-deterministic-1536',
      }),
    ).toThrow('Query embedding version does not match selected model registry.');

    expect(() =>
      validateQueryEmbedding({
        vector: [0],
        embeddingVersion: 'deterministic-1536-v1',
        model: 'lrnr-deterministic-1536',
      }),
    ).toThrow('Embedding dimension mismatch');
  });
});
