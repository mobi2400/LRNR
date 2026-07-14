import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  apiIdempotencyKeys,
} from '@/db/schema';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import type { ApiIdempotencyKeyRow } from '@/db/types';

const apiIdempotencyRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  key: z.string(),
  route: z.string(),
  requestHash: z.string(),
  response: jsonObjectSchema.nullable(),
  status: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const saveIdempotencyRecordInputSchema = z.object({
  key: z.string().trim().min(1).max(255),
  route: z.string().trim().min(1).max(255),
  requestHash: z.string().trim().min(1).max(255),
  response: jsonObjectSchema,
  status: z.string().trim().min(1).max(64).default('completed'),
  expiresAt: z.date(),
});

export type ApiIdempotencyRecord = z.infer<typeof apiIdempotencyRecordSchema>;

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

    async saveResponse(
      actor: DbActor,
      input: z.infer<typeof saveIdempotencyRecordInputSchema>,
    ): Promise<ApiIdempotencyRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = saveIdempotencyRecordInputSchema.parse(input);
      const [row] = await database
        .insert(apiIdempotencyKeys)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoUpdate({
          target: [apiIdempotencyKeys.userId, apiIdempotencyKeys.key],
          set: {
            route: validatedInput.route,
            requestHash: validatedInput.requestHash,
            response: validatedInput.response,
            status: validatedInput.status,
            expiresAt: validatedInput.expiresAt,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseApiIdempotencyRow(
        requireMutationRow(row, 'Idempotency response write did not return a row.'),
      );
    },
  };
}

export const apiIdempotencyRepository = createApiIdempotencyRepository();
