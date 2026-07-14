import type { KeyValueStore } from '@/lib/redis';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/cache.ts');

const CACHE_PREFIX = 'lrnr:cache';

export const CACHE_TTL_MS = {
  dashboard: 60000,
  workflowStatus: 15000,
} as const;

export function buildDashboardCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:dashboard:${userId}`;
}

export function buildWorkflowStatusCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:workflow-status:${userId}`;
}

export async function getCachedJson<T>(
  store: KeyValueStore,
  key: string,
): Promise<T | null> {
  const rawValue = await store.get(key);

  if (rawValue === null) {
    return null;
  }

  return JSON.parse(rawValue) as T;
}

export async function setCachedJson(
  store: KeyValueStore,
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  await store.set(key, JSON.stringify(value), {
    ttlMs,
  });
}

export async function clearCachedValue(
  store: KeyValueStore,
  key: string,
): Promise<void> {
  await store.delete(key);
}
