import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { jsonbArrayDefault, table, timestamps } from './shared';

/**
 * Interview persistence. Unlike the rest of the schema, the principal here is a
 * `text` column, not a uuid: a redeemed guest link produces a non-uuid
 * `guest-<uuid>` principal that must be able to own a session. Sessions,
 * the append-only verdict log, and interviewee reactions all live here so they
 * are durable and queryable alongside the rest of the data model rather than in
 * ephemeral Redis. (Single-use guest link *tokens* stay in Redis by design —
 * they are transient credentials, not records.)
 */

export const interviewSessions = table(
  'interview_sessions',
  {
    // Mirrors InterviewSessionState.sessionId — the app mints it, so it is the
    // primary key rather than a separate generated id.
    sessionId: uuid('session_id').primaryKey(),
    principalUserId: text('principal_user_id').notNull(),
    topicSlug: text('topic_slug').notNull(),
    status: text('status').notNull(),
    turnCap: integer('turn_cap').notNull(),
    currentProbe: text('current_probe'),
    turns: jsonb('turns').default(jsonbArrayDefault).notNull(),
    detectedGaps: jsonb('detected_gaps').default(jsonbArrayDefault).notNull(),
    verdictSummary: jsonb('verdict_summary'),
    ...timestamps,
  },
  (table) => ({
    principalLookup: index('interview_sessions_principal_idx').on(
      table.principalUserId,
      table.createdAt,
    ),
  }),
);

export const interviewVerdictLog = table(
  'interview_verdict_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').notNull(),
    principalUserId: text('principal_user_id').notNull(),
    topicSlug: text('topic_slug').notNull(),
    totalTurns: integer('total_turns').notNull(),
    scoredTurns: integer('scored_turns').notNull(),
    unscoredTurns: integer('unscored_turns').notNull(),
    // Null captures a completion that produced no verdict — kept on purpose as
    // the highest-value calibration signal.
    verdict: jsonb('verdict'),
    loggedAt: timestamp('logged_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    loggedAtLookup: index('interview_verdict_log_logged_at_idx').on(
      table.loggedAt,
      table.id,
    ),
  }),
);

export const interviewReactions = table('interview_reactions', {
  // One reaction per session.
  sessionId: uuid('session_id').primaryKey(),
  principalUserId: text('principal_user_id').notNull(),
  wasAnythingWrong: boolean('was_anything_wrong').notNull(),
  note: text('note'),
  contact: text('contact'),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
