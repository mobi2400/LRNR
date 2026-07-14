import { z } from 'zod';

export const dependencyHealthSchema = z.enum(['ok', 'degraded', 'down']);
export const configurationStatusSchema = z.enum([
  'configured',
  'missing',
  'error',
]);

export const latestWorkflowRunSchema = z.object({
  id: z.string().uuid(),
  jobType: z.string().trim().min(1),
  status: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const systemStatusResponseSchema = z.object({
  postgres: dependencyHealthSchema,
  redis: dependencyHealthSchema,
  telegram: configurationStatusSchema,
  llm: configurationStatusSchema,
  embeddings: configurationStatusSchema,
  latestWorkflowRun: latestWorkflowRunSchema.nullable(),
});

export type DependencyHealth = z.infer<typeof dependencyHealthSchema>;
export type ConfigurationStatus = z.infer<typeof configurationStatusSchema>;
export type SystemStatusResponse = z.infer<typeof systemStatusResponseSchema>;
