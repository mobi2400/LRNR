import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryKeyValueStore } from '@/lib/redis';
import {
  createGuestLink,
  GUEST_SCOPE,
  redeemGuestLink,
} from '@/server/guest-link';

/**
 * Guest link tests — critical path 3: guest escalation.
 *
 * The token lifecycle (create / single-use / expiry / unguessable) is unit
 * tested here against an in-memory store. The escalation-boundary cases (guest
 * reaches interview routes, 403 on every owner route, RAG isolation) assert
 * behavior of routes that do not exist yet, so they remain it.todo until the
 * interview API lands.
 */

describe('guest link — token lifecycle', () => {
  let store: MemoryKeyValueStore;

  beforeEach(() => {
    store = new MemoryKeyValueStore();
  });

  it('creates a guest session from a valid single-use link', async () => {
    const link = await createGuestLink({ topicSlug: 'system-design', store });
    expect(link.token).toBeTruthy();

    const session = await redeemGuestLink(link.token, store);

    expect(session).not.toBeNull();
    expect(session!.isOwner).toBe(false);
    expect(session!.scope).toBe(GUEST_SCOPE);
    expect(session!.topicSlug).toBe('system-design');
    expect(new Date(session!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('scopes each guest to a distinct, isolated userId', async () => {
    const a = await createGuestLink({ store });
    const b = await createGuestLink({ store });

    const sessionA = await redeemGuestLink(a.token, store);
    const sessionB = await redeemGuestLink(b.token, store);

    expect(sessionA!.guestUserId).not.toBe(sessionB!.guestUserId);
  });

  it('rejects a used link', async () => {
    const link = await createGuestLink({ store });

    expect(await redeemGuestLink(link.token, store)).not.toBeNull();
    expect(await redeemGuestLink(link.token, store)).toBeNull();
  });

  it('rejects an expired link', async () => {
    vi.useFakeTimers();
    try {
      const link = await createGuestLink({ linkTtlMs: 1_000, store });

      vi.advanceTimersByTime(1_001);

      expect(await redeemGuestLink(link.token, store)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token that does not exist', async () => {
    expect(
      await redeemGuestLink('550e8400-e29b-41d4-a716-446655440000', store),
    ).toBeNull();
  });

  it('rejects a malformed (non-UUID) token', async () => {
    expect(await redeemGuestLink('not-a-real-token', store)).toBeNull();
  });

  it('yields at most one session for concurrent redeems', async () => {
    const link = await createGuestLink({ store });

    const [first, second] = await Promise.all([
      redeemGuestLink(link.token, store),
      redeemGuestLink(link.token, store),
    ]);

    const successes = [first, second].filter((s) => s !== null);
    expect(successes).toHaveLength(1);
  });
});

describe('guest link — escalation boundary', () => {
  it.todo('guest principal reaches interview start route');
  it.todo('guest principal reaches interview answer route');
  it.todo('guest principal gets 403 on every owner route');
  it.todo('guest principal cannot access another user RAG memory');
});
