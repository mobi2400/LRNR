import { createHash } from 'node:crypto';

import type { ApiFailure, ApiSuccess } from '@/server/response';
import {
  IdempotencyConflictAppError,
  IdempotencyInProgressAppError,
} from '@/server/errors';
import { ValidationAppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/idempotency.ts');

export const IDEMPOTENCY_HEADER = 'idempotency-key';

export type IdempotencyReplayStatus =
  | 'processing'
  | 'completed'
  | 'failed_retryable'
  | 'failed_terminal';

export interface IdempotencyRecord<TResponse> {
  key: string;
  route: string;
  requestHash: string;
  response: TResponse | null;
  statusCode: number | null;
  status: IdempotencyReplayStatus;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function readIdempotencyKey(headers: Headers): string | null {
  const rawHeader = headers.get(IDEMPOTENCY_HEADER);

  if (rawHeader === null) {
    return null;
  }

  const normalized = rawHeader.trim();

  return normalized.length > 0 ? normalized : null;
}

export function requireIdempotencyKey(headers: Headers): string {
  const key = readIdempotencyKey(headers);

  if (key === null) {
    throw new ValidationAppError('Idempotency-Key header is required.');
  }

  return key;
}

export function hashIdempotencyRequest(
  route: string,
  payload: unknown,
  userId: string,
): string {
  return createHash('sha256')
    .update(`${userId}:${route}:${stableSerialize(payload)}`)
    .digest('hex');
}

export function assertIdempotencyReplay<TResponse>(
  record: IdempotencyRecord<TResponse>,
  route: string,
  requestHash: string,
): TResponse {
  if (record.route !== route || record.requestHash !== requestHash) {
    throw new IdempotencyConflictAppError(
      'Idempotency key was already used for a different request payload.',
      {
        route,
      },
    );
  }

  if (record.status === 'processing') {
    throw new IdempotencyInProgressAppError();
  }

  if (record.status !== 'completed' || record.response === null) {
    throw new IdempotencyConflictAppError(
      'Previous idempotent request did not complete successfully.',
      {
        route,
        status: record.status,
      },
    );
  }

  return record.response;
}

export type AnyApiEnvelope = ApiSuccess<unknown> | ApiFailure;