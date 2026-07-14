import { NextResponse } from 'next/server';

import { appLogger, logHttpAccess, sanitizeMetadata } from '@/lib/logger';
import {
  type AppError,
  type ApiErrorCode,
  type RateLimitAppError,
  toAppError,
} from '@/server/errors';
import { type RequestContext } from '@/server/request-context';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/response.ts');

export interface ApiSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
}

export interface ApiFailure {
  ok: false;
  requestId: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

interface ErrorResponseOptions {
  status?: number;
  details?: unknown;
}

function getResponseSizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function successResponse<T>(
  context: RequestContext,
  data: T,
  init?: ResponseInit,
): Response {
  const body: ApiSuccess<T> = {
    ok: true,
    requestId: context.requestId,
    data,
  };

  const status = init?.status ?? 200;
  const response = NextResponse.json(body, init);

  response.headers.set('x-request-id', context.requestId);
  logHttpAccess(context, status, getResponseSizeBytes(body));

  return response;
}

export function errorResponse(
  context: RequestContext,
  error: AppError,
  options: ErrorResponseOptions = {},
): Response {
  const status = options.status ?? error.status;
  const details = options.details ?? error.details;
  const body: ApiFailure = {
    ok: false,
    requestId: context.requestId,
    error: {
      code: error.code,
      message: error.message,
      ...(details === undefined ? {} : { details }),
    },
  };
  const response = NextResponse.json(body, {
    status,
  });

  response.headers.set('x-request-id', context.requestId);

  if ('retryAfterSeconds' in error) {
    response.headers.set(
      'retry-after',
      String((error as RateLimitAppError).retryAfterSeconds),
    );
  }

  logHttpAccess(context, status, getResponseSizeBytes(body));

  return response;
}

export function handleRouteError(
  context: RequestContext,
  error: unknown,
): Response {
  const appError = toAppError(error);
  const logMetadata = {
    requestId: context.requestId,
    route: context.path,
    method: context.method,
    statusCode: appError.status,
    userIdHash: context.userIdHash,
    jobId: context.jobId,
    error: sanitizeMetadata({
      code: appError.code,
      message: appError.message,
      details: appError.details,
      cause:
        appError.cause instanceof Error
          ? {
              name: appError.cause.name,
              message: appError.cause.message,
            }
          : appError.cause ?? null,
    }),
  };

  if (appError.status >= 500) {
    appLogger.error('api.error', logMetadata);
  } else {
    appLogger.warn('api.error', logMetadata);
  }

  return errorResponse(context, appError);
}
