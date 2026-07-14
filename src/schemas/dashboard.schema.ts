import { z } from 'zod';

export const dashboardCurrentSessionSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1).nullable(),
  status: z.string().min(1).nullable(),
  objective: z.string().min(1).nullable(),
});

export const dashboardTopicSummarySchema = z.object({
  currentTopicSlug: z.string().min(1).nullable(),
  topicStatus: z.string().min(1).nullable(),
  currentSessionId: z.string().min(1).nullable(),
  currentSession: dashboardCurrentSessionSchema.nullable(),
  curriculumRevision: z.number().int().nullable(),
  completedSessionCount: z.number().int().nonnegative(),
  totalSessionCount: z.number().int().nonnegative(),
  nextEvaluationDueAt: z.string().datetime().nullable(),
});

export const dashboardAlertSummarySchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  deliveryKey: z.string().min(1),
  status: z.string().min(1),
  nextAttemptAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const dashboardWorkflowSummarySchema = z.object({
  id: z.string().uuid(),
  jobType: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).nullable();

export const dashboardResponseSchema = z.object({
  topic: dashboardTopicSummarySchema,
  alerts: z.array(dashboardAlertSummarySchema).max(5),
  latestWorkflow: dashboardWorkflowSummarySchema,
  cache: z.object({
    status: z.enum(['hit', 'miss', 'bypass']),
  }),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardTopicSummary = z.infer<typeof dashboardTopicSummarySchema>;
export type DashboardAlertSummary = z.infer<typeof dashboardAlertSummarySchema>;
export type DashboardWorkflowSummary = z.infer<typeof dashboardWorkflowSummarySchema>;