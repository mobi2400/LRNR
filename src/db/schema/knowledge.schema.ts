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
  sourceTypeEnum,
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
      table.topicSlug,
      table.eventType,
      table.createdAt,
      table.id,
    ),
    userConceptEventLookup: index('rag_memory_user_concept_event_idx').on(
      table.userId,
      table.conceptSlug,
      table.eventType,
      table.createdAt,
      table.id,
    ),
    unresolvedLookup: index('rag_memory_unresolved_idx')
      .on(
        table.userId,
        table.topicSlug,
        table.eventType,
        table.createdAt,
        table.id,
      )
      .where(sql`${table.isResolved} = false`),
    userCreatedLookup: index('rag_memory_user_created_idx').on(
      table.userId,
      table.createdAt,
      table.id,
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
export const sourceDocuments = table(
  'source_documents',
  {
    ...userScopedColumns,
    topicId: uuid('topic_id'),
    topicSlug: text('topic_slug'),
    sourceId: uuid('source_id'),
    sourceType: sourceTypeEnum('source_type').notNull(),
    title: text('title').notNull(),
    canonicalUrl: text('canonical_url'),
    author: text('author'),
    publisher: text('publisher'),
    language: text('language').default('en').notNull(),
    permissionScope: text('permission_scope').default('owner_private').notNull(),
    contentHash: text('content_hash').notNull(),
    normalizedContentHash: text('normalized_content_hash').notNull(),
    documentVersion: text('document_version').default('v1').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    freshnessAt: timestamp('freshness_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    sourceQualityScore: numeric('source_quality_score', {
      precision: 5,
      scale: 4,
    }),
    metadata: jsonb('metadata').default(jsonbObjectDefault).notNull(),
  },
  (table) => ({
    userTopicLookup: index('source_documents_user_topic_idx').on(
      table.userId,
      table.topicSlug,
      table.createdAt,
      table.id,
    ),
    contentDedupe: uniqueIndex('source_documents_user_normalized_hash_idx').on(
      table.userId,
      table.normalizedContentHash,
    ),
    canonicalUrlLookup: index('source_documents_canonical_url_idx').on(
      table.userId,
      table.canonicalUrl,
    ),
  }),
);

export const sourceChunks = table(
  'source_chunks',
  {
    ...userScopedColumns,
    documentId: uuid('document_id')
      .notNull()
      .references(() => sourceDocuments.id),
    topicId: uuid('topic_id'),
    topicSlug: text('topic_slug'),
    conceptId: uuid('concept_id'),
    conceptSlug: text('concept_slug'),
    curriculumLayer: text('curriculum_layer'),
    agentOwner: sourceAgentColumn,
    chunkStrategy: text('chunk_strategy').notNull(),
    chunkStrategyVersion: text('chunk_strategy_version').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    parentChunkId: uuid('parent_chunk_id'),
    sectionHeading: text('section_heading'),
    sectionPath: text('section_path'),
    retrievalText: text('retrieval_text').notNull(),
    synthesisText: text('synthesis_text'),
    tokenCount: integer('token_count').notNull(),
    contentHash: text('content_hash').notNull(),
    citationAnchor: text('citation_anchor').notNull(),
    characterStart: integer('character_start'),
    characterEnd: integer('character_end'),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: text('embedding_model'),
    embeddingVersion: text('embedding_version'),
    embeddingDimensions: integer('embedding_dimensions'),
    sourceQualityScore: numeric('source_quality_score', {
      precision: 5,
      scale: 4,
    }),
    freshnessAt: timestamp('freshness_at', { withTimezone: true }),
    metadata: jsonb('metadata').default(jsonbObjectDefault).notNull(),
  },
  (table) => ({
    documentChunkUnique: uniqueIndex('source_chunks_document_chunk_idx').on(
      table.documentId,
      table.chunkIndex,
    ),
    userTopicLookup: index('source_chunks_user_topic_idx').on(
      table.userId,
      table.topicSlug,
      table.createdAt,
      table.id,
    ),
    userConceptLookup: index('source_chunks_user_concept_idx').on(
      table.userId,
      table.conceptSlug,
      table.createdAt,
      table.id,
    ),
    contentDedupe: uniqueIndex('source_chunks_user_content_hash_idx').on(
      table.userId,
      table.contentHash,
    ),
    lexicalSearchIdx: index('source_chunks_lexical_idx').using(
      'gin',
      sql`to_tsvector('english', ${table.retrievalText})`,
    ),
  }),
);

