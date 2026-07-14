import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DbClient } from '@/db/client';
import {
  assertDbActor,
  buildUpdatedAtPatch,
  type DbActor,
  getOneOrNull,
  jsonObjectSchema,
  requireMutationRow,
} from '@/db/repository-helpers';
import { notificationPreferences } from '@/db/schema';
import type { NotificationPreferencesRow } from '@/db/types';

const notificationPreferencesRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  telegramEnabled: z.boolean(),
  telegramChatId: z.string().nullable(),
  dailyLearningAlertEnabled: z.boolean(),
  evaluationAlertEnabled: z.boolean(),
  digestAlertEnabled: z.boolean(),
  quietHours: jsonObjectSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

const upsertNotificationPreferencesInputSchema = z.object({
  telegramEnabled: z.boolean().default(true),
  telegramChatId: z.string().trim().min(1).max(255).nullable().optional(),
  dailyLearningAlertEnabled: z.boolean().default(true),
  evaluationAlertEnabled: z.boolean().default(true),
  digestAlertEnabled: z.boolean().default(true),
  quietHours: jsonObjectSchema.default({}),
});

export type NotificationPreferencesRecord = z.infer<
  typeof notificationPreferencesRecordSchema
>;

function parseNotificationPreferencesRow(
  row: NotificationPreferencesRow,
): NotificationPreferencesRecord {
  return notificationPreferencesRecordSchema.parse(row);
}

/**
 * Notification preferences repository exposes the durable owner-facing delivery
 * switches without mixing them into outbox retry mechanics.
 */
export function createNotificationPreferencesRepository(database: DbClient = db) {
  return {
    async getForUser(
      actor: DbActor,
    ): Promise<NotificationPreferencesRecord | null> {
      const validatedActor = assertDbActor(actor);
      const rows = await database
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, validatedActor.userId))
        .limit(1);
      const row = getOneOrNull(rows);

      return row === null ? null : parseNotificationPreferencesRow(row);
    },

    async upsertForUser(
      actor: DbActor,
      input: z.infer<typeof upsertNotificationPreferencesInputSchema>,
    ): Promise<NotificationPreferencesRecord> {
      const validatedActor = assertDbActor(actor);
      const validatedInput = upsertNotificationPreferencesInputSchema.parse(input);
      const [row] = await database
        .insert(notificationPreferences)
        .values({
          userId: validatedActor.userId,
          ...validatedInput,
        })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: {
            ...validatedInput,
            ...buildUpdatedAtPatch(),
          },
        })
        .returning();

      return parseNotificationPreferencesRow(
        requireMutationRow(
          row,
          'Notification preferences write did not return a row.',
        ),
      );
    },
  };
}

export const notificationPreferencesRepository =
  createNotificationPreferencesRepository();
