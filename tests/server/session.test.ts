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
  it('marks an owner session as locked without a valid unlock cookie', () => {
    const state = buildSessionAccessState(createSession(), null);

    expect(state.isAuthenticated).toBe(true);
    expect(state.isOwner).toBe(true);
    expect(state.isUnlocked).toBe(false);
  });

  it('rejects unlock cookies that belong to another user', () => {
    const state = buildSessionAccessState(
      createSession(),
      'eyJ1c2VySWQiOiJzb21lb25lLWVsc2UiLCJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIiwiZXhwaXJlc0F0IjoiMjA5OS0wMS0wMVQwMDowMDowMC4wMDBaIiwibm9uY2UiOiIxIn0.invalid',
    );

    expect(state.isUnlocked).toBe(false);
  });

  it('throws when a locked owner tries to use an unlocked-only surface', () => {
    const state = buildSessionAccessState(createSession(), null);

    expect(() => assertUnlockedOwnerSession(state)).toThrow(SessionAccessError);
  });
});
