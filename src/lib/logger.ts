import morgan from 'morgan';
import { createLogger, format, transports } from 'winston';

import { serverConfig } from '@/server/config';
import {
  type RequestContext,
  getRequestLogSnapshot,
} from '@/server/request-context';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/logger.ts');

const SENSITIVE_FIELD_PATTERN = /(secret|token|cookie|password|authorization|accesssecret|apikey)/i;

type JsonLike = Record<string, unknown>;

type MorganRequestLike = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type MorganResponseLike = {
  statusCode?: number;
};

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value !== null && typeof value === 'object') {
    return sanitizeMetadata(value as JsonLike);
  }

  return value;
}

export function sanitizeMetadata(metadata: JsonLike): JsonLike {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(value),
    ]),
  );
}

const loggerFormat =
  serverConfig.nodeEnv === 'development'
    ? format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.colorize({ all: true }),
        format.printf(({ timestamp, level, message, ...metadata }) => {
          const serializedMetadata =
            Object.keys(metadata).length > 0
              ? ` ${JSON.stringify(sanitizeMetadata(metadata))}`
              : '';

          return `${timestamp} ${level}: ${message}${serializedMetadata}`;
        }),
      )
    : format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json(),
      );

export const appLogger = createLogger({
  level: serverConfig.nodeEnv === 'development' ? 'debug' : 'info',
  defaultMeta: {
    service: 'lrnr',
    environment: serverConfig.nodeEnv,
  },
  format: loggerFormat,
  transports: [new transports.Console()],
});

morgan.token('request-id', (request) => {
  const value = request.headers['x-request-id'];

  return Array.isArray(value) ? value[0] : value ?? '-';
});

morgan.token('user-id-hash', (request) => {
  const value = request.headers['x-user-id-hash'];

  return Array.isArray(value) ? value[0] : value ?? '-';
});

const httpLogCompiler = morgan.compile(
  ':method :url :status :response-time ms req=:request-id user=:user-id-hash',
);

const httpTokens = {
  method(request: MorganRequestLike) {
    return request.method ?? '-';
  },
  url(request: MorganRequestLike) {
    return request.url ?? '-';
  },
  status(_request: MorganRequestLike, response: MorganResponseLike) {
    return response.statusCode?.toString() ?? '-';
  },
  'response-time'(
    _request: MorganRequestLike,
    response: MorganResponseLike,
  ) {
    return String((response as MorganResponseLike & { durationMs?: number }).durationMs ?? 0);
  },
  'request-id'(request: MorganRequestLike) {
    const value = request.headers['x-request-id'];

    return Array.isArray(value) ? value[0] : value ?? '-';
  },
  'user-id-hash'(request: MorganRequestLike) {
    const value = request.headers['x-user-id-hash'];

    return Array.isArray(value) ? value[0] : value ?? '-';
  },
};

export function logHttpAccess(
  context: RequestContext,
  statusCode: number,
  responseSizeBytes?: number,
): void {
  const snapshot = getRequestLogSnapshot(context, statusCode);
  const requestForMorgan: MorganRequestLike = {
    method: snapshot.method,
    url: snapshot.path,
    headers: {
      'x-request-id': snapshot.requestId,
      'x-user-id-hash': snapshot.userIdHash ?? '-',
    },
  };
  const responseForMorgan: MorganResponseLike & { durationMs: number } = {
    statusCode: snapshot.statusCode,
    durationMs: snapshot.durationMs,
  };
  const line = httpLogCompiler(
    httpTokens,
    requestForMorgan,
    responseForMorgan,
  );

  appLogger.info('http.access', {
    requestId: snapshot.requestId,
    route: snapshot.path,
    method: snapshot.method,
    statusCode: snapshot.statusCode,
    durationMs: snapshot.durationMs,
    userIdHash: snapshot.userIdHash,
    responseSizeBytes: responseSizeBytes ?? null,
    cacheStatus: snapshot.cacheStatus,
    jobId: snapshot.jobId,
    httpLine: line.trim(),
  });
}
