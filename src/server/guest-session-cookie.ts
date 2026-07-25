import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { serverConfig } from '@/server/config';
import { GUEST_SCOPE } from '@/server/guest-link';
import type { GuestSession } from '@/server/guest-link';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/guest-session-cookie.ts');

/**
 * A redeemed guest link becomes a short-lived, HMAC-signed cookie. It is
 * deliberately not an owner JWT: it carries a guest userId and the interview
 * scope only, so it can never satisfy an owner guard. Signing uses the same
 * server secret as the local owner JWT, so a forged or tampered guest cookie is
 * rejected exactly like a tampered owner token.
 */
export const LRNR_GUEST_COOKIE_NAME = 'lrnr_guest_session';

const guestJwtPayloadSchema = z.object({
  sub: z.string().min(1),
  scope: z.literal(GUEST_SCOPE),
  topicSlug: z.string().min(1).nullable(),
  exp: z.number().int().positive(),
});

export type GuestJwtPayload = z.infer<typeof guestJwtPayloadSchema>;

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signJwtInput(input: string): string {
  return createHmac('sha256', serverConfig.auth.secret)
    .update(input)
    .digest('base64url');
}

/**
 * Mints the cookie value from a freshly redeemed guest session. The cookie
 * expiry tracks the session's own expiresAt so a guest cannot outlive its link.
 */
export function createGuestJwt(session: GuestSession): string {
  const payload = guestJwtPayloadSchema.parse({
    sub: session.guestUserId,
    scope: session.scope,
    topicSlug: session.topicSlug,
    exp: Math.floor(new Date(session.expiresAt).getTime() / 1000),
  });
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJson(payload);
  const signature = signJwtInput(`${header}.${body}`);

  return `${header}.${body}.${signature}`;
}

/**
 * Verifies and decodes a guest cookie. Returns null for a missing, malformed,
 * tampered, or expired token — the caller treats all of these as "no guest".
 */
export function readGuestJwt(
  token: string | null | undefined,
  now = new Date(),
): GuestJwtPayload | null {
  if (token === undefined || token === null || token.trim().length === 0) {
    return null;
  }

  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) {
    return null;
  }

  const expectedSignature = signJwtInput(`${header}.${body}`);

  if (expectedSignature.length !== signature.length) {
    return null;
  }

  if (
    !timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8'),
    )
  ) {
    return null;
  }

  try {
    const payload = guestJwtPayloadSchema.parse(decodeJson(body));

    if (payload.exp <= Math.floor(now.getTime() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
