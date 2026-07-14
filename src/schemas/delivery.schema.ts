import { z } from 'zod';

export const telegramDeliveryKindSchema = z.enum([
  'telegram_test',
  'lesson_ready',
]);

export const telegramDeliveryPayloadSchema = z.object({
  kind: telegramDeliveryKindSchema,
  text: z.string().trim().min(1).max(3800),
  deepLink: z.string().trim().url(),
  createdAt: z.string().datetime(),
});

export const queueTelegramTestAlertResponseSchema = z.object({
  queued: z.boolean(),
  deliveryKey: z.string().trim().min(1),
});

export const telegramProcessResultSchema = z.discriminatedUnion('processed', [
  z.object({
    processed: z.literal(false),
  }),
  z.object({
    processed: z.literal(true),
    outboxId: z.string().uuid(),
    status: z.enum(['sent', 'failed']),
  }),
]);

export type TelegramDeliveryPayload = z.infer<
  typeof telegramDeliveryPayloadSchema
>;
export type QueueTelegramTestAlertResponse = z.infer<
  typeof queueTelegramTestAlertResponseSchema
>;
export type TelegramProcessResult = z.infer<typeof telegramProcessResultSchema>;
