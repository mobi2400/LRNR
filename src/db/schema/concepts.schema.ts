import {
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { jsonbObjectDefault, table, timestamps } from './shared';

/**
 * Concept graph tables are part of Phase 1 because curriculum ordering and
 * later Graph RAG both depend on having explicit prerequisite edges instead of
 * hiding them inside JSON blobs only.
 */
export const concepts = table(
  'concepts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    topicSlug: text('topic_slug').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    summary: text('summary'),
    difficulty: integer('difficulty'),
    metadata: jsonb('metadata').default(jsonbObjectDefault).notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => ({
    userTopicSlugUnique: uniqueIndex('concepts_user_topic_slug_unique').on(
      table.userId,
      table.topicSlug,
      table.slug,
    ),
    userTopicLookup: index('concepts_user_topic_idx').on(
      table.userId,
      table.topicSlug,
    ),
  }),
);

export const conceptPrerequisites = table(
  'concept_prerequisites',
  {
    userId: uuid('user_id').notNull(),
    topicSlug: text('topic_slug').notNull(),
    conceptId: uuid('concept_id')
      .references(() => concepts.id, { onDelete: 'cascade' })
      .notNull(),
    prerequisiteConceptId: uuid('prerequisite_concept_id')
      .references(() => concepts.id, { onDelete: 'cascade' })
      .notNull(),
    strength: text('strength').default('required').notNull(),
    reason: text('reason'),
    createdAt: timestamps.createdAt,
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.conceptId, table.prerequisiteConceptId],
      name: 'concept_prerequisites_pk',
    }),
    userTopicLookup: index('concept_prereq_user_topic_idx').on(
      table.userId,
      table.topicSlug,
    ),
  }),
);
