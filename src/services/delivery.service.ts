import { apiIdempotencyRepository } from '@/db/api-idempotency.repo';
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
import { assertIdempotencyReplay, type AnyApiEnvelope } from '@/server/idempotency';
import { serverConfig } from '@/server/config';
import { AppError } from '@/server/errors';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/delivery.service.ts');

const TELEGRAM_MAX_PHASE1_MESSAGE_LENGTH = 3800;
const TELEGRAM_RETRY_BASE_DELAY_MS = 60 * 1000;
const TELEGRAM_RETRY_MAX_DELAY_MS = 60 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;

export interface LessonReadyAlertInput {
  sessionId: string;
  title: string;
}


export function getTelegramRetryDelayMs(attemptCount: number): number {
  const exponent = Math.max(attemptCount - 1, 0);
  const delay = TELEGRAM_RETRY_BASE_DELAY_MS * 2 ** exponent;

  return Math.min(delay, TELEGRAM_RETRY_MAX_DELAY_MS);
}

export function assertPhase1TelegramMessageFitsSingleSend(text: string): void {
  if (splitTelegramMessage(text, TELEGRAM_MAX_PHASE1_MESSAGE_LENGTH).length > 1) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message:
        'Phase 1 Telegram alerts must fit in one message to avoid partial-send duplication.',
      status: 400,
    });
  }
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
    route: string,
    requestHash: string,
  ): Promise<QueueTelegramTestAlertResponse> {
    const reservation = await apiIdempotencyRepository.reserveProcessing(actor, {
      key: idempotencyKey,
      route,
      requestHash,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    });

    if (!reservation.reserved) {
      const replay = assertIdempotencyReplay<AnyApiEnvelope>(
        {
          key: reservation.record.key,
          route: reservation.record.route,
          requestHash: reservation.record.requestHash,
          response: reservation.record.response as AnyApiEnvelope | null,
          statusCode: reservation.record.responseStatusCode,
          status: reservation.record.status,
        },
        route,
        requestHash,
      );

      if (!replay.ok) {
        throw new Error(replay.error.message);
      }

      return queueTelegramTestAlertResponseSchema.parse(replay.data);
    }

    const deliveryKey = buildTelegramTestDeliveryKey(actor, idempotencyKey);
    const record = await outboxRepository.createDeliveryItem(actor, {
      channel: 'telegram',
      deliveryKey,
      payload: { ...buildTelegramTestAlertPayload() },
      status: 'pending',
      nextAttemptAt: new Date(),
    });

    const response = queueTelegramTestAlertResponseSchema.parse({
      queued: isQueued(record),
      deliveryKey: record.deliveryKey,
    });

    await apiIdempotencyRepository.completeResponse(actor, {
      key: idempotencyKey,
      response: {
        ok: true,
        requestId: actor.requestId ?? 'request',
        data: response,
      },
      responseStatusCode: 200,
    });

    return response;
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

      assertPhase1TelegramMessageFitsSingleSend(payload.text);
      await sendTelegramMessage({
        chatId,
        text: payload.text,
      });

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
        nextAttemptAt: new Date(Date.now() + getTelegramRetryDelayMs(claimed.attemptCount)),
      });

      return telegramProcessResultSchema.parse({
        processed: true,
        outboxId: claimed.id,
        status: 'failed',
      });
    }
  },
};
