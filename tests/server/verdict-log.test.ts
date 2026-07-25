import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryKeyValueStore } from '@/lib/redis';
import { appendVerdictLog, listVerdictLog } from '@/server/verdict-log';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';

const SAMPLE_VERDICT = {
  headline: 'Solid grasp with one gap.',
  gaps: [],
  masteryGrid: { canSolve: true, canExplain: true, canDecide: false },
  partialCoverage: null,
};

describe('verdict log', () => {
  let store: MemoryKeyValueStore;

  beforeEach(() => {
    store = new MemoryKeyValueStore();
  });

  it('appends and lists a verdict entry', async () => {
    const entry = await appendVerdictLog(
      {
        sessionId: SESSION_A,
        topicSlug: 'system-design',
        principalUserId: 'guest-1',
        totalTurns: 3,
        scoredTurns: 3,
        unscoredTurns: 0,
        verdict: SAMPLE_VERDICT,
      },
      store,
    );

    expect(entry.id).toBeTruthy();
    expect(entry.loggedAt).toBeTruthy();

    const log = await listVerdictLog(store);
    expect(log).toHaveLength(1);
    expect(log[0]!.sessionId).toBe(SESSION_A);
  });

  it('records a no-verdict completion (calibration signal)', async () => {
    await appendVerdictLog(
      {
        sessionId: SESSION_A,
        topicSlug: 'system-design',
        principalUserId: 'guest-1',
        totalTurns: 2,
        scoredTurns: 0,
        unscoredTurns: 2,
        verdict: null,
      },
      store,
    );

    const log = await listVerdictLog(store);
    expect(log[0]!.verdict).toBeNull();
    expect(log[0]!.unscoredTurns).toBe(2);
  });

  it('returns entries newest-first', async () => {
    await appendVerdictLog(
      {
        sessionId: SESSION_A,
        topicSlug: 'a',
        principalUserId: 'guest-1',
        totalTurns: 1,
        scoredTurns: 1,
        unscoredTurns: 0,
        verdict: SAMPLE_VERDICT,
      },
      store,
    );
    await appendVerdictLog(
      {
        sessionId: SESSION_B,
        topicSlug: 'b',
        principalUserId: 'guest-1',
        totalTurns: 1,
        scoredTurns: 1,
        unscoredTurns: 0,
        verdict: SAMPLE_VERDICT,
      },
      store,
    );

    const log = await listVerdictLog(store);
    expect(log.map((entry) => entry.sessionId)).toEqual([SESSION_B, SESSION_A]);
  });

  it('starts empty', async () => {
    expect(await listVerdictLog(store)).toEqual([]);
  });

  it('skips a corrupt entry without hiding the rest', async () => {
    const good = await appendVerdictLog(
      {
        sessionId: SESSION_A,
        topicSlug: 'a',
        principalUserId: 'guest-1',
        totalTurns: 1,
        scoredTurns: 1,
        unscoredTurns: 0,
        verdict: SAMPLE_VERDICT,
      },
      store,
    );
    await appendVerdictLog(
      {
        sessionId: SESSION_B,
        topicSlug: 'b',
        principalUserId: 'guest-1',
        totalTurns: 1,
        scoredTurns: 1,
        unscoredTurns: 0,
        verdict: SAMPLE_VERDICT,
      },
      store,
    );
    await store.set(`verdict-log:entry:${good.id}`, '{ corrupt');

    const log = await listVerdictLog(store);
    expect(log).toHaveLength(1);
    expect(log[0]!.sessionId).toBe(SESSION_B);
  });
});
