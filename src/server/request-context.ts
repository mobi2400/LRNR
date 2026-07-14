import { createHash, randomUUID } from 'node:crypto';

import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/request-context.ts');

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
  userId: string | null;
  userIdHash: string | null;
  jobId: string | null;
  cacheStatus: 'hit' | 'miss' | 'skip' | null;
}

export interface CreateRequestContextOptions {
  requestId?: string | null;
  userId?: string | null;
  jobId?: string | null;
}

export interface RequestLogSnapshot extends RequestContext {
  durationMs: number;
  statusCode: number;
}

function normalizeHeaderValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export function hashUserId(userId: string | null): string | null {
  if (userId === null) {
    return null;
  }

  return createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

export function createRequestContext(
  request: Request,
  options: CreateRequestContextOptions = {},
): RequestContext {
  const path = new URL(request.url).pathname;
  const headerRequestId = normalizeHeaderValue(
    request.headers.get('x-request-id'),
  );
  const requestId = options.requestId ?? headerRequestId ?? randomUUID();
  const userId = options.userId ?? null;

  return {
    requestId,
    method: request.method.toUpperCase(),
    path,
    startedAt: Date.now(),
    userId,
    userIdHash: hashUserId(userId),
    jobId: options.jobId ?? null,
    cacheStatus: null,
  };
}

export function withRequestUser(
  context: RequestContext,
  userId: string | null,
): RequestContext {
  return {
    ...context,
    userId,
    userIdHash: hashUserId(userId),
  };
}

export function withCacheStatus(
  context: RequestContext,
  cacheStatus: RequestContext['cacheStatus'],
): RequestContext {
  return {
    ...context,
    cacheStatus,
  };
}

export function getRequestLogSnapshot(
  context: RequestContext,
  statusCode: number,
): RequestLogSnapshot {
  return {
    ...context,
    durationMs: Date.now() - context.startedAt,
    statusCode,
  };
}
