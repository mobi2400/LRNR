import type { KeyValueStore } from '@/lib/redis';
import { serverConfig } from '@/server/config';
import { RateLimitAppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/rate-limit.ts');

const RATE_LIMIT_PREFIX = `lrnr:v1:${serverConfig.nodeEnv}:rate-limit`;

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function buildRateLimitKey(scope: string, actorKey: string): string {
  return `${RATE_LIMIT_PREFIX}:${scope}:${actorKey}`;
}

export async function checkRateLimit(
  store: KeyValueStore,
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): Promise<RateLimitResult> {
  const counter = await store.incrementWithTtl(key, policy.windowMs);
  const resetAt = now + counter.ttlMs;

  const retryAfterSeconds = Math.max(1, Math.ceil(counter.ttlMs / 1000));
  const remaining = Math.max(policy.limit - counter.count, 0);

  return {
    allowed: counter.count <= policy.limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

export async function assertRateLimit(
  store: KeyValueStore,
  actorKey: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const key = buildRateLimitKey(policy.scope, actorKey);
  const result = await checkRateLimit(store, key, policy);

  if (!result.allowed) {
    throw new RateLimitAppError(
      'Too many requests. Please slow down and try again.',
      result.retryAfterSeconds,
      {
        scope: policy.scope,
        limit: policy.limit,
        windowMs: policy.windowMs,
        resetAt: result.resetAt,
      },
    );
  }

  return result;
}
