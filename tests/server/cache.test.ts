import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MemoryKeyValueStore } from '../../src/lib/redis';
import { getCachedJson, setCachedJson } from '../../src/server/cache';

describe('cache helpers', () => {
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
  });
});
