import { z } from 'zod';

export const dailyLearningRouteSchema = z.enum([
  'continue_teaching',
  'evaluation_due',
  'waiting_for_onboarding',
  'no_op',
]);

export const dailyLearningResultSchema = z.object({
  route: dailyLearningRouteSchema,
  status: z.enum(['prepared', 'waiting', 'no_op']),
  reason: z.string().trim().min(1),
  topicSlug: z.string().nullable(),
  sessionId: z.string().nullable(),
  lessonReady: z.boolean(),
  repairableFailures: z.array(z.enum(['delivery', 'rag'])).default([]),
});

export type DailyLearningResult = z.infer<typeof dailyLearningResultSchema>;
