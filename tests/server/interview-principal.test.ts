import { describe, expect, it, vi } from 'vitest';

import {
  createGuestJwt,
  readGuestJwt,
} from '@/server/guest-session-cookie';
import type { GuestSession } from '@/server/guest-link';
import { GUEST_SCOPE } from '@/server/guest-link';
import {
  assertInterviewSession,
  assertUnlockedOwnerSession,
  buildSessionAccessState,
  SessionAccessError,
  type SessionSnapshot,
} from '@/server/session-state';

function guestSession(overrides: Partial<GuestSession> = {}): GuestSession {
  return {
    guestUserId: 'guest-123',
    isOwner: false,
    scope: GUEST_SCOPE,
    topicSlug: 'system-design',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const OWNER_SNAPSHOT: SessionSnapshot = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: 'Owner',
  isOwner: true,
};

const GUEST_SNAPSHOT: SessionSnapshot = {
  userId: 'guest-123',
  email: null,
  displayName: 'Interview guest',
  isOwner: false,
  isGuest: true,
  guestScope: GUEST_SCOPE,
};

describe('guest session cookie', () => {
  it('round-trips a signed guest cookie', () => {
    const token = createGuestJwt(guestSession());
    const payload = readGuestJwt(token);

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('guest-123');
    expect(payload!.scope).toBe(GUEST_SCOPE);
  });

  it('rejects a tampered cookie', () => {
    const token = createGuestJwt(guestSession());
    const tampered = `${token}x`;

    expect(readGuestJwt(tampered)).toBeNull();
  });

  it('rejects an expired cookie', () => {
    vi.useFakeTimers();
    try {
      const token = createGuestJwt(
        guestSession({ expiresAt: new Date(Date.now() + 1_000).toISOString() }),
      );

      vi.advanceTimersByTime(2_000);

      expect(readGuestJwt(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a missing cookie', () => {
    expect(readGuestJwt(null)).toBeNull();
    expect(readGuestJwt(undefined)).toBeNull();
    expect(readGuestJwt('')).toBeNull();
  });
});

describe('interview access guard', () => {
  it('admits an unlocked owner', () => {
    // Non-production owner is unlocked via the development bypass.
    const state = buildSessionAccessState(OWNER_SNAPSHOT, null);
    expect(state.isUnlocked).toBe(true);
    expect(() => assertInterviewSession(state)).not.toThrow();
  });

  it('admits a guest scoped to the interview', () => {
    const state = buildSessionAccessState(GUEST_SNAPSHOT, null);
    expect(state.isGuest).toBe(true);
    expect(() => assertInterviewSession(state)).not.toThrow();
  });

  it('rejects an unauthenticated visitor with FORBIDDEN', () => {
    const state = buildSessionAccessState(
      { userId: null, email: null, displayName: null, isOwner: false },
      null,
    );

    expect(() => assertInterviewSession(state)).toThrow(SessionAccessError);
    try {
      assertInterviewSession(state);
    } catch (error) {
      expect((error as SessionAccessError).code).toBe('FORBIDDEN');
    }
  });

  it('rejects a guest whose scope is not the interview', () => {
    const state = buildSessionAccessState(
      { ...GUEST_SNAPSHOT, guestScope: null },
      null,
    );

    expect(() => assertInterviewSession(state)).toThrow(SessionAccessError);
  });
});

describe('owner guard escalation boundary', () => {
  it('returns 403 FORBIDDEN when a guest hits an owner route', () => {
    const state = buildSessionAccessState(GUEST_SNAPSHOT, null);

    try {
      assertUnlockedOwnerSession(state);
      throw new Error('expected assertUnlockedOwnerSession to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SessionAccessError);
      expect((error as SessionAccessError).code).toBe('FORBIDDEN');
      expect((error as SessionAccessError).status).toBe(403);
    }
  });
});
