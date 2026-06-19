import { sql } from 'drizzle-orm';
import {
  customType,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const topicStatusEnum = pgEnum('topic_status', [
  'active',
  'paused',
  'completed',
  'archived',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'planned',
  'ready',
  'delivered',
  'completed',
  'skipped',
  'rescheduled',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'telegram',
  'in_app',
  'email',
  'push',
]);

export const ragEventTypeEnum = pgEnum('rag_event_type', [
  'onboarding_response',
  'session_summary',
  'question_asked',
  'evaluation_response',
  'gap_detected',
  'misconception_detected',
  'misconception_corrected',
  'concept_mastered',
  'contradiction_resolved',
  'layer3_injection',
]);

export const table = pgTable;

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const userScopedColumns = {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  ...timestamps,
};

export const jsonbObjectDefault = sql`'{}'::jsonb`;
export const jsonbArrayDefault = sql`'[]'::jsonb`;

/**
 * pgvector support is part of the Phase 1 schema contract for RAG memory.
 * We keep the type local so the Drizzle schema stays explicit about the agreed
 * 1536-dimension embedding shape without depending on app-level wrappers.
 */
export const vector = customType<{
  data: number[] | null;
  driverData: string | null;
  config: { dimensions: number };
}>({
  dataType(config) {
    const dimensions = config?.dimensions ?? 1536;

    return `vector(${dimensions})`;
  },
  toDriver(value) {
    if (value === null) {
      return null;
    }

    return `[${value.join(',')}]`;
  },
});

export const sourceAgentColumn = text('source_agent').notNull();
