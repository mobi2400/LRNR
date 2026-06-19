import {
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { topicBriefs } from './profile.schema';
import {
  jsonbArrayDefault,
  jsonbObjectDefault,
  table,
  topicStatusEnum,
  userScopedColumns,
} from './shared';

/**
 * Curriculum state keeps the three learning layers together because later
 * workflow steps must reason about revision, current session, and live context
 * as one authoritative unit.
 */
export const curriculumState = table(
  'curriculum_state',
  {
    ...userScopedColumns,
    topicBriefId: uuid('topic_brief_id').references(() => topicBriefs.id),
    topicSlug: text('topic_slug').notNull(),
    status: topicStatusEnum('status').default('active').notNull(),
    layer1Roadmap: jsonb('layer_1_roadmap')
      .default(jsonbObjectDefault)
      .notNull(),
    layer2Sessions: jsonb('layer_2_sessions')
      .default(jsonbArrayDefault)
      .notNull(),
    layer3LiveQueue: jsonb('layer_3_live_queue')
      .default(jsonbArrayDefault)
      .notNull(),
    currentSessionId: text('current_session_id'),
    currentSessionIndex: integer('current_session_index').default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  },
  (table) => ({
    userTopicUnique: uniqueIndex('curriculum_state_user_topic_slug_unique').on(
      table.userId,
      table.topicSlug,
    ),
    activeCurriculumLookup: index('curriculum_state_user_status_idx').on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
    currentSessionLookup: index('curriculum_state_current_session_idx').on(
      table.userId,
      table.currentSessionId,
    ),
  }),
);
