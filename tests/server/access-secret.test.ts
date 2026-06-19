import { describe, expect, it } from 'vitest';

import {
  createUnlockToken,
  hashAccessSecret,
  readUnlockToken,
  verifyAccessSecret,
} from '../../src/server/access-secret';

describe('access secret helpers', () => {
  it('verifies the configured LRNR secret hash', () => {
    const salt = 'static-salt';
    const storedHash = hashAccessSecret('open sesame', salt);

    expect(
      verifyAccessSecret({
        candidate: 'open sesame',
        storedHash,
        salt,
      }),
    ).toBe(true);
    expect(
      verifyAccessSecret({
        candidate: 'wrong secret',
        storedHash,
        salt,
      }),
    ).toBe(false);
  });

  it('round-trips a signed unlock token for the same owner session', () => {
    const now = new Date('2026-06-19T12:00:00.000Z');
    const { token } = createUnlockToken({
      userId: 'owner-user-id',
      email: 'owner@example.com',
      now,
      ttlSeconds: 300,
    });

    expect(
      readUnlockToken(token, new Date('2026-06-19T12:03:00.000Z')),
    ).toMatchObject({
      userId: 'owner-user-id',
      email: 'owner@example.com',
    });
  });

  it('rejects expired or tampered unlock tokens', () => {
    const { token } = createUnlockToken({
      userId: 'owner-user-id',
      email: 'owner@example.com',
      now: new Date('2026-06-19T12:00:00.000Z'),
      ttlSeconds: 10,
    });

    expect(readUnlockToken(token, new Date('2026-06-19T12:00:20.000Z'))).toBeNull();
    expect(
      readUnlockToken(`${token}tampered`, new Date('2026-06-19T12:00:05.000Z')),
    ).toBeNull();
  });
});

