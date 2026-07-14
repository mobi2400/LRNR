import { z } from 'zod';

export const sourceTypeSchema = z.enum([
  'topic_brief',
  'official_docs',
  'source_repo',
  'tutorial',
  'engineering_blog',
  'changelog',
  'paper',
  'community',
]);

export const credibilityTierSchema = z.enum([
  'tier_1',
  'tier_2',
  'tier_3',
  'tier_4',
]);

export const researchQualitySchema = z.enum([
  'complete',
  'partial',
  'minimal',
]);

export const sourceCandidateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().min(1).max(2048),
  sourceType: sourceTypeSchema,
  credibilityTier: credibilityTierSchema,
  isCritical: z.boolean().default(false),
  seedText: z.string().trim().min(1).optional(),
});

export const fetchedSourceSchema = sourceCandidateSchema.extend({
  retrievedAt: z.string().datetime(),
  content: z.string().trim().min(1),
  relevantSections: z.array(z.string().trim().min(1)).default([]),
});

export const failedSourceSchema = sourceCandidateSchema.extend({
  failedAt: z.string().datetime(),
  errorMessage: z.string().trim().min(1),
});

export const sourceInventoryEntrySchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().min(1).max(2048),
  retrievedAt: z.string().datetime(),
  sourceType: sourceTypeSchema,
  credibilityTier: credibilityTierSchema,
  credibilitySignal: z.string().trim().min(1).max(500),
  relevantSections: z.array(z.string().trim().min(1)).default([]),
});

export const knowledgeProvenanceSchema = z.object({
  sourceName: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1),
  credibilityTier: credibilityTierSchema,
});

export const conceptKnowledgeSchema = z.object({
  slug: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(1000),
  prerequisiteSlugs: z.array(z.string().trim().min(1).max(255)).default([]),
  orderingHint: z.number().int().min(0),
  provenance: z.array(knowledgeProvenanceSchema).min(1),
});

export const claimKnowledgeSchema = z.object({
  claim: z.string().trim().min(1).max(1500),
  conceptSlug: z.string().trim().min(1).max(255).nullable().default(null),
  provenance: z.array(knowledgeProvenanceSchema).min(1),
});

export const limitationKnowledgeSchema = z.object({
  limitation: z.string().trim().min(1).max(1500),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  provenance: z.array(knowledgeProvenanceSchema).min(1),
});

export const codePatternKnowledgeSchema = z.object({
  title: z.string().trim().min(1).max(255),
  pattern: z.string().trim().min(1).max(1500),
  whenToUse: z.string().trim().min(1).max(1000),
  provenance: z.array(knowledgeProvenanceSchema).min(1),
});

export const topicKnowledgeDocumentSchema = z.object({
  sourceInventory: z.array(sourceInventoryEntrySchema).min(1),
  conceptMap: z.array(conceptKnowledgeSchema).min(1),
  claims: z.array(claimKnowledgeSchema).default([]),
  limitations: z.array(limitationKnowledgeSchema).default([]),
  codePatterns: z.array(codePatternKnowledgeSchema).default([]),
  versionNotes: z.array(claimKnowledgeSchema).default([]),
  interviewPatterns: z.array(claimKnowledgeSchema).default([]),
  metadata: z.object({
    researchQuality: researchQualitySchema,
    failedSources: z.array(failedSourceSchema).default([]),
    generatedBy: z.literal('cartographer_node'),
  }),
});

export type SourceCandidate = z.infer<typeof sourceCandidateSchema>;
export type FetchedSource = z.infer<typeof fetchedSourceSchema>;
export type FailedSource = z.infer<typeof failedSourceSchema>;
export type SourceInventoryEntry = z.infer<typeof sourceInventoryEntrySchema>;
export type KnowledgeProvenance = z.infer<typeof knowledgeProvenanceSchema>;
export type TopicKnowledgeDocument = z.infer<typeof topicKnowledgeDocumentSchema>;
