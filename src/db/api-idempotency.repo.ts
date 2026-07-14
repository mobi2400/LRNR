import { and, eq, lte } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import { apiIdempotencyKeys } from '@/db/schema';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import type { ApiIdempotencyKeyRow } from '@/db/types';
import { incrementMetric } from '@/server/metrics';

export const apiIdempotencyStatusSchema = z.enum([
  'processing',
  'completed',
  'failed_retryable',
  'failed_terminal',
]);

const apiIdempotencyRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  key: z.string(),
  route: z.string(),
  requestHash: z.string(),
  response: jsonObjectSchema.nullable(),
  responseStatusCode: z.number().int().positive().nullable(),
  status: apiIdempotencyStatusSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const reserveIdempotencyRecordInputSchema = z.object({
  key: z.string().trim().min(1).max(255),
  route: z.string().trim().min(1).max(255),
  requestHash: z.string().trim().min(1).max(255),
  expiresAt: z.date(),
});

const completeIdempotencyRecordInputSchema = z.object({
  key: z.string().trim().min(1).max(255),
  response: jsonObjectSchema,
  responseStatusCode: z.number().int().min(100).max(599),
});

const failIdempotencyRecordInputSchema = z.object({
  key: z.string().trim().min(1).max(255),
  retryable: z.boolean(),
  response: jsonObjectSchema.nullable().optional(),
  responseStatusCode: z.number().int().min(100).max(599).nullable().optional(),
});

export type ApiIdempotencyStatus = z.infer<typeof apiIdempotencyStatusSchema>;
export type ApiIdempotencyRecord = z.infer<typeof apiIdempotencyRecordSchema>;
export type IdempotencyReservationResult =
  | { reserved: true; record: ApiIdempotencyRecord }
  | { reserved: false; record: ApiIdempotencyRecord };

function parseApiIdempotencyRow(
  row: ApiIdempotencyKeyRow,
): ApiIdempotencyRecord {
  return apiIdempotencyRecordSchema.parse(row);
}

export function createApiIdempotencyRepository(database: DbClient = db) {
  return {
    async getByKey(
      actor: DbActor,
      key: string,
    ): Promise<ApiIdempotencyRecord | null> {
      const validatedActor = assertDbActor(actor);
      const validatedKey = z.string().trim().min(1).parse(key);
      const rows = await database
        .select()
        .from(apiIdempotencyKeys)
        .where(
          and(
            eq(apiIdempotencyKeys.userId, validatedActor.userId),
            eq(apiIdempotencyKeys.key, validatedKey),
          ),
        )
        .limit(1);

      const row = getOneOrNull(rows);

      return row === null ? null : parseApiIdempotencyRow(row);
    },

    async reserveProcessing(
      actor: DbActor,
      input: z.infer<typeof reserveIdempotencyRecordInputSchema>,
      now = new Date(),
    ): Promise<IdempotencyReservationResult> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = reserveIdempotencyRecordInputSchema.parse(input);
      const [insertedRow] = await database
        .insert(apiIdempotencyKeys)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
          response: null,
          responseStatusCode: null,
          status: 'processing',
        })
        .onConflictDoNothing()
        .returning();

      if (insertedRow !== undefined) {
        incrementMetric('idempotency_reservation_total', { result: 'success' });

        return {
          reserved: true,
          record: parseApiIdempotencyRow(insertedRow),
        };
      }

      const existing = await this.getByKey(validatedActor, validatedInput.key);

      if (existing === null) {
        throw new Error(
          'Idempotency reservation conflicted but no existing row was found.',
        );
      }

      if (existing.expiresAt > now) {
        incrementMetric('idempotency_reservation_total', {
          result: existing.status === 'completed' ? 'replay' : existing.status,
        });

        return {
          reserved: false,
          record: existing,
        };
      }

      const [reclaimedRow] = await database
        .update(apiIdempotencyKeys)
        .set({
          route: validatedInput.route,
          requestHash: validatedInput.requestHash,
          response: null,
          responseStatusCode: null,
          status: 'processing',
          expiresAt: validatedInput.expiresAt,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(apiIdempotencyKeys.userId, validatedActor.userId),
            eq(apiIdempotencyKeys.key, validatedInput.key),
            lte(apiIdempotencyKeys.expiresAt, now),
          ),
        )
        .returning();

      if (reclaimedRow === undefined) {
        incrementMetric('idempotency_reservation_total', { result: 'in_progress' });

        return {
          reserved: false,
          record: existing,
        };
      }

      incrementMetric('idempotency_reservation_total', { result: 'expired_reclaimed' });

      return {
        reserved: true,
        record: parseApiIdempotencyRow(reclaimedRow),
      };
    },

    async completeResponse(
      actor: DbActor,
      input: z.infer<typeof completeIdempotencyRecordInputSchema>,
    ): Promise<ApiIdempotencyRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = completeIdempotencyRecordInputSchema.parse(input);
      const [row] = await database
        .update(apiIdempotencyKeys)
        .set({
          response: validatedInput.response,
          responseStatusCode: validatedInput.responseStatusCode,
          status: 'completed',
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(apiIdempotencyKeys.userId, validatedActor.userId),
            eq(apiIdempotencyKeys.key, validatedInput.key),
            eq(apiIdempotencyKeys.status, 'processing'),
          ),
        )
        .returning();

      incrementMetric('idempotency_completion_total', { result: 'completed' });

      return parseApiIdempotencyRow(
        requireMutationRow(row, 'Idempotency completion did not return a row.'),
      );
    },

    async recordFailure(
      actor: DbActor,
      input: z.infer<typeof failIdempotencyRecordInputSchema>,
    ): Promise<ApiIdempotencyRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = failIdempotencyRecordInputSchema.parse(input);
      const [row] = await database
        .update(apiIdempotencyKeys)
        .set({
          response: validatedInput.response ?? null,
          responseStatusCode: validatedInput.responseStatusCode ?? null,
          status: validatedInput.retryable ? 'failed_retryable' : 'failed_terminal',
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(apiIdempotencyKeys.userId, validatedActor.userId),
            eq(apiIdempotencyKeys.key, validatedInput.key),
            eq(apiIdempotencyKeys.status, 'processing'),
          ),
        )
        .returning();

      incrementMetric('idempotency_completion_total', {
        result: validatedInput.retryable ? 'failed_retryable' : 'failed_terminal',
      });

      return parseApiIdempotencyRow(
        requireMutationRow(row, 'Idempotency failure write did not return a row.'),
      );
    },
  };
}

export const apiIdempotencyRepository = createApiIdempotencyRepository();