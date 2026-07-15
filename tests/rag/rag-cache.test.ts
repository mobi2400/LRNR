import { describe, expect, it } from 'vitest';

import { buildRagCacheKey, buildRagInvalidationPrefix, createRagCacheEnvelope, ragCacheTtlSeconds } from '../../src/rag/rag-cache';

const userId = '00000000-0000-4000-8000-000000000001';

describe('RAG cache policy', () => {
  it('builds isolated schema-versioned keys without raw query text', () => {
    const key = buildRagCacheKey({
      environment: 'test',
      kind: 'context_pack',
      userId,
      normalizedQuery: 'What is RAG?',
      filters: { topicSlug: 'rag' },
      embeddingVersion: 'deterministic-1536-v1',
    });

    expect(key).toContain('rag-cache-v1');
    expect(key).toContain('embedding:deterministic-1536-v1');
    expect(key).not.toContain(userId);
    expect(key).not.toContain('What is RAG?');
  });

  it('creates schema-versioned envelopes and TTLs', () => {
    const envelope = createRagCacheEnvelope({ kind: 'candidate_ids', value: ['a'], now: new Date('2026-07-15T00:00:00.000Z') });

    expect(envelope.schemaVersion).toBe('rag-cache-v1');
    expect(envelope.ttlSeconds).toBe(ragCacheTtlSeconds('candidate_ids'));
  });

  it('builds per-user invalidation prefixes', () => {
    const prefix = buildRagInvalidationPrefix({ environment: 'test', userId });

    expect(prefix).toContain('user:');
    expect(prefix).not.toContain(userId);
  });
});
