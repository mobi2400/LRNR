import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { topicBriefs } from './profile.schema';
import {
  jsonbArrayDefault,
  jsonbObjectDefault,
  ragEventTypeEnum,
  sourceAgentColumn,
  table,
  userScopedColumns,
  vector,
} from './shared';

/**
 * Knowledge and RAG tables separate researched topic authority from retrieval
 * memory so the app can stay grounded without turning every memory event into a
 * source-of-truth write.
 */
export const topicKnowledgeBase = table(
  'topic_knowledge_base',
  {
    ...userScopedColumns,
    topicBriefId: uuid('topic_brief_id').references(() => topicBriefs.id),
    topicSlug: text('topic_slug').notNull(),
    sourceInventory: jsonb('source_inventory')
      .default(jsonbArrayDefault)
      .notNull(),
    conceptMap: jsonb('concept_map').default(jsonbArrayDefault).notNull(),
    claims: jsonb('claims').default(jsonbArrayDefault).notNull(),
    limitations: jsonb('limitations').default(jsonbArrayDefault).notNull(),
    codePatterns: jsonb('code_patterns').default(jsonbArrayDefault).notNull(),
    versionNotes: jsonb('version_notes').default(jsonbArrayDefault).notNull(),
    interviewPatterns: jsonb('interview_patterns')
      .default(jsonbArrayDefault)
      .notNull(),
    metadata: jsonb('metadata').default(jsonbObjectDefault).notNull(),
  },
  (table) => ({
    userTopicUnique: uniqueIndex(
      'topic_knowledge_base_user_topic_slug_unique',
    ).on(table.userId, table.topicSlug),
    topicLookup: index('topic_kb_user_topic_idx').on(
      table.userId,
      table.topicSlug,
    ),
  }),
);

export const ragMemory = table(
  'rag_memory',
  {
    ...userScopedColumns,
    topicId: uuid('topic_id'),
    topicSlug: text('topic_slug'),
    conceptId: uuid('concept_id'),
    conceptSlug: text('concept_slug'),
    eventType: ragEventTypeEnum('event_type').notNull(),
    content: text('content').notNull(),
    retrievalText: text('retrieval_text'),
    synthesisText: text('synthesis_text'),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingVersion: text('embedding_version').default('v1').notNull(),
    lexicalSearchText: text('lexical_search_text'),
    sourceAgent: sourceAgentColumn,
    sourceId: uuid('source_id'),
    sourceUri: text('source_uri'),
    parentDocumentId: uuid('parent_document_id'),
    chunkOrdinal: integer('chunk_ordinal'),
    tokenCount: integer('token_count'),
    confidence: numeric('confidence', { precision: 5, scale: 4 })
      .default('0.8000')
      .notNull(),
    qualityScore: numeric('quality_score', { precision: 5, scale: 4 }),
    isResolved: boolean('is_resolved').default(false).notNull(),
    supersededById: uuid('superseded_by_id'),
    freshnessAt: timestamp('freshness_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    stalenessReason: text('staleness_reason'),
    metadata: jsonb('metadata').default(jsonbObjectDefault).notNull(),
    idempotencyKey: text('idempotency_key'),
  },
  (table) => ({
    userTopicEventLookup: index('rag_memory_user_topic_event_idx').on(
      table.userId,
      table.topicId,
      table.eventType,
      table.createdAt,
    ),
    unresolvedLookup: index('rag_memory_unresolved_idx').on(
      table.userId,
      table.topicId,
      table.eventType,
      table.createdAt,
    ),
    idempotencyUnique: uniqueIndex('rag_memory_idempotency_idx')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    lexicalSearchIdx: index('rag_memory_lexical_idx').using(
      'gin',
      sql`to_tsvector('english', coalesce(${table.lexicalSearchText}, ${table.content}))`,
    ),
  }),
);
