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

    await expect(assertRateLimit(store, 'owner-user-id', policy)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(assertRateLimit(store, 'owner-user-id', policy)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(assertRateLimit(store, 'owner-user-id', policy)).rejects.toThrow(
      RateLimitAppError,
    );
  });
});
