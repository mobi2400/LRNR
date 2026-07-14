import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import { assertDbActor, type DbActor, getOneOrNull } from '@/db/repository-helpers';
import { curriculumState, deliveryOutbox, jobRuns, userProfile } from '@/db/schema';
import {
  dashboardAlertSummarySchema,
  dashboardTopicSummarySchema,
  dashboardWorkflowSummarySchema,
  type DashboardAlertSummary,
  type DashboardTopicSummary,
  type DashboardWorkflowSummary,
} from '@/schemas/dashboard.schema';

const DASHBOARD_ALERT_LIMIT = 5;
const DASHBOARD_WORKFLOW_TYPES = [
  'architect_onboarding',
  'cartographer_mapping',
  'curriculum_build',
  'teaching_session',
] as const;

const currentSessionJsonSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    objective: z.string().min(1).optional(),
    lesson: z
      .object({
        objective: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function normalizeCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function parseCurrentSession(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = currentSessionJsonSchema.parse(value);

  return {
    sessionId: parsed.id,
    title: parsed.title ?? null,
    status: parsed.status ?? null,
    objective: parsed.objective ?? parsed.lesson?.objective ?? null,
  };
}

export function createDashboardRepository(database: DbClient = db) {
  return {
    async getCurrentSummary(actor: DbActor): Promise<DashboardTopicSummary> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select({
          currentTopicSlug: userProfile.currentTopicSlug,
          nextEvaluationDueAt: userProfile.nextEvaluationDueAt,
          topicStatus: curriculumState.status,
          currentSessionId: curriculumState.currentSessionId,
          curriculumRevision: curriculumState.revision,
          currentSession: sql<unknown>`(
            select session_item
            from jsonb_array_elements(${curriculumState.layer2Sessions}) as session_item
            where session_item->>'id' = ${curriculumState.currentSessionId}
            limit 1
          )`,
          completedSessionCount: sql<number>`(
            select count(*)::int
            from jsonb_array_elements(${curriculumState.layer2Sessions}) as session_item
            where session_item->>'status' = 'completed'
          )`,
          totalSessionCount: sql<number>`jsonb_array_length(${curriculumState.layer2Sessions})`,
        })
        .from(userProfile)
        .leftJoin(
          curriculumState,
          and(
            eq(curriculumState.userId, userProfile.userId),
            eq(curriculumState.topicSlug, userProfile.currentTopicSlug),
          ),
        )
        .where(eq(userProfile.userId, validatedActor.userId))
        .limit(1);
      const row = getOneOrNull(rows);

      if (row === null) {
        return dashboardTopicSummarySchema.parse({
          currentTopicSlug: null,
          topicStatus: null,
          currentSessionId: null,
          currentSession: null,
          curriculumRevision: null,
          completedSessionCount: 0,
          totalSessionCount: 0,
          nextEvaluationDueAt: null,
        });
      }

      return dashboardTopicSummarySchema.parse({
        currentTopicSlug: row.currentTopicSlug,
        topicStatus: row.topicStatus,
        currentSessionId: row.currentSessionId,
        currentSession: parseCurrentSession(row.currentSession),
        curriculumRevision: row.curriculumRevision,
        completedSessionCount: normalizeCount(row.completedSessionCount),
        totalSessionCount: normalizeCount(row.totalSessionCount),
        nextEvaluationDueAt: row.nextEvaluationDueAt?.toISOString() ?? null,
      });
    },

    async listRecentAlerts(actor: DbActor): Promise<DashboardAlertSummary[]> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select({
          id: deliveryOutbox.id,
          channel: deliveryOutbox.channel,
          deliveryKey: deliveryOutbox.deliveryKey,
          status: deliveryOutbox.status,
          nextAttemptAt: deliveryOutbox.nextAttemptAt,
          createdAt: deliveryOutbox.createdAt,
        })
        .from(deliveryOutbox)
        .where(eq(deliveryOutbox.userId, validatedActor.userId))
        .orderBy(desc(deliveryOutbox.createdAt), desc(deliveryOutbox.id))
        .limit(DASHBOARD_ALERT_LIMIT);

      return rows.map((row) =>
        dashboardAlertSummarySchema.parse({
          ...row,
          nextAttemptAt: row.nextAttemptAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        }),
      );
    },

    async getLatestWorkflow(actor: DbActor): Promise<DashboardWorkflowSummary> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select({
          id: jobRuns.id,
          jobType: jobRuns.jobType,
          status: jobRuns.status,
          createdAt: jobRuns.createdAt,
          updatedAt: jobRuns.updatedAt,
        })
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.userId, validatedActor.userId),
            inArray(jobRuns.jobType, [...DASHBOARD_WORKFLOW_TYPES]),
          ),
        )
        .orderBy(desc(jobRuns.createdAt), desc(jobRuns.id))
        .limit(1);
      const row = getOneOrNull(rows);

      if (row === null) {
        return null;
      }

      return dashboardWorkflowSummarySchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  };
}

export const dashboardRepository = createDashboardRepository();