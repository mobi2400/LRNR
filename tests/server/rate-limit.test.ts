import { describe, expect, it } from 'vitest';

import { MemoryKeyValueStore } from '../../src/lib/redis';
import { RateLimitAppError } from '../../src/server/errors';
import { assertRateLimit } from '../../src/server/rate-limit';

describe('rate limit helpers', () => {
  it('throws when a caller exceeds the configured window limit', async () => {
    const store = new MemoryKeyValueStore();
    const policy = {
      scope: 'api:write',
      limit: 2,
      windowMs: 30000,
    };

    await expect(
      assertRateLimit(store, 'owner-user-id', policy),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(
      assertRateLimit(store, 'owner-user-id', policy),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(
      assertRateLimit(store, 'owner-user-id', policy),
    ).rejects.toThrow(RateLimitAppError);
  });

  it('counts concurrent requests without losing increments', async () => {
    const store = new MemoryKeyValueStore();
    const policy = {
      scope: 'api:read',
      limit: 5,
      windowMs: 30000,
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        assertRateLimit(store, 'concurrent-owner', policy).then(
          () => true,
          (error: unknown) => {
            if (error instanceof RateLimitAppError) {
              return false;
            }

            throw error;
          },
        ),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.filter((allowed) => !allowed)).toHaveLength(5);
  });
});
