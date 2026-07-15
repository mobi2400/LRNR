import { describe, expect, it } from 'vitest';

import { advanceBackfillCheckpoint, assertNoMixedEmbeddingVersions, defaultRagRuntimeConfig } from '../../src/rag/rollout-safety';

describe('RAG rollout safety', () => {
  it('defaults to shadow mode and disables final answer caching', () => {
    const config = defaultRagRuntimeConfig();

    expect(config.rolloutMode).toBe('shadow');
    expect(config.enableFinalAnswerCache).toBe(false);
    expect(config.retrievalConfigVersion).toBe('retrieval-config-v1');
  });

  it('rejects mixed embedding versions', () => {
    expect(() =>
      assertNoMixedEmbeddingVersions({
        requestedVersion: 'deterministic-1536-v1',
        storedVersions: ['deterministic-1536-v1', 'other'],
      }),
    ).toThrow('Mixed or incompatible embedding versions');
  });

  it('advances checkpointed backfill progress with per-row failures', () => {
    const checkpoint = advanceBackfillCheckpoint({
      checkpoint: {
        jobName: 'embedding-backfill',
        cursor: null,
        processedRows: 0,
        failedRows: [],
        embeddingVersion: 'deterministic-1536-v1',
        dryRun: true,
      },
      rowId: 'row-1',
      nextCursor: 'cursor-1',
      errorCode: 'provider_timeout',
    });

    expect(checkpoint.processedRows).toBe(1);
    expect(checkpoint.failedRows[0]?.errorCode).toBe('provider_timeout');
  });
});
