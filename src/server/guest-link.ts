import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/guest-link.ts');

/**
 * Guest links let the owner hand a single-use, time-boxed URL to an interviewee
 * who is not the owner. A redeemed guest reaches the interview routes and
 * nothing else — every owner route still runs assertUnlockedOwnerSession, which
 * a guest principal can never satisfy (isOwner is false and no unlock cookie
 * exists). The guest also gets a distinct userId so RAG scoping isolates it from
 * the owner's memory.
 */

// A guest can only ever act inside the interview. This scope is the allowlist.
export const GUEST_SCOPE = 'interview' as const;
export type GuestScope = typeof GUEST_SCOPE;

// How long a freshly created link stays redeemable, and how long the redeemed
// session survives. Both are deliberately short: a guest link is a one-shot.
const DEFAULT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;

const KEY_PREFIX = 'guest-link:';

function storageKey(token: string): string {
  return `${KEY_PREFIX}${token}`;
}

export interface GuestSession {
  guestUserId: string;
  isOwner: false;
  scope: GuestScope;
  topicSlug: string | null;
  /** ISO timestamp after which the redeemed session must be treated as expired. */
  expiresAt: string;
}

export interface CreateGuestLinkOptions {
  topicSlug?: string;
  linkTtlMs?: number;
  sessionTtlMs?: number;
  store?: KeyValueStore;
}

export interface GuestLink {
  token: string;
  /** ISO timestamp after which redeeming the link fails. */
  expiresAt: string;
}

// The stored payload. sessionTtlMs is captured at creation so redemption does
// not depend on config that may have changed since the link was minted.
const linkPayloadSchema = z.object({
  guestUserId: z.string().min(1),
  topicSlug: z.string().min(1).nullable(),
  sessionTtlMs: z.number().int().positive(),
});
type LinkPayload = z.infer<typeof linkPayloadSchema>;

// UUID v4 tokens carry ~122 bits of entropy — unguessable, so a redeem attempt
// with a random token effectively never hits a live link.
const tokenSchema = z.string().uuid();

function defaultStore(): KeyValueStore {
  return new RedisKeyValueStore();
}

export async function createGuestLink(
  options: CreateGuestLinkOptions = {},
): Promise<GuestLink> {
  const store = options.store ?? defaultStore();
  const token = randomUUID();
  const linkTtlMs = options.linkTtlMs ?? DEFAULT_LINK_TTL_MS;
  const payload: LinkPayload = {
    guestUserId: `guest-${randomUUID()}`,
    topicSlug: options.topicSlug?.trim() || null,
    sessionTtlMs: options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
  };

  // onlyIfAbsent guards against the astronomically unlikely token collision.
  const stored = await store.set(storageKey(token), JSON.stringify(payload), {
    ttlMs: linkTtlMs,
    onlyIfAbsent: true,
  });

  if (!stored) {
    throw new Error('Failed to persist guest link (token collision).');
  }

  return {
    token,
    expiresAt: new Date(Date.now() + linkTtlMs).toISOString(),
  };
}

/**
 * Redeems a link exactly once. Returns null for a token that is unknown,
 * expired, already used, or malformed — the caller treats all four the same:
 * no guest session. Single use is enforced by an atomic delete-if-value, so two
 * concurrent redeems of the same token yield at most one session.
 */
export async function redeemGuestLink(
  token: string,
  store: KeyValueStore = defaultStore(),
): Promise<GuestSession | null> {
  const parsedToken = tokenSchema.safeParse(token);

  if (!parsedToken.success) {
    return null;
  }

  const key = storageKey(parsedToken.data);
  const raw = await store.get(key);

  if (raw === null) {
    // Unknown or already-expired link (TTL evicted it).
    return null;
  }

  // Atomic single-use: only the caller that removes this exact value wins.
  const consumed = await store.deleteIfValue(key, raw);

  if (!consumed) {
    // Lost the race — another redeem already consumed it.
    return null;
  }

  let payload: LinkPayload;

  try {
    payload = linkPayloadSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }

  return {
    guestUserId: payload.guestUserId,
    isOwner: false,
    scope: GUEST_SCOPE,
    topicSlug: payload.topicSlug,
    expiresAt: new Date(Date.now() + payload.sessionTtlMs).toISOString(),
  };
}
