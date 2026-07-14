import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/errors.ts');

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'LOCKED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'WORKFLOW_ALREADY_RUNNING'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

export interface AppErrorOptions {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor({ code, message, status, details, cause }: AppErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      status: 400,
      details,
    });
    this.name = 'ValidationAppError';
  }
}

export class RateLimitAppError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number, details?: unknown) {
    super({
      code: 'RATE_LIMITED',
      message,
      status: 429,
      details,
    });
    this.name = 'RateLimitAppError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class IdempotencyConflictAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'IDEMPOTENCY_CONFLICT',
      message,
      status: 409,
      details,
    });
    this.name = 'IdempotencyConflictAppError';
  }
}


export class IdempotencyInProgressAppError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = 'A request with this idempotency key is still processing.') {
    super({
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message,
      status: 409,
    });
    this.name = 'IdempotencyInProgressAppError';
    this.retryAfterSeconds = 2;
  }
}
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong while handling the request.',
      status: 500,
      cause: error,
    });
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong while handling the request.',
    status: 500,
    details: error,
  });
}
