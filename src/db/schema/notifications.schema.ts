import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  jsonbObjectDefault,
  notificationChannelEnum,
  outboxStatusEnum,
  table,
  userScopedColumns,
} from './shared';

/**
 * Outbox and notification-preference tables exist together because delivery
 * state and user-facing preferences will always need to be reasoned about as a
 * pair when alerts are retried or suppressed.
 */
export const deliveryOutbox = table(
  'delivery_outbox',
  {
    ...userScopedColumns,
    channel: notificationChannelEnum('channel').notNull(),
    deliveryKey: text('delivery_key').notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxStatusEnum('status').default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text('last_error'),
  },
  (table) => ({
    deliveryUnique: uniqueIndex('delivery_outbox_user_delivery_key_unique').on(
      table.userId,
      table.deliveryKey,
    ),
    pendingDeliveryLookup: index('delivery_outbox_ready_idx').on(
      table.userId,
      table.status,
      table.nextAttemptAt,
    ),
    userCreatedLookup: index('delivery_outbox_user_created_idx').on(
      table.userId,
      table.createdAt,
      table.id,
    ),
  }),
);

export const notificationPreferences = table(
  'notification_preferences',
  {
    ...userScopedColumns,
    telegramEnabled: boolean('telegram_enabled').default(true).notNull(),
    telegramChatId: text('telegram_chat_id'),
    dailyLearningAlertEnabled: boolean('daily_learning_alert_enabled')
      .default(true)
      .notNull(),
    evaluationAlertEnabled: boolean('evaluation_alert_enabled')
      .default(true)
      .notNull(),
    digestAlertEnabled: boolean('digest_alert_enabled').default(true).notNull(),
    quietHours: jsonb('quiet_hours').default(jsonbObjectDefault).notNull(),
  },
  (table) => ({
    userIdUnique: uniqueIndex('notification_preferences_user_id_unique').on(
      table.userId,
    ),
  }),
);
