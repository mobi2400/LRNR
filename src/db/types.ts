import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  apiIdempotencyKeys,
  conceptPrerequisites,
  concepts,
  curriculumState,
  deliveryOutbox,
  jobRuns,
  notificationPreferences,
  ragMemory,
  topicBriefs,
  topicKnowledgeBase,
  userProfile,
} from '@/db/schema';

export type UserProfileRow = InferSelectModel<typeof userProfile>;
export type NewUserProfileRow = InferInsertModel<typeof userProfile>;

export type TopicBriefRow = InferSelectModel<typeof topicBriefs>;
export type NewTopicBriefRow = InferInsertModel<typeof topicBriefs>;

export type CurriculumStateRow = InferSelectModel<typeof curriculumState>;
export type NewCurriculumStateRow = InferInsertModel<typeof curriculumState>;

export type TopicKnowledgeBaseRow = InferSelectModel<typeof topicKnowledgeBase>;
export type NewTopicKnowledgeBaseRow = InferInsertModel<
  typeof topicKnowledgeBase
>;

export type RagMemoryRow = InferSelectModel<typeof ragMemory>;
export type NewRagMemoryRow = InferInsertModel<typeof ragMemory>;

export type JobRunRow = InferSelectModel<typeof jobRuns>;
export type NewJobRunRow = InferInsertModel<typeof jobRuns>;

export type ApiIdempotencyKeyRow = InferSelectModel<typeof apiIdempotencyKeys>;
export type NewApiIdempotencyKeyRow = InferInsertModel<
  typeof apiIdempotencyKeys
>;

export type DeliveryOutboxRow = InferSelectModel<typeof deliveryOutbox>;
export type NewDeliveryOutboxRow = InferInsertModel<typeof deliveryOutbox>;

export type NotificationPreferencesRow = InferSelectModel<
  typeof notificationPreferences
>;
export type NewNotificationPreferencesRow = InferInsertModel<
  typeof notificationPreferences
>;

export type ConceptRow = InferSelectModel<typeof concepts>;
export type NewConceptRow = InferInsertModel<typeof concepts>;

export type ConceptPrerequisiteRow = InferSelectModel<
  typeof conceptPrerequisites
>;
export type NewConceptPrerequisiteRow = InferInsertModel<
  typeof conceptPrerequisites
>;
