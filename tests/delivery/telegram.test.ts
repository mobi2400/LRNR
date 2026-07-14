import '../setup-env';

import { describe, expect, it } from 'vitest';

import {
  buildTelegramTestAlertPayload,
  buildTelegramTestDeliveryKey,
} from '../../src/services/delivery.service';
import { splitTelegramMessage } from '../../src/lib/telegram';

describe('telegram delivery helpers', () => {
  it('builds a test alert with a cockpit deep link and no lesson body', () => {
    const payload = buildTelegramTestAlertPayload(
      new Date('2026-07-15T00:00:00.000Z'),
    );

    expect(payload.kind).toBe('telegram_test');
    expect(payload.deepLink).toBe('https://lrnr.test/dashboard');
    expect(payload.text).toContain('Open cockpit');
    expect(payload.text).not.toContain('Lesson body');
  });

  it('uses the owner and idempotency key for duplicate-safe delivery keys', () => {
    const key = buildTelegramTestDeliveryKey(
      {
        userId: '11111111-1111-1111-1111-111111111111',
        requestId: 'req_123',
      },
      'telegram-test-1',
    );

    expect(key).toBe(
      'telegram-test:11111111-1111-1111-1111-111111111111:telegram-test-1',
    );
  });

  it('splits long Telegram messages into bounded chunks', () => {
    const chunks = splitTelegramMessage(`start\n${'a'.repeat(4100)}`, 1000);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
  });
});
