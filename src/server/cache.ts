import type { KeyValueStore } from '@/lib/redis';
import { serverConfig } from '@/server/config';
import {
  incrementMetric,
  observeDurationMs,
  observeMetric,
} from '@/server/metrics';
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

function cacheKindFromKey(key: string): string {
  const [, kind = 'unknown'] = key.split(':cache:');

  return kind.split(':')[0] ?? 'unknown';
}

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
  const kind = cacheKindFromKey(key);
  const rawValue = await observeDurationMs('cache_l2_get_duration_ms', { kind }, () =>
    store.get(key),
  );

  if (rawValue === null) {
    incrementMetric('cache_l2_access_total', { kind, result: 'miss' });

    return null;
  }

  observeMetric('cache_payload_bytes', Buffer.byteLength(rawValue, 'utf8'), {
    kind,
  });

  try {
    const envelope = cacheEnvelopeSchema.parse(JSON.parse(rawValue));
    const value = valueSchema.parse(envelope.value);

    incrementMetric('cache_l2_access_total', { kind, result: 'hit' });

    return value;
  } catch {
    incrementMetric('cache_l2_access_total', { kind, result: 'invalid_value' });

    try {
      await store.delete(key);
    } catch {
      incrementMetric('cache_invalidation_total', { kind, result: 'failure' });
    }

    return null;
  }
}

export async function setCachedJson(
  store: KeyValueStore,
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  const kind = cacheKindFromKey(key);
  const payload = JSON.stringify({
    schemaVersion: CACHE_SCHEMA_VERSION,
    cachedAt: new Date().toISOString(),
    value,
  });

  observeMetric('cache_payload_bytes', Buffer.byteLength(payload, 'utf8'), {
    kind,
  });

  try {
    await observeDurationMs('cache_fill_duration_ms', { kind }, () =>
      store.set(key, payload, { ttlMs }),
    );
    incrementMetric('cache_l2_write_total', { kind, result: 'success' });
  } catch (error) {
    incrementMetric('cache_l2_write_total', { kind, result: 'error' });
    throw error;
  }
}

export async function clearCachedValue(
  store: KeyValueStore,
  key: string,
): Promise<void> {
  const kind = cacheKindFromKey(key);

  try {
    await store.delete(key);
    incrementMetric('cache_invalidation_total', { kind, result: 'success' });
  } catch (error) {
    incrementMetric('cache_invalidation_total', { kind, result: 'failure' });
    throw error;
  }
}
