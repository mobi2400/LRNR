import { and, asc, eq, lte } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import { deliveryOutbox } from '@/db/schema';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  notificationChannelSchema,
  outboxStatusSchema,
} from '@/db/repository-helpers';
import { AppError } from '@/server/errors';
import type { DeliveryOutboxRow } from '@/db/types';

const outboxRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  channel: notificationChannelSchema,
  deliveryKey: z.string(),
  payload: jsonObjectSchema,
  status: outboxStatusSchema,
  attemptCount: z.number().int(),
  nextAttemptAt: z.date(),
  lastError: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const createOutboxItemInputSchema = z.object({
  channel: notificationChannelSchema,
  deliveryKey: z.string().trim().min(1).max(255),
  payload: jsonObjectSchema,
  status: outboxStatusSchema.default('pending'),
  nextAttemptAt: z.date().default(() => new Date()),
});

const markOutboxFailureInputSchema = z.object({
  lastError: z.string().trim().min(1).max(4000),
  nextAttemptAt: z.date(),
});

export type DeliveryOutboxRecord = z.infer<typeof outboxRecordSchema>;

function parseOutboxRow(row: DeliveryOutboxRow): DeliveryOutboxRecord {
  return outboxRecordSchema.parse(row);
}

/**
 * Outbox repository centralizes duplicate-protected delivery writes and the
 * pending->sending claim step that workers will use before calling Telegram.
 */
export function createOutboxRepository(database: DbClient = db) {
  return {
    async createDeliveryItem(
      actor: DbActor,
      input: z.infer<typeof createOutboxItemInputSchema>,
    ): Promise<DeliveryOutboxRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = createOutboxItemInputSchema.parse(input);
      const [insertedRow] = await database
        .insert(deliveryOutbox)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoNothing()
        .returning();

      if (insertedRow !== undefined) {
        return parseOutboxRow(insertedRow);
      }

      const rows = await database
        .select()
        .from(deliveryOutbox)
        .where(
          and(
            eq(deliveryOutbox.userId, validatedActor.userId),
            eq(deliveryOutbox.deliveryKey, validatedInput.deliveryKey),
          ),
        )
        .limit(1);
      const existingRow = getOneOrNull(rows);

      if (existingRow === null) {
        throw new Error('Delivery outbox write conflicted but no existing row was found.');
      }

      return parseOutboxRow(existingRow);
    },

    async claimPendingDelivery(
      actor: DbActor,
      now = new Date(),
    ): Promise<DeliveryOutboxRecord | null> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select()
        .from(deliveryOutbox)
        .where(
          and(
            eq(deliveryOutbox.userId, validatedActor.userId),
            eq(deliveryOutbox.status, 'pending'),
            lte(deliveryOutbox.nextAttemptAt, now),
          ),
        )
        .orderBy(asc(deliveryOutbox.nextAttemptAt), asc(deliveryOutbox.createdAt))
        .limit(1);
      const pendingRow = getOneOrNull(rows);

      if (pendingRow === null) {
        return null;
      }

      const [claimedRow] = await database
        .update(deliveryOutbox)
        .set({
          status: 'sending',
          attemptCount: pendingRow.attemptCount + 1,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(deliveryOutbox.id, pendingRow.id),
            eq(deliveryOutbox.status, 'pending'),
          ),
        )
        .returning();

      return claimedRow === undefined ? null : parseOutboxRow(claimedRow);
    },

    async markSent(
      actor: DbActor,
      outboxId: string,
    ): Promise<DeliveryOutboxRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedOutboxId = z.string().uuid().parse(outboxId);
      const [row] = await database
        .update(deliveryOutbox)
        .set({
          status: 'sent',
          lastError: null,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(deliveryOutbox.id, validatedOutboxId),
            eq(deliveryOutbox.userId, validatedActor.userId),
          ),
        )
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Outbox row not found for the current owner.',
          status: 404,
        });
      }

      return parseOutboxRow(row);
    },

    async markFailed(
      actor: DbActor,
      outboxId: string,
      input: z.infer<typeof markOutboxFailureInputSchema>,
    ): Promise<DeliveryOutboxRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedOutboxId = z.string().uuid().parse(outboxId);
      const validatedInput = markOutboxFailureInputSchema.parse(input);
      const [row] = await database
        .update(deliveryOutbox)
        .set({
          status: 'failed',
          lastError: validatedInput.lastError,
          nextAttemptAt: validatedInput.nextAttemptAt,
          ...buildUpdatedAtPatch(),
        })
        .where(
          and(
            eq(deliveryOutbox.id, validatedOutboxId),
            eq(deliveryOutbox.userId, validatedActor.userId),
          ),
        )
        .returning();

      if (row === undefined) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Outbox row not found for the current owner.',
          status: 404,
        });
      }

      return parseOutboxRow(row);
    },
  };
}

export const outboxRepository = createOutboxRepository();
