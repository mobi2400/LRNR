import { readUnlockToken } from '@/server/access-secret';
import { serverConfig } from '@/server/config';
import { AppError } from '@/server/errors';
import { GUEST_SCOPE, type GuestScope } from '@/server/guest-link';
import { assertOwnerIdentity } from '@/server/owner';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/session-state.ts');

export type AccessMode = (typeof serverConfig)['accessMode'];

export interface SessionSnapshot {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  isOwner: boolean;
  /**
   * A redeemed guest is authenticated (it has a userId) but is not the owner.
   * Keeping it a real authenticated principal is what makes owner guards return
   * 403 FORBIDDEN for a guest rather than a 401 that reads as "just log in".
   */
  isGuest?: boolean;
  guestScope?: GuestScope | null;
}

export interface SessionAccessState {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  isAuthenticated: boolean;
  isOwner: boolean;
  isGuest: boolean;
  guestScope: GuestScope | null;
  isUnlocked: boolean;
  unlockedUntil: string | null;
  accessMode: AccessMode;
}

export class SessionAccessError extends AppError {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'LOCKED';

  constructor(
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'LOCKED',
    message: string,
  ) {
    super({
      code,
      message,
      status: code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : 423,
    });
    this.name = 'SessionAccessError';
    this.code = code;
  }
}

function getMatchingUnlockExpiry(
  session: SessionSnapshot,
  unlockCookieValue: string | null,
): string | null {
  const unlockPayload = readUnlockToken(unlockCookieValue);

  if (session.userId === null || unlockPayload === null) {
    return null;
  }

  if (unlockPayload.userId !== session.userId) {
    return null;
  }

  if (
    session.email !== null &&
    unlockPayload.email !== null &&
    session.email !== unlockPayload.email
  ) {
    return null;
  }

  return unlockPayload.expiresAt;
}

export function buildSessionAccessState(
  session: SessionSnapshot,
  unlockCookieValue: string | null,
): SessionAccessState {
  const isAuthenticated = session.userId !== null;
  const cookieUnlockExpiry = getMatchingUnlockExpiry(session, unlockCookieValue);
  // Non-production bypass keeps the owner cockpit inspectable while the
  // private second gate is being tuned. Production still requires the cookie.
  const developmentUnlockExpiry =
    serverConfig.nodeEnv !== 'production' && session.isOwner
      ? 'non-production-bypass'
      : null;
  const unlockedUntil = cookieUnlockExpiry ?? developmentUnlockExpiry;

  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    isAuthenticated,
    isOwner: session.isOwner,
    isGuest: session.isGuest ?? false,
    guestScope: session.guestScope ?? null,
    isUnlocked: unlockedUntil !== null,
    unlockedUntil,
    accessMode: serverConfig.accessMode,
  };
}

export function assertAuthenticatedSession(
  state: SessionAccessState,
): asserts state is SessionAccessState & { userId: string } {
  if (!state.isAuthenticated || state.userId === null) {
    throw new SessionAccessError('UNAUTHENTICATED', 'Sign in to continue.');
  }
}

export function assertOwnerSession(
  state: SessionAccessState,
): asserts state is SessionAccessState & {
  userId: string;
  isOwner: true;
} {
  assertAuthenticatedSession(state);

  if (!state.isOwner) {
    throw new SessionAccessError(
      'FORBIDDEN',
      'LRNR is private to the configured owner.',
    );
  }

  assertOwnerIdentity({
    userId: state.userId,
    email: state.email,
  });
}

export function assertUnlockedOwnerSession(
  state: SessionAccessState,
): asserts state is SessionAccessState & {
  userId: string;
  isOwner: true;
  isUnlocked: true;
  unlockedUntil: string;
} {
  assertOwnerSession(state);

  if (!state.isUnlocked || state.unlockedUntil === null) {
    throw new SessionAccessError(
      'LOCKED',
      'Unlock LRNR with the private access secret first.',
    );
  }
}

/**
 * The interview is the one surface a non-owner can reach. Access is granted to
 * an unlocked owner (who can run their own evaluations) or to a guest whose
 * signed cookie is scoped to the interview. Everyone else is rejected. A guest
 * that lands on any *owner* route still hits assertUnlockedOwnerSession, which
 * throws FORBIDDEN because the guest is authenticated but not the owner.
 */
export function assertInterviewSession(
  state: SessionAccessState,
): asserts state is SessionAccessState & { userId: string } {
  if (state.isOwner) {
    assertUnlockedOwnerSession(state);
    return;
  }

  if (
    state.isGuest &&
    state.guestScope === GUEST_SCOPE &&
    state.userId !== null
  ) {
    return;
  }

  throw new SessionAccessError(
    'FORBIDDEN',
    'This route requires an active interview session.',
  );
}

