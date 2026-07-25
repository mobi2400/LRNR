import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RedisModule from '@/lib/redis';
import type * as InterviewServiceModule from '@/services/interview.service';

/**
 * Route-level integration harness (T10). Drives the real interview route
 * handlers through the real getSessionAccessState / guard stack, with three
 * seams mocked:
 *   1. @/lib/redis  — one shared in-memory store so every default-store consumer
 *      (service singleton, guest-link, interview-store, verdict-log) sees the
 *      same state within a test.
 *   2. next/headers — a mutable cookie jar the handlers read and write.
 *   3. @/server/auth — no next-auth session, so the owner path uses the local
 *      JWT cookie and the guest path uses the guest cookie.
 *
 * This closes the guest-escalation boundary that could not be unit tested:
 * a guest reaches interview routes and is rejected on owner routes.
 */

vi.mock('@/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof RedisModule>();
  const shared = new actual.MemoryKeyValueStore();

  class SharedStore {
    get(key: string) {
      return shared.get(key);
    }
    set(key: string, value: string, options?: unknown) {
      return shared.set(key, value, options as never);
    }
    delete(key: string) {
      return shared.delete(key);
    }
    deleteIfValue(key: string, expected: string) {
      return shared.deleteIfValue(key, expected);
    }
    incrementWithTtl(key: string, ttlMs: number) {
      return shared.incrementWithTtl(key, ttlMs);
    }
  }

  return { ...actual, RedisKeyValueStore: SharedStore };
});

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (arg: { name: string; value: string }) => {
      cookieJar.set(arg.name, arg.value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

vi.mock('@/server/auth', () => ({ auth: async () => null }));

// Sessions/verdict-log/reactions live in Postgres in production; under test the
// route singleton is rebuilt on the in-memory repository so no DB is needed.
// Guest-link tokens still flow through the (mocked) Redis token store.
vi.mock('@/services/interview.service', async (importOriginal) => {
  const actual = await importOriginal<typeof InterviewServiceModule>();
  const { createInMemoryInterviewRepository } = await import('@/db/interview.repo');

  return {
    ...actual,
    interviewService: actual.createInterviewService({
      repository: createInMemoryInterviewRepository(),
      generate: null,
    }),
  };
});

// Imports must follow the mocks so the mocked modules are wired in.
const { createGuestLink } = await import('@/server/guest-link');
const { RedisKeyValueStore } = await import('@/lib/redis');
const { createLocalOwnerJwt, LOCAL_JWT_COOKIE_NAME } = await import(
  '@/server/local-jwt-session'
);
const { POST: redeem } = await import('@/app/api/interview/redeem/route');
const { POST: startInterview } = await import('@/app/api/interview/start/route');
const { POST: answerInterview } = await import(
  '@/app/api/interview/answer/route'
);
const { POST: onboardingReply } = await import('@/app/api/onboarding/reply/route');

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<{ ok: boolean; data?: unknown; error?: { code: string } }> {
  return (await response.json()) as never;
}

describe('interview routes — guest escalation boundary', () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  it('guest redeems a link and reaches interview start + answer', async () => {
    const link = await createGuestLink({
      topicSlug: 'system-design',
      store: new RedisKeyValueStore(),
    });

    const redeemRes = await redeem(
      post('https://lrnr.test/api/interview/redeem', { token: link.token }),
    );
    expect(redeemRes.status).toBe(200);

    // The redeem handler set the guest cookie in the jar; start now succeeds.
    const startRes = await startInterview(
      post('https://lrnr.test/api/interview/start', { topicSlug: 'system-design' }),
    );
    expect(startRes.status).toBe(200);
    const started = await json(startRes);
    const sessionId = (started.data as { sessionId: string }).sessionId;

    const answerRes = await answerInterview(
      post('https://lrnr.test/api/interview/answer', {
        sessionId,
        answer: 'Replication lag past the SLA breaks the replica.',
      }),
    );
    expect(answerRes.status).toBe(200);
  });

  it('guest gets 403 on an owner route', async () => {
    const link = await createGuestLink({ store: new RedisKeyValueStore() });
    await redeem(
      post('https://lrnr.test/api/interview/redeem', { token: link.token }),
    );

    const res = await onboardingReply(
      post('https://lrnr.test/api/onboarding/reply', { answer: 'hi' }),
    );

    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('an unauthenticated visitor cannot start an interview', async () => {
    const res = await startInterview(
      post('https://lrnr.test/api/interview/start', { topicSlug: 'system-design' }),
    );
    expect(res.status).toBe(403);
  });

  it('a guest cannot answer another guest’s session', async () => {
    // Guest A starts a session.
    const linkA = await createGuestLink({ store: new RedisKeyValueStore() });
    await redeem(post('https://lrnr.test/api/interview/redeem', { token: linkA.token }));
    const startRes = await startInterview(
      post('https://lrnr.test/api/interview/start', { topicSlug: 'system-design' }),
    );
    const sessionId = ((await json(startRes)).data as { sessionId: string })
      .sessionId;

    // Guest B redeems a different link (overwriting the cookie) and tries to
    // answer guest A's session.
    const linkB = await createGuestLink({ store: new RedisKeyValueStore() });
    await redeem(post('https://lrnr.test/api/interview/redeem', { token: linkB.token }));

    const res = await answerInterview(
      post('https://lrnr.test/api/interview/answer', {
        sessionId,
        answer: 'hijack attempt',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('owner (unlocked via local JWT) can start an interview', async () => {
    cookieJar.set(LOCAL_JWT_COOKIE_NAME, createLocalOwnerJwt());

    const res = await startInterview(
      post('https://lrnr.test/api/interview/start', { topicSlug: 'system-design' }),
    );
    expect(res.status).toBe(200);
  });
});
