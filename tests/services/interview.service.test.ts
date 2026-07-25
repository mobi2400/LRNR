import { beforeEach, describe, expect, it } from 'vitest';

import {
  createInMemoryInterviewRepository,
  type InterviewRepository,
} from '@/db/interview.repo';
import { MemoryKeyValueStore } from '@/lib/redis';
import { createGuestLink } from '@/server/guest-link';
import {
  createInterviewService,
  InterviewForbiddenError,
  InterviewNotFoundError,
} from '@/services/interview.service';

describe('interview service', () => {
  let repository: InterviewRepository;
  let tokenStore: MemoryKeyValueStore;
  let service: ReturnType<typeof createInterviewService>;

  beforeEach(() => {
    repository = createInMemoryInterviewRepository();
    tokenStore = new MemoryKeyValueStore();
    // null forces the deterministic (offline) judge, so no model is needed.
    service = createInterviewService({ repository, tokenStore, generate: null });
  });

  it('redeems a valid guest link once', async () => {
    const link = await createGuestLink({
      topicSlug: 'system-design',
      store: tokenStore,
    });

    expect(await service.redeem(link.token)).not.toBeNull();
    expect(await service.redeem(link.token)).toBeNull();
  });

  it('starts a session and persists it under the principal', async () => {
    const session = await service.start('guest-1', { topicSlug: 'system-design' });

    expect(session.status).toBe('awaiting_answer');
    expect(session.currentProbe).toBeTruthy();

    const progress = await service.answer('guest-1', {
      sessionId: session.sessionId,
      answer: 'A read replica stops working when replication lag exceeds SLA.',
    });
    expect(progress.state.turns).toHaveLength(1);
  });

  it('completes after the turn cap and returns a verdict', async () => {
    const session = await service.start('guest-1', {
      topicSlug: 'system-design',
      turnCap: 1,
    });
    const progress = await service.answer('guest-1', {
      sessionId: session.sessionId,
      answer: 'Replication lag past the SLA breaks the replica.',
    });

    expect(progress.completed).toBe(true);
    expect(progress.state.status).toBe('completed');
    expect(progress.verdict).not.toBeNull();
  });

  it('writes a verdict-log entry on completion', async () => {
    const session = await service.start('guest-1', {
      topicSlug: 'system-design',
      turnCap: 1,
    });
    await service.answer('guest-1', {
      sessionId: session.sessionId,
      answer: 'Replication lag past the SLA breaks the replica.',
    });

    const log = await repository.listVerdictLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.sessionId).toBe(session.sessionId);
    expect(log[0]!.principalUserId).toBe('guest-1');
  });

  it('does not log until the interview completes', async () => {
    const session = await service.start('guest-1', {
      topicSlug: 'system-design',
      turnCap: 3,
    });
    await service.answer('guest-1', {
      sessionId: session.sessionId,
      answer: 'A first answer.',
    });

    expect(await repository.listVerdictLog()).toHaveLength(0);
  });

  it('forbids a different principal from answering', async () => {
    const session = await service.start('guest-1', { topicSlug: 'system-design' });

    await expect(
      service.answer('guest-2', {
        sessionId: session.sessionId,
        answer: 'trying to hijack',
      }),
    ).rejects.toBeInstanceOf(InterviewForbiddenError);
  });

  it('404s answering an unknown session', async () => {
    await expect(
      service.answer('guest-1', {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        answer: 'hello',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError);
  });

  it('gets a session for its owner including the verdict', async () => {
    const session = await service.start('guest-1', {
      topicSlug: 'system-design',
      turnCap: 1,
    });
    await service.answer('guest-1', {
      sessionId: session.sessionId,
      answer: 'Replication lag past the SLA breaks the replica.',
    });

    const loaded = await service.get('guest-1', session.sessionId);
    expect(loaded.status).toBe('completed');
    expect(loaded.verdictSummary).not.toBeNull();
  });

  it('forbids a different principal from reading a session', async () => {
    const session = await service.start('guest-1', { topicSlug: 'system-design' });

    await expect(
      service.get('guest-2', session.sessionId),
    ).rejects.toBeInstanceOf(InterviewForbiddenError);
  });

  async function completeSession(userId = 'guest-1') {
    const session = await service.start(userId, {
      topicSlug: 'system-design',
      turnCap: 1,
    });
    await service.answer(userId, {
      sessionId: session.sessionId,
      answer: 'Replication lag past the SLA breaks the replica.',
    });
    return session.sessionId;
  }

  it('records an interviewee reaction after the verdict', async () => {
    const sessionId = await completeSession();

    const reaction = await service.recordReaction('guest-1', sessionId, {
      wasAnythingWrong: true,
      note: 'The gap about replication lag was actually covered.',
    });
    expect(reaction.recordedAt).toBeTruthy();

    const stored = await repository.getReaction(sessionId);
    expect(stored!.wasAnythingWrong).toBe(true);
    expect(stored!.contact).toBeNull();
  });

  it('rejects a reaction before the interview completes', async () => {
    const session = await service.start('guest-1', {
      topicSlug: 'system-design',
      turnCap: 3,
    });

    await expect(
      service.recordReaction('guest-1', session.sessionId, {
        wasAnythingWrong: false,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('forbids a different principal from recording a reaction', async () => {
    const sessionId = await completeSession();

    await expect(
      service.recordReaction('guest-2', sessionId, { wasAnythingWrong: false }),
    ).rejects.toBeInstanceOf(InterviewForbiddenError);
  });

  it('discards a session so it can no longer be answered', async () => {
    const session = await service.start('guest-1', { topicSlug: 'system-design' });
    await service.discard('guest-1', session.sessionId);

    await expect(
      service.answer('guest-1', {
        sessionId: session.sessionId,
        answer: 'hello',
      }),
    ).rejects.toBeInstanceOf(InterviewNotFoundError);
  });
});
