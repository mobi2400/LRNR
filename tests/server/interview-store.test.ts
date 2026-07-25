import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryKeyValueStore } from '@/lib/redis';
import {
  createInterviewSession,
  applyInterviewAnswer,
} from '@/agents/evaluation/evaluation-agent';
import {
  deleteInterviewSession,
  loadInterviewSession,
  saveInterviewSession,
} from '@/server/interview-store';

describe('interview store', () => {
  let store: MemoryKeyValueStore;

  beforeEach(() => {
    store = new MemoryKeyValueStore();
  });

  it('round-trips a session through save and load', async () => {
    const state = await createInterviewSession(
      { topicSlug: 'system-design', turnCap: 5, firstProbe: 'First probe?' },
      null,
    );

    await saveInterviewSession(state, { store });
    const loaded = await loadInterviewSession(state.sessionId, store);

    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe(state.sessionId);
    expect(loaded!.currentProbe).toBe('First probe?');
  });

  it('persists turns and the completed verdict', async () => {
    let state = await createInterviewSession(
      { topicSlug: 'system-design', turnCap: 1, firstProbe: 'First probe?' },
      null,
    );
    const progress = await applyInterviewAnswer(
      state,
      'A read replica stops working when replication lag exceeds SLA.',
      null,
    );
    state = progress.state;
    expect(state.status).toBe('completed');

    await saveInterviewSession(state, { store });
    const loaded = await loadInterviewSession(state.sessionId, store);

    expect(loaded!.status).toBe('completed');
    expect(loaded!.turns).toHaveLength(1);
    expect(loaded!.verdictSummary).not.toBeNull();
  });

  it('returns null for an unknown session', async () => {
    expect(
      await loadInterviewSession('550e8400-e29b-41d4-a716-446655440000', store),
    ).toBeNull();
  });

  it('returns null for an expired session', async () => {
    vi.useFakeTimers();
    try {
      const state = await createInterviewSession(
        { topicSlug: 'system-design', firstProbe: 'First probe?' },
        null,
      );
      await saveInterviewSession(state, { store, ttlMs: 1_000 });

      vi.advanceTimersByTime(1_001);

      expect(await loadInterviewSession(state.sessionId, store)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null for corrupt stored state', async () => {
    // Write a valid session, then clobber the raw value with junk.
    const state = await createInterviewSession(
      { topicSlug: 'system-design', firstProbe: 'First probe?' },
      null,
    );
    await saveInterviewSession(state, { store });
    await store.set(`interview-session:${state.sessionId}`, '{ not json');

    expect(await loadInterviewSession(state.sessionId, store)).toBeNull();
  });

  it('deletes a session', async () => {
    const state = await createInterviewSession(
      { topicSlug: 'system-design', firstProbe: 'First probe?' },
      null,
    );
    await saveInterviewSession(state, { store });
    await deleteInterviewSession(state.sessionId, store);

    expect(await loadInterviewSession(state.sessionId, store)).toBeNull();
  });
});
