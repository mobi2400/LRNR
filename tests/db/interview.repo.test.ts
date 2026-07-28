import { beforeEach, describe, expect, it } from 'vitest';

import {
  createInMemoryInterviewRepository,
  rowToStoredSession,
  sessionToRow,
  type InterviewRepository,
} from '@/db/interview.repo';
import type { InterviewSessionState } from '@/schemas/evaluation.schema';

function sampleState(
  overrides: Partial<InterviewSessionState> = {},
): InterviewSessionState {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    topicSlug: 'system-design',
    status: 'awaiting_answer',
    turns: [],
    turnCap: 5,
    currentProbe: 'First probe?',
    detectedGaps: [],
    verdictSummary: null,
    ...overrides,
  };
}

describe('interview repo — row mapping', () => {
  it('round-trips a session through row mapping', () => {
    const state = sampleState();
    const row = sessionToRow(state, 'guest-1');

    expect(row.principalUserId).toBe('guest-1');
    expect(row.sessionId).toBe(state.sessionId);

    const restored = rowToStoredSession(row);
    expect(restored.principalUserId).toBe('guest-1');
    expect(restored.state).toEqual(state);
  });

  it('carries turns, gaps, and a verdict through mapping', () => {
    const state = sampleState({
      status: 'completed',
      currentProbe: null,
      verdictSummary: {
        headline: 'Solid.',
        gaps: [],
        masteryGrid: { canSolve: true, canExplain: true, canDecide: false },
        partialCoverage: null,
      },
    });

    const restored = rowToStoredSession(sessionToRow(state, 'owner-1'));
    expect(restored.state.status).toBe('completed');
    expect(restored.state.verdictSummary).not.toBeNull();
  });
});

describe('interview repo — in-memory implementation', () => {
  let repo: InterviewRepository;

  beforeEach(() => {
    repo = createInMemoryInterviewRepository();
  });

  it('creates, reads, updates, and deletes a session', async () => {
    const state = sampleState();
    await repo.createSession(state, 'guest-1');

    const stored = await repo.getSession(state.sessionId);
    expect(stored!.principalUserId).toBe('guest-1');

    await repo.updateSession({ ...state, status: 'completed', currentProbe: null });
    expect((await repo.getSession(state.sessionId))!.state.status).toBe('completed');

    await repo.deleteSession(state.sessionId);
    expect(await repo.getSession(state.sessionId)).toBeNull();
  });

  it('preserves the owner across updates', async () => {
    const state = sampleState();
    await repo.createSession(state, 'guest-1');
    await repo.updateSession({ ...state, status: 'judging' });

    expect((await repo.getSession(state.sessionId))!.principalUserId).toBe(
      'guest-1',
    );
  });

  it('appends and lists the verdict log newest-first', async () => {
    await repo.appendVerdictLog({
      sessionId: '11111111-1111-4111-8111-111111111111',
      principalUserId: 'guest-1',
      topicSlug: 'a',
      totalTurns: 1,
      scoredTurns: 1,
      unscoredTurns: 0,
      verdict: null,
    });
    await repo.appendVerdictLog({
      sessionId: '22222222-2222-4222-8222-222222222222',
      principalUserId: 'guest-1',
      topicSlug: 'b',
      totalTurns: 1,
      scoredTurns: 0,
      unscoredTurns: 1,
      verdict: null,
    });

    const log = await repo.listVerdictLog();
    expect(log.map((entry) => entry.topicSlug)).toEqual(['b', 'a']);
    // A no-verdict completion is kept, not dropped.
    expect(log[0]!.verdict).toBeNull();
  });

  it('upserts a reaction by session', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    await repo.saveReaction({
      sessionId,
      principalUserId: 'guest-1',
      wasAnythingWrong: false,
      note: null,
      contact: null,
    });
    await repo.saveReaction({
      sessionId,
      principalUserId: 'guest-1',
      wasAnythingWrong: true,
      note: 'actually wrong',
      contact: null,
    });

    const stored = await repo.getReaction(sessionId);
    expect(stored!.wasAnythingWrong).toBe(true);
    expect(stored!.note).toBe('actually wrong');
  });
});
