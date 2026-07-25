import { describe, it } from 'vitest';

/**
 * Guest link test skeletons — critical path 3: guest escalation.
 *
 * A guest principal must reach interview routes and nothing else.
 * These tests define the security boundary. Every owner route that
 * calls assertUnlockedOwnerSession must reject a guest principal.
 *
 * Import pattern (uncomment when T3 lands):
 *   import { createGuestLink, redeemGuestLink } from '@/server/guest-link';
 *   import { assertUnlockedOwnerSession } from '@/server/session-state';
 */

describe('guest link — token lifecycle', () => {
  it.todo(
    'creates a guest session from a valid single-use link',
    // createGuestLink returns a token. redeemGuestLink with that
    // token returns a scoped session with isOwner=false and a
    // short TTL.
  );

  it.todo(
    'rejects a used link',
    // After one successful redeem, a second redeem with the same
    // token must throw or return null. Single-use enforced.
  );

  it.todo(
    'rejects an expired link',
    // Create a link, advance time past TTL, attempt redeem.
    // Must throw or return null.
  );

  it.todo(
    'rejects a token that does not exist',
    // Random UUID as token → must throw or return null.
    // Token must be unguessable (UUID v4 or equivalent entropy).
  );
});

describe('guest link — escalation boundary', () => {
  it.todo(
    'guest principal reaches interview start route',
    // POST /api/interview/start with a guest session must succeed.
  );

  it.todo(
    'guest principal reaches interview answer route',
    // POST /api/interview/answer with a guest session must succeed.
  );

  it.todo(
    'guest principal gets 403 on every owner route',
    // For each route that calls assertUnlockedOwnerSession:
    //   - POST /api/onboarding/start
    //   - POST /api/onboarding/reply
    //   - POST /api/workflows/phase1/prepare
    //   - GET  /api/dashboard
    //   - POST /api/lesson/[sessionId]/ask-follow-up
    //   - ... (enumerate all)
    // A guest session must receive 403 FORBIDDEN.
    // This is the regression suite: if a new owner route is added
    // without the gate, this test must be updated to cover it.
  );

  it.todo(
    'guest principal cannot access another user RAG memory',
    // A guest session scoped to interview must not be able to
    // retrieve RAG context belonging to the owner or any other
    // user. rag-search.tool.ts:55-65 scopes by actor.userId;
    // verify the guest userId is distinct and isolated.
  );
});
