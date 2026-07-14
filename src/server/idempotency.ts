import { createHash } from 'node:crypto';

import type { ApiFailure, ApiSuccess } from '@/server/response';
import {
  IdempotencyConflictAppError,
  ValidationAppError,
} from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/idempotency.ts');

export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface IdempotencyRecord<TResponse> {
  key: string;
  route: string;
  requestHash: string;
  response: TResponse;
  statusCode: number;
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
): string {
  return createHash('sha256')
    .update(`${route}:${stableSerialize(payload)}`)
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

  return record.response;
}

export type AnyApiEnvelope = ApiSuccess<unknown> | ApiFailure;
