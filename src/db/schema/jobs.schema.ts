import {
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  jobStatusEnum,
  jsonbObjectDefault,
  table,
  timestamps,
  userScopedColumns,
} from './shared';

/**
 * These backend-control tables keep retries idempotent and make long-running
 * workflows debuggable without using Redis as the only record of what happened.
 */
export const jobRuns = table(
  'job_runs',
  {
    ...userScopedColumns,
    jobType: text('job_type').notNull(),
    status: jobStatusEnum('status').default('queued').notNull(),
    input: jsonb('input').default(jsonbObjectDefault).notNull(),
    output: jsonb('output'),
    error: jsonb('error'),
    idempotencyKey: text('idempotency_key'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    userStatusLookup: index('job_runs_user_status_idx').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    userTypeCreatedLookup: index('job_runs_user_type_created_idx').on(
      table.userId,
      table.jobType,
      table.createdAt,
    ),
    idempotencyUnique: uniqueIndex('job_runs_idempotency_idx').on(
      table.userId,
      table.idempotencyKey,
    ),
  }),
);

export const apiIdempotencyKeys = table(
  'api_idempotency_keys',
  {
    id: userScopedColumns.id,
    userId: userScopedColumns.userId,
    key: text('key').notNull(),
    route: text('route').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response'),
    responseStatusCode: integer('response_status_code'),
    status: text('status').default('processing').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => ({
    userKeyUnique: uniqueIndex('api_idempotency_keys_user_key_unique').on(
      table.userId,
      table.key,
    ),
    expiryLookup: index('api_idempotency_keys_expires_at_idx').on(
      table.expiresAt,
    ),
  }),
);
