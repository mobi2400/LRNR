import { z } from 'zod';

export const preferredDepthSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

export const onboardingStatusSchema = z.enum([
  'not_started',
  'awaiting_reply',
  'processing',
  'completed',
]);

export const onboardingQuestionKindSchema = z.enum([
  'motivation',
  'background',
  'probe',
  'constraints',
]);

export const onboardingQuestionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: onboardingQuestionKindSchema,
  question: z.string().trim().min(1).max(2000),
});

export const onboardingTurnSchema = z.object({
  questionId: z.string().trim().min(1).max(64),
  questionKind: onboardingQuestionKindSchema,
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(4000),
  tags: z.array(z.string().trim().min(1).max(128)).default([]),
});

export const onboardingTopicBlueprintSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  requiredDepth: preferredDepthSchema,
  prerequisiteMap: z.array(z.string().trim().min(1).max(255)).default([]),
  conceptOutline: z.array(z.string().trim().min(1).max(255)).default([]),
});

export const architectOnboardingStateSchema = z.object({
  onboardingId: z.string().uuid(),
  status: onboardingStatusSchema.exclude(['not_started']),
  goal: z.string().trim().min(1).max(4000),
  background: z.string().trim().min(1).max(4000).nullable(),
  preferredDepth: preferredDepthSchema.default('beginner'),
  questions: z.array(onboardingQuestionSchema).min(1),
  currentQuestionIndex: z.number().int().min(0),
  currentQuestion: z.string().trim().min(1).max(2000).nullable(),
  turns: z.array(onboardingTurnSchema).default([]),
  inferredBackground: z.array(z.string().trim().min(1).max(255)).default([]),
  detectedStrengths: z.array(z.string().trim().min(1).max(255)).default([]),
  detectedWeakAreas: z.array(z.string().trim().min(1).max(255)).default([]),
  detectedMisconceptions: z.array(z.string().trim().min(1).max(255)).default([]),
  topicBlueprint: onboardingTopicBlueprintSchema.nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
});

export const startGoalRequestSchema = z.object({
  goal: z.string().trim().min(1).max(4000),
  background: z.string().trim().min(1).max(4000).optional(),
  preferredDepth: preferredDepthSchema.optional(),
});

export const onboardingReplyRequestSchema = z.object({
  onboardingId: z.string().uuid(),
  answer: z.string().trim().min(1).max(4000),
});

export const startGoalResponseSchema = z.object({
  onboardingId: z.string().uuid(),
  firstQuestion: z.string().trim().min(1),
  status: z.literal('awaiting_reply'),
});

export const onboardingCurrentResponseSchema = z.object({
  onboardingId: z.string().uuid().nullable(),
  status: onboardingStatusSchema,
  currentQuestion: z.string().trim().min(1).optional(),
  turnsCompleted: z.number().int().min(0),
});

export const onboardingReplyResponseSchema = z.object({
  status: z.union([z.literal('awaiting_reply'), z.literal('completed')]),
  nextQuestion: z.string().trim().min(1).optional(),
  topicBriefId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
});

export type PreferredDepth = z.infer<typeof preferredDepthSchema>;
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;
export type OnboardingQuestion = z.infer<typeof onboardingQuestionSchema>;
export type OnboardingTurn = z.infer<typeof onboardingTurnSchema>;
export type OnboardingTopicBlueprint = z.infer<
  typeof onboardingTopicBlueprintSchema
>;
export type ArchitectOnboardingState = z.infer<
  typeof architectOnboardingStateSchema
>;
export type StartGoalRequest = z.infer<typeof startGoalRequestSchema>;
export type OnboardingReplyRequest = z.infer<
  typeof onboardingReplyRequestSchema
>;
export type StartGoalResponse = z.infer<typeof startGoalResponseSchema>;
export type OnboardingCurrentResponse = z.infer<
  typeof onboardingCurrentResponseSchema
>;
export type OnboardingReplyResponse = z.infer<
  typeof onboardingReplyResponseSchema
>;
