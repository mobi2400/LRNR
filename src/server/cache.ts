import type { KeyValueStore } from '@/lib/redis';
import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';
import { z } from 'zod';

assertServerOnly('src/server/cache.ts');

const CACHE_SCHEMA_VERSION = 1;
const CACHE_PREFIX = `lrnr:v1:${serverConfig.nodeEnv}:cache`;

const cacheEnvelopeSchema = z.object({
  schemaVersion: z.literal(CACHE_SCHEMA_VERSION),
  cachedAt: z.string().datetime(),
  value: z.unknown(),
});

export const CACHE_TTL_MS = {
  dashboard: 60000,
  currentLesson: 120000,
  curriculumMap: 600000,
  workflowStatus: 15000,
} as const;

export function buildDashboardCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:dashboard:${userId}`;
}

export function buildCurrentLessonCacheKey(
  userId: string,
  sessionId: string,
  revision: number,
): string {
  return `${CACHE_PREFIX}:current-lesson:${userId}:${sessionId}:r${revision}`;
}

export function buildCurriculumMapCacheKey(
  userId: string,
  topicSlug: string,
  revision: number,
): string {
  return `${CACHE_PREFIX}:curriculum-map:${userId}:${topicSlug}:r${revision}`;
}

export function buildWorkflowStatusCacheKey(userId: string): string {
  return `${CACHE_PREFIX}:workflow-status:${userId}`;
}

export async function getCachedJson<T>(
  store: KeyValueStore,
  key: string,
  valueSchema: z.ZodType<T>,
): Promise<T | null> {
  const rawValue = await store.get(key);

  if (rawValue === null) {
    return null;
  }

  try {
    const envelope = cacheEnvelopeSchema.parse(JSON.parse(rawValue));

    return valueSchema.parse(envelope.value);
  } catch {
    // Cache corruption or a stale schema must not break an authoritative DB
    // read. Delete the unusable entry and let the caller rebuild it.
    await store.delete(key);

    return null;
  }
}

export async function setCachedJson(
  store: KeyValueStore,
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  await store.set(
    key,
    JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      cachedAt: new Date().toISOString(),
      value,
    }),
    {
      ttlMs,
    },
  );
}

export async function clearCachedValue(
  store: KeyValueStore,
  key: string,
): Promise<void> {
  await store.delete(key);
}
