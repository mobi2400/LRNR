import {
  index,
  jsonb,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  jsonbArrayDefault,
  jsonbObjectDefault,
  table,
  userScopedColumns,
} from './shared';

/**
 * Profile and topic-brief tables hold stable learner state and the Architect
 * handoff document. Raw conversational history belongs elsewhere.
 */
export const userProfile = table(
  'user_profile',
  {
    ...userScopedColumns,
    displayName: text('display_name'),
    currentGoal: text('current_goal'),
    currentTopicId: uuid('current_topic_id'),
    currentTopicSlug: text('current_topic_slug'),
    curriculumPosition: jsonb('curriculum_position')
      .default(jsonbObjectDefault)
      .notNull(),
    learnerPreferences: jsonb('learner_preferences')
      .default(jsonbObjectDefault)
      .notNull(),
    stableMasterySummary: jsonb('stable_mastery_summary')
      .default(jsonbObjectDefault)
      .notNull(),
    activeMisconceptions: jsonb('active_misconceptions')
      .default(jsonbArrayDefault)
      .notNull(),
    nextEvaluationDueAt: timestamp('next_evaluation_due_at', {
      withTimezone: true,
    }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  },
  (table) => ({
    userIdUnique: uniqueIndex('user_profile_user_id_unique').on(table.userId),
    currentTopicLookup: index('user_profile_current_topic_idx').on(
      table.userId,
      table.currentTopicSlug,
    ),
  }),
);

export const topicBriefs = table(
  'topic_briefs',
  {
    ...userScopedColumns,
    topicSlug: text('topic_slug').notNull(),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    requiredDepth: text('required_depth').notNull(),
    learnerContext: jsonb('learner_context')
      .default(jsonbObjectDefault)
      .notNull(),
    prerequisiteMap: jsonb('prerequisite_map')
      .default(jsonbArrayDefault)
      .notNull(),
    conceptOutline: jsonb('concept_outline')
      .default(jsonbArrayDefault)
      .notNull(),
    masteryIntent: jsonb('mastery_intent')
      .default(jsonbObjectDefault)
      .notNull(),
    sourceAgent: text('source_agent').default('architect_node').notNull(),
  },
  (table) => ({
    userTopicUnique: uniqueIndex('topic_briefs_user_topic_slug_unique').on(
      table.userId,
      table.topicSlug,
    ),
    recentBriefs: index('topic_briefs_user_created_idx').on(
      table.userId,
      table.createdAt,
    ),
  }),
);
