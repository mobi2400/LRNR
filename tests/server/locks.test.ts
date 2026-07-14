import { describe, expect, it } from 'vitest';

import { MemoryKeyValueStore } from '../../src/lib/redis';
import {
  acquireLock,
  buildWorkflowLockKey,
  releaseLock,
} from '../../src/server/locks';

describe('lock helpers', () => {
  it('acquires a lock once per key until released', async () => {
    const store = new MemoryKeyValueStore();
    const key = buildWorkflowLockKey('owner-user-id', 'daily-learning');
    const firstLock = await acquireLock(store, key, 5000);
    const secondLock = await acquireLock(store, key, 5000);

    expect(firstLock).not.toBeNull();
    expect(secondLock).toBeNull();

    const released = await releaseLock(store, firstLock!);
    const thirdLock = await acquireLock(store, key, 5000);

    expect(released).toBe(true);
    expect(thirdLock).not.toBeNull();
  });
});
