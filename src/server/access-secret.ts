import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/access-secret.ts');

export const LRNR_UNLOCK_COOKIE_NAME = 'lrnr_unlocked';
export const LRNR_UNLOCK_TTL_SECONDS = 60 * 60 * 8;

export interface UnlockCookiePayload {
  userId: string;
  email: string | null;
  expiresAt: string;
  nonce: string;
}

interface CreateUnlockTokenOptions {
  userId: string;
  email: string | null;
  now?: Date;
  ttlSeconds?: number;
}

interface VerifyAccessSecretOptions {
  candidate: string;
  storedHash: string;
  salt: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createUnlockSignature(encodedPayload: string): string {
  return createHmac('sha256', serverConfig.auth.secret)
    .update(`lrnr-unlock:${encodedPayload}`)
    .digest('base64url');
}

export function hashAccessSecret(secret: string, salt: string): string {
  return scryptSync(secret.trim(), salt, 64).toString('hex');
}

export function verifyAccessSecret({
  candidate,
  storedHash,
  salt,
}: VerifyAccessSecretOptions): boolean {
  const computedHash = hashAccessSecret(candidate, salt);
  const expectedHash = storedHash.trim().toLowerCase();

  if (computedHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(computedHash, 'utf8'),
    Buffer.from(expectedHash, 'utf8'),
  );
}

export function createUnlockToken({
  userId,
  email,
  now = new Date(),
  ttlSeconds = LRNR_UNLOCK_TTL_SECONDS,
}: CreateUnlockTokenOptions): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const payload: UnlockCookiePayload = {
    userId,
    email,
    expiresAt: expiresAt.toISOString(),
    nonce: randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createUnlockSignature(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function readUnlockToken(
  token: string | null | undefined,
  now = new Date(),
): UnlockCookiePayload | null {
  if (typeof token !== 'string' || token.trim().length === 0) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createUnlockSignature(encodedPayload);

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
    const parsedPayload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as UnlockCookiePayload;
    const expiresAt = new Date(parsedPayload.expiresAt);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}
