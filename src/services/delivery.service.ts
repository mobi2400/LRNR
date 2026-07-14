import {
  outboxRepository,
  type DeliveryOutboxRecord,
} from '@/db/outbox.repo';
import { notificationPreferencesRepository } from '@/db/notification-preferences.repo';
import type { DbActor } from '@/db/repository-helpers';
import { sendTelegramMessage, splitTelegramMessage } from '@/lib/telegram';
import {
  queueTelegramTestAlertResponseSchema,
  telegramDeliveryPayloadSchema,
  telegramProcessResultSchema,
  type QueueTelegramTestAlertResponse,
  type TelegramDeliveryPayload,
  type TelegramProcessResult,
} from '@/schemas/delivery.schema';
import { serverConfig } from '@/server/config';
import { AppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/delivery.service.ts');

const TELEGRAM_RETRY_DELAY_MS = 5 * 60 * 1000;

export interface LessonReadyAlertInput {
  sessionId: string;
  title: string;
}

function buildDeepLink(path: string): string {
  return new URL(path, serverConfig.appUrl).toString();
}

export function buildTelegramTestAlertPayload(
  now = new Date(),
): TelegramDeliveryPayload {
  const deepLink = buildDeepLink('/dashboard');

  return telegramDeliveryPayloadSchema.parse({
    kind: 'telegram_test',
    text: `LRNR test alert is ready.\nOpen cockpit: ${deepLink}`,
    deepLink,
    createdAt: now.toISOString(),
  });
}

export function buildLessonReadyAlertPayload(
  input: LessonReadyAlertInput,
  now = new Date(),
): TelegramDeliveryPayload {
  const deepLink = buildDeepLink('/lesson/current');

  return telegramDeliveryPayloadSchema.parse({
    kind: 'lesson_ready',
    text: `Your LRNR lesson is ready: ${input.title}\nOpen lesson: ${deepLink}`,
    deepLink,
    createdAt: now.toISOString(),
  });
}

export function buildTelegramTestDeliveryKey(
  actor: DbActor,
  idempotencyKey: string,
): string {
  return `telegram-test:${actor.userId}:${idempotencyKey}`;
}

function isQueued(record: DeliveryOutboxRecord): boolean {
  return record.status === 'pending' || record.status === 'sending';
}

async function getTelegramChatId(actor: DbActor): Promise<string> {
  const preferences = await notificationPreferencesRepository.getForUser(actor);

  if (preferences?.telegramEnabled === false) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Telegram alerts are disabled for this owner.',
      status: 403,
    });
  }

  return preferences?.telegramChatId ?? serverConfig.telegram.ownerChatId;
}

export const deliveryService = {
  async queueTelegramTestAlert(
    actor: DbActor,
    idempotencyKey: string,
  ): Promise<QueueTelegramTestAlertResponse> {
    const deliveryKey = buildTelegramTestDeliveryKey(actor, idempotencyKey);
    const record = await outboxRepository.createDeliveryItem(actor, {
      channel: 'telegram',
      deliveryKey,
      payload: { ...buildTelegramTestAlertPayload() },
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    return queueTelegramTestAlertResponseSchema.parse({
      queued: isQueued(record),
      deliveryKey: record.deliveryKey,
    });
  },

  async queueLessonReadyAlert(
    actor: DbActor,
    input: LessonReadyAlertInput,
  ): Promise<DeliveryOutboxRecord> {
    return outboxRepository.createDeliveryItem(actor, {
      channel: 'telegram',
      deliveryKey: `lesson-ready:${actor.userId}:${input.sessionId}`,
      payload: { ...buildLessonReadyAlertPayload(input) },
      status: 'pending',
      nextAttemptAt: new Date(),
    });
  },

  async processNextTelegramDelivery(
    actor: DbActor,
  ): Promise<TelegramProcessResult> {
    const claimed = await outboxRepository.claimPendingDelivery(actor);

    if (claimed === null) {
      return telegramProcessResultSchema.parse({
        processed: false,
      });
    }

    try {
      const payload = telegramDeliveryPayloadSchema.parse(claimed.payload);
      const chatId = await getTelegramChatId(actor);

      for (const chunk of splitTelegramMessage(payload.text)) {
        await sendTelegramMessage({
          chatId,
          text: chunk,
        });
      }

      const sent = await outboxRepository.markSent(actor, claimed.id);

      return telegramProcessResultSchema.parse({
        processed: true,
        outboxId: sent.id,
        status: 'sent',
      });
    } catch (error) {
      await outboxRepository.markFailed(actor, claimed.id, {
        lastError:
          error instanceof Error ? error.message : 'Telegram delivery failed.',
        nextAttemptAt: new Date(Date.now() + TELEGRAM_RETRY_DELAY_MS),
      });

      return telegramProcessResultSchema.parse({
        processed: true,
        outboxId: claimed.id,
        status: 'failed',
      });
    }
  },
};
