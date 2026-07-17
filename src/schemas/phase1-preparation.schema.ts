import { z } from 'zod';

export const phase1PreparationResultSchema = z.object({
  status: z.enum(['prepared', 'already_prepared']),
  topicSlug: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  lessonReady: z.literal(true),
  repairableFailures: z.array(z.enum(['delivery', 'rag'])).default([]),
});

export type Phase1PreparationResult = z.infer<
  typeof phase1PreparationResultSchema
>;
