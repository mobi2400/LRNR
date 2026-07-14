import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jobStatusSchema,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import { jobRuns } from '@/db/schema';
import { AppError } from '@/server/errors';
import type { JobRunRow } from '@/db/types';

const jobRunRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  jobType: z.string(),
  status: jobStatusSchema,
  input: jsonObjectSchema,
  output: jsonObjectSchema.nullable(),
  error: jsonObjectSchema.nullable(),
  idempotencyKey: z.string().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const createJobRunInputSchema = z.object({
  jobType: z.string().trim().min(1).max(255),
  status: jobStatusSchema.default('queued'),
  input: jsonObjectSchema.default({}),
  idempotencyKey: z.string().trim().min(1).max(255).nullable().optional(),
  startedAt: z.date().nullable().optional(),
});

const updateJobStatusInputSchema = z.object({
  status: jobStatusSchema,
  output: jsonObjectSchema.nullable().optional(),
  error: jsonObjectSchema.nullable().optional(),
  startedAt: z.date().nullable().optional(),
  finishedAt: z.date().nullable().optional(),
});

const listByTypeInputSchema = z.object({
  jobType: z.string().trim().min(1).max(255),
  statuses: z.array(jobStatusSchema).min(1).optional(),
  limit: z.number().int().positive().max(20).default(10),
});

export type JobRunRecord = z.infer<typeof jobRunRecordSchema>;

function parseJobRunRow(row: JobRunRow): JobRunRecord {
  return jobRunRecordSchema.parse(row);
}

/**
 * Jobs repository gives workflows one durable status record per run so retries,
 * failures, and idempotent reruns are visible outside Redis.
 */
export function createJobsRepository(database: DbClient = db) {
  return {
    async createJobRun(
      actor: DbActor,
      input: z.infer<typeof createJobRunInputSchema>,
    ): Promise<JobRunRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = createJobRunInputSchema.parse(input);
      const [row] = await database
        .insert(jobRuns)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
          output: null,
          error: null,
          finishedAt: null,
        })
        .onConflictDoUpdate({
          target: [jobRuns.userId, jobRuns.idempotencyKey],
          set: {
            ...validatedInput,
            output: null,
            error: null,
            finishedAt: null,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseJobRunRow(
        requireMutationRow(row, 'Job run write did not return a row.'),
      );
    },

    async updateStatus(
      actor: DbActor,
      jobRunId: string,
      input: z.infer<typeof updateJobStatusInputSchema>,
    ): Promise<JobRunRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedJobRunId = z.string().uuid().parse(jobRunId);
      const validatedInput = updateJobStatusInputSchema.parse(input);
      const [row] = await database
        .update(jobRuns)
        .set({
          ...validatedInput,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(jobRuns.id, validatedJobRunId),
            eq(jobRuns.userId, validatedActor.userId),
          ),
        )
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Job run not found for the current owner.',
          status: 404,
        });
      }

      return parseJobRunRow(row);
    },

    async recordError(
      actor: DbActor,
      jobRunId: string,
      error: Record<string, unknown>,
    ): Promise<JobRunRecord> {
      return this.updateStatus(actor, jobRunId, {
        status: 'failed',
        error,
        finishedAt: new Date(),
      });
    },

    async getById(
      actor: DbActor,
      jobRunId: string,
    ): Promise<JobRunRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedJobRunId = z.string().uuid().parse(jobRunId);
      const rows = await database
        .select()
        .from(jobRuns)
        .where(
          and(
            eq(jobRuns.id, validatedJobRunId),
            eq(jobRuns.userId, validatedActor.userId),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseJobRunRow(row);
    },

    async listByType(
      actor: DbActor,
      input: z.infer<typeof listByTypeInputSchema>,
    ): Promise<JobRunRecord[]> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = listByTypeInputSchema.parse(input);
      const rows = await database
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.userId, validatedActor.userId));

      return rows
        .map(parseJobRunRow)
        .filter((row) => row.jobType === validatedInput.jobType)
        .filter((row) =>
          validatedInput.statuses === undefined
            ? true
            : validatedInput.statuses.includes(row.status),
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, validatedInput.limit);
    },
  };
}

export const jobsRepository = createJobsRepository();
