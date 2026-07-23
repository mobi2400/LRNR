import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/local-jwt-session.ts');

export const LOCAL_JWT_COOKIE_NAME = 'lrnr_local_jwt';
const LOCAL_JWT_TTL_SECONDS = 60 * 60 * 24;
const FALLBACK_LOCAL_OWNER_ID = '00000000-0000-4000-8000-000000000001';

const localJwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email().nullable(),
  name: z.string().min(1),
  isOwner: z.literal(true),
  exp: z.number().int().positive(),
});

export type LocalJwtPayload = z.infer<typeof localJwtPayloadSchema>;

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

function assertLocalJwtAllowed(): void {
  if (serverConfig.nodeEnv === 'production') {
    throw new Error('Local JWT login is disabled in production.');
  }
}

export function getLocalOwnerUserId(): string {
  const configuredOwnerId = z.string().uuid().safeParse(serverConfig.owner.userId);

  return configuredOwnerId.success ? configuredOwnerId.data : FALLBACK_LOCAL_OWNER_ID;
}

export function createLocalOwnerJwt(now = new Date()): string {
  assertLocalJwtAllowed();

  const payload = localJwtPayloadSchema.parse({
    sub: getLocalOwnerUserId(),
    email: serverConfig.owner.email,
    name: 'LRNR Local Owner',
    isOwner: true,
    exp: Math.floor(now.getTime() / 1000) + LOCAL_JWT_TTL_SECONDS,
  });
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJson(payload);
  const signature = signJwtInput(`${header}.${body}`);

  return `${header}.${body}.${signature}`;
}

export function readLocalOwnerJwt(
  token: string | null | undefined,
  now = new Date(),
): LocalJwtPayload | null {
  if (
    serverConfig.nodeEnv === 'production' ||
    token === undefined ||
    token === null ||
    token.trim().length === 0
  ) {
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
    const payload = localJwtPayloadSchema.parse(decodeJson(body));

    if (payload.exp <= Math.floor(now.getTime() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
