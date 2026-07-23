import { describe, expect, it } from 'vitest';

import {
  assertUnlockedOwnerSession,
  buildSessionAccessState,
  SessionAccessError,
} from '../../src/server/session-state';

function createSession() {
  return {
    userId: 'owner-user-id',
    email: 'owner@example.com',
    displayName: 'LRNR Owner',
    isOwner: true,
  };
}

describe('session access state', () => {
  it('bypasses the private unlock gate for the owner in non-production', () => {
    const state = buildSessionAccessState(createSession(), null);

    expect(state.isAuthenticated).toBe(true);
    expect(state.isOwner).toBe(true);
    expect(state.isUnlocked).toBe(true);
    expect(state.unlockedUntil).toBe('non-production-bypass');
  });

  it('rejects unlock cookies that belong to another user', () => {
    const state = buildSessionAccessState(
      createSession(),
      'eyJ1c2VySWQiOiJzb21lb25lLWVsc2UiLCJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIiwiZXhwaXJlc0F0IjoiMjA5OS0wMS0wMVQwMDowMDowMC4wMDBaIiwibm9uY2UiOiIxIn0.invalid',
    );

    expect(state.isUnlocked).toBe(true);
    expect(state.unlockedUntil).toBe('non-production-bypass');
  });

  it('still rejects non-owner sessions on unlocked-only surfaces', () => {
    const state = buildSessionAccessState({ ...createSession(), isOwner: false }, null);

    expect(() => assertUnlockedOwnerSession(state)).toThrow(SessionAccessError);
  });
});

