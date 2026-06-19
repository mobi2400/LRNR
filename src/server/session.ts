import { cookies } from 'next/headers';

import {
  createUnlockToken,
  LRNR_UNLOCK_COOKIE_NAME,
  verifyAccessSecret,
} from '@/server/access-secret';
import { auth } from '@/server/auth';
import { serverConfig } from '@/server/config';
import {
  assertAuthenticatedSession,
  assertOwnerSession,
  assertUnlockedOwnerSession,
  buildSessionAccessState,
  type SessionAccessState,
  SessionAccessError,
} from '@/server/session-state';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/session.ts');

const AUTH_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'authjs.csrf-token',
  '__Host-authjs.csrf-token',
  'authjs.callback-url',
  '__Secure-authjs.callback-url',
] as const;

export async function getSessionAccessState(): Promise<SessionAccessState> {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);

  return buildSessionAccessState(
    {
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      displayName: session?.user?.name ?? null,
      isOwner: session?.isOwner === true,
    },
    cookieStore.get(LRNR_UNLOCK_COOKIE_NAME)?.value ?? null,
  );
}

export async function unlockOwnerSession(accessSecret: string): Promise<{
  isUnlocked: true;
  unlockedUntil: string;
}> {
  const state = await getSessionAccessState();

  assertOwnerSession(state);

  const isValidSecret = verifyAccessSecret({
    candidate: accessSecret,
    storedHash: serverConfig.auth.lrnrAccessSecretHash,
    salt: serverConfig.auth.lrnrAccessSecretSalt,
  });

  if (!isValidSecret) {
    throw new SessionAccessError(
      'LOCKED',
      'The LRNR access secret is invalid.',
    );
  }

  const { token, expiresAt } = createUnlockToken({
    userId: state.userId,
    email: state.email,
  });
  const cookieStore = await cookies();

  cookieStore.set({
    name: LRNR_UNLOCK_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: serverConfig.nodeEnv === 'production',
    path: '/',
    expires: expiresAt,
  });

  return {
    isUnlocked: true,
    unlockedUntil: expiresAt.toISOString(),
  };
}

/**
 * Part 4 keeps logout deterministic by clearing the Auth.js JWT cookie names we
 * intentionally use in owner-only mode. This avoids coupling the logout route
 * to a browser redirect and keeps the API contract JSON-shaped for later UI use.
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(LRNR_UNLOCK_COOKIE_NAME);

  for (const cookieName of AUTH_COOKIE_NAMES) {
    cookieStore.delete(cookieName);
  }
}

export {
  assertAuthenticatedSession,
  assertOwnerSession,
  assertUnlockedOwnerSession,
  buildSessionAccessState,
  SessionAccessError,
} from '@/server/session-state';
