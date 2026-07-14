import { randomUUID } from 'node:crypto';

import type { KeyValueStore } from '@/lib/redis';
import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/locks.ts');

const LOCK_PREFIX = `lrnr:v1:${serverConfig.nodeEnv}:lock`;

export interface LockHandle {
  key: string;
  token: string;
  expiresAt: number;
}

export function buildWorkflowLockKey(userId: string, workflow: string): string {
  return `${LOCK_PREFIX}:workflow:${workflow}:${userId}`;
}

export async function acquireLock(
  store: KeyValueStore,
  key: string,
  ttlMs: number,
): Promise<LockHandle | null> {
  const token = randomUUID();
  const acquired = await store.set(key, token, {
    ttlMs,
    onlyIfAbsent: true,
  });

  if (!acquired) {
    return null;
  }

  return {
    key,
    token,
    expiresAt: Date.now() + ttlMs,
  };
}

export async function releaseLock(
  store: KeyValueStore,
  lock: LockHandle,
): Promise<boolean> {
  // Ownership check and deletion must be one Redis operation. A GET followed by
  // DEL can delete a new owner's lock when the original lease expires between
  // those commands.
  return store.deleteIfValue(lock.key, lock.token);
}
