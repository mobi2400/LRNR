import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryKeyValueStore } from '@/lib/redis';
import { createGuestLink } from '@/server/guest-link';
import {
  createInterviewService,
  InterviewForbiddenError,
  InterviewNotFoundError,
} from '@/services/interview.service';

describe('interview service', () => {
  let store: MemoryKeyValueStore;
  let service: ReturnType<typeof createInterviewService>;

  beforeEach(() => {
    store = new MemoryKeyValueStore();
    // null forces the deterministic (offline) judge, so no model is needed.
    service = createInterviewService({ store, generate: null });
  });

  it('redeems a valid guest link once', async () => {
    const link = await createGuestLink({ topicSlug: 'system-design', store });

    expect(await service.redeem(link.token)).not.toBeNull();
    expect(await service.redeem(link.token)).toBeNull();
  });

  it('starts a session and persists it under the principal', async () => {
    const session = await service.start('guest-1', { topicSlug: 'system-design' });

    expect(session.status).toBe('awaiting_answer');
    expect(session.currentProbe).toBeTruthy();

    // The same principal can answer it.
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
