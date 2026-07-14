import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MemoryKeyValueStore } from '../../src/lib/redis';
import {
  buildCurrentLessonCacheKey,
  buildCurriculumMapCacheKey,
  getCachedJson,
  setCachedJson,
} from '../../src/server/cache';
import { getMetricsSnapshot, resetMetricsForTests } from '../../src/server/metrics';

describe('cache helpers', () => {
  beforeEach(() => {
    resetMetricsForTests();
  });
  it('round-trips a versioned, validated cache value', async () => {
    const store = new MemoryKeyValueStore();
    const key = 'lrnr:v1:cache:test';
    const schema = z.object({ title: z.string() });

    await setCachedJson(store, key, { title: 'Current lesson' }, 5000);

    await expect(getCachedJson(store, key, schema)).resolves.toEqual({
      title: 'Current lesson',
    });
  });

  it('evicts malformed or incompatible cache values', async () => {
    const store = new MemoryKeyValueStore();
    const key = 'lrnr:v1:cache:test';

    await store.set(key, JSON.stringify({ schemaVersion: 0, value: {} }), {
      ttlMs: 5000,
    });

    await expect(
      getCachedJson(store, key, z.object({ title: z.string() })),
    ).resolves.toBeNull();
    await expect(store.get(key)).resolves.toBeNull();
    expect(getMetricsSnapshot().counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'cache_l2_access_total',
          labels: { kind: 'test', result: 'invalid_value' },
          value: 1,
        }),
      ]),
    );
  });

  it('scopes lesson and curriculum cache keys by revision', () => {
    expect(
      buildCurrentLessonCacheKey(
        '11111111-1111-1111-1111-111111111111',
        'session-01',
        7,
      ),
    ).toContain(
      ':current-lesson:11111111-1111-1111-1111-111111111111:session-01:r7',
    );
    expect(
      buildCurriculumMapCacheKey(
        '11111111-1111-1111-1111-111111111111',
        'typescript',
        7,
      ),
    ).toContain(
      ':curriculum-map:11111111-1111-1111-1111-111111111111:typescript:r7',
    );
  });
});