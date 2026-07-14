import { z } from 'zod';

export const lessonSectionSchema = z.object({
  heading: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(4000),
});

export const lessonCodeExampleSchema = z.object({
  title: z.string().trim().min(1).max(255),
  language: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(8000),
  explanation: z.string().trim().min(1).max(2000),
});

export const lessonReviewQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(1000),
  expectedPoints: z.array(z.string().trim().min(1).max(500)).min(1),
  hint: z.string().trim().min(1).max(1000),
});

export const lessonSourceReferenceSchema = z.object({
  label: z.string().trim().min(1).max(255),
  url: z.string().trim().min(1).max(2048),
});

export const lessonPayloadSchema = z.object({
  sessionId: z.string().trim().min(1),
  topicSlug: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  objective: z.string().trim().min(1).max(1000),
  mentalModel: z.string().trim().min(1).max(2000),
  explanation: z.array(lessonSectionSchema).min(1),
  diagram: z.object({
    type: z.enum(['description', 'mermaid']),
    content: z.string().trim().min(1).max(4000),
  }),
  codeExamples: z.array(lessonCodeExampleSchema).default([]),
  commonMistakes: z.array(z.string().trim().min(1).max(800)).default([]),
  reviewQuestions: z.array(lessonReviewQuestionSchema).min(1),
  sourceReferences: z.array(lessonSourceReferenceSchema).default([]),
  nextAction: z.string().trim().min(1).max(1000),
  generatedBy: z.literal('teaching_node'),
});

export const currentLessonResponseSchema = z.object({
  lesson: lessonPayloadSchema.nullable(),
  reasonIfEmpty: z
    .enum(['no_active_topic', 'not_ready', 'waiting_for_onboarding', 'completed'])
    .optional(),
});

export const markLessonCompleteRequestSchema = z.object({
  understood: z.boolean(),
  notes: z.string().trim().min(1).max(4000).optional(),
});

export const markLessonCompleteResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  status: z.literal('completed'),
  nextSessionId: z.string().trim().min(1).nullable(),
});

export const followUpRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

export const followUpResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  groundedIn: z.array(z.string().trim().min(1).max(2048)).default([]),
});

export type LessonPayload = z.infer<typeof lessonPayloadSchema>;
export type CurrentLessonResponse = z.infer<typeof currentLessonResponseSchema>;
export type MarkLessonCompleteResponse = z.infer<
  typeof markLessonCompleteResponseSchema
>;
export type FollowUpResponse = z.infer<typeof followUpResponseSchema>;
