import { cookies } from 'next/headers';

import {
  createUnlockToken,
  LRNR_UNLOCK_COOKIE_NAME,
  verifyAccessSecret,
} from '@/server/access-secret';
import { auth } from '@/server/auth';
import {
  createLocalOwnerJwt,
  getLocalOwnerUserId,
  LOCAL_JWT_COOKIE_NAME,
  readLocalOwnerJwt,
} from '@/server/local-jwt-session';
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
  const unlockCookie = cookieStore.get(LRNR_UNLOCK_COOKIE_NAME)?.value ?? null;
  const localJwt = readLocalOwnerJwt(
    cookieStore.get(LOCAL_JWT_COOKIE_NAME)?.value ?? null,
  );

  if (localJwt !== null) {
    return buildSessionAccessState(
      {
        userId: localJwt.sub,
        email: localJwt.email,
        displayName: localJwt.name,
        isOwner: localJwt.isOwner,
      },
      unlockCookie,
    );
  }

  return buildSessionAccessState(
    {
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      displayName: session?.user?.name ?? null,
      isOwner: session?.isOwner === true,
    },
    unlockCookie,
  );
}
export async function createLocalOwnerSession(): Promise<void> {
  const cookieStore = await cookies();
  const jwt = createLocalOwnerJwt();

  cookieStore.set({
    name: LOCAL_JWT_COOKIE_NAME,
    value: jwt,
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
}

export async function unlockOwnerSession(accessSecret: string): Promise<{
  isUnlocked: true;
  unlockedUntil: string;
  userId: string;
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
    userId: state.userId,
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
  cookieStore.delete(LOCAL_JWT_COOKIE_NAME);

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



