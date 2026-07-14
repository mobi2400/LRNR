import { randomUUID } from 'node:crypto';

import type { KeyValueStore } from '@/lib/redis';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/locks.ts');

const LOCK_PREFIX = 'lrnr:lock';

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
  const currentToken = await store.get(lock.key);

  if (currentToken !== lock.token) {
    return false;
  }

  await store.delete(lock.key);

  return true;
}
