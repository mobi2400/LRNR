import type { KeyValueStore } from '@/lib/redis';
import { RateLimitAppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/rate-limit.ts');

const RATE_LIMIT_PREFIX = 'lrnr:rate-limit';

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

interface FixedWindowState {
  count: number;
  resetAt: number;
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
  const currentState = await store.get(key);
  const parsedState =
    currentState === null
      ? null
      : (JSON.parse(currentState) as FixedWindowState);

  const nextState =
    parsedState === null || parsedState.resetAt <= now
      ? {
          count: 1,
          resetAt: now + policy.windowMs,
        }
      : {
          count: parsedState.count + 1,
          resetAt: parsedState.resetAt,
        };

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((nextState.resetAt - now) / 1000),
  );

  await store.set(key, JSON.stringify(nextState), {
    ttlMs: Math.max(nextState.resetAt - now, 1),
  });

  const remaining = Math.max(policy.limit - nextState.count, 0);

  return {
    allowed: nextState.count <= policy.limit,
    remaining,
    resetAt: nextState.resetAt,
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
