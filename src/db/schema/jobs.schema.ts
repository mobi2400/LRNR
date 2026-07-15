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
      table.id,
    ),
    userTypeCreatedLookup: index('job_runs_user_type_created_idx').on(
      table.userId,
      table.jobType,
      table.createdAt,
      table.id,
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
export const workflowNodeRuns = table(
  'workflow_node_runs',
  {
    ...userScopedColumns,
    workflowRunId: text('workflow_run_id').notNull(),
    nodeName: text('node_name').notNull(),
    status: text('status').default('pending').notNull(),
    attempt: integer('attempt').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    input: jsonb('input').default(jsonbObjectDefault).notNull(),
    output: jsonb('output'),
    error: jsonb('error'),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
  },
  (table) => ({
    userWorkflowNodeUnique: uniqueIndex('workflow_node_runs_user_workflow_node_idx').on(
      table.userId,
      table.workflowRunId,
      table.nodeName,
    ),
    claimLookup: index('workflow_node_runs_claim_idx').on(
      table.userId,
      table.status,
      table.leaseExpiresAt,
      table.updatedAt,
    ),
    idempotencyUnique: uniqueIndex('workflow_node_runs_idempotency_idx').on(
      table.userId,
      table.idempotencyKey,
    ),
  }),
);
