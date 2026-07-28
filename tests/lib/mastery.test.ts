import { describe, expect, it } from 'vitest';

import {
  MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT,
  canReinforce,
  masteryBarFor,
  meetsMasteryBar,
  readMasterySummary,
  reinforcementRoundsFor,
  type MasterySummary,
} from '@/lib/mastery';

function verdict(
  grid: { canSolve: boolean; canExplain: boolean; canDecide: boolean },
  gapCount = 0,
) {
  return {
    masteryGrid: grid,
    gaps: Array.from({ length: gapCount }, (_, index) => ({
      claim: `gap ${index}`,
      evidence: 'evidence',
      sourceUri: 'https://example.com/doc',
      masteryLevel: 'can_explain' as const,
    })),
  };
}

describe('mastery bar', () => {
  it('raises the required capabilities with depth', () => {
    expect(masteryBarFor('beginner')).toEqual({
      canSolve: false,
      canExplain: true,
      canDecide: false,
    });
    expect(masteryBarFor('intermediate')).toEqual({
      canSolve: true,
      canExplain: true,
      canDecide: false,
    });
    expect(masteryBarFor('advanced')).toEqual({
      canSolve: true,
      canExplain: true,
      canDecide: true,
    });
    // Unknown depth degrades to the intermediate bar rather than throwing.
    expect(masteryBarFor('nonsense')).toEqual(masteryBarFor('intermediate'));
  });

  it('passes only when the grid meets the depth bar and no gap is open', () => {
    // Intermediate needs solve+explain.
    expect(
      meetsMasteryBar(
        verdict({ canSolve: true, canExplain: true, canDecide: false }),
        'intermediate',
      ),
    ).toBe(true);

    // Same grid fails the advanced bar (needs decide too).
    expect(
      meetsMasteryBar(
        verdict({ canSolve: true, canExplain: true, canDecide: false }),
        'advanced',
      ),
    ).toBe(false);

    // Meeting the grid but with an open gap does not clear the bar.
    expect(
      meetsMasteryBar(
        verdict({ canSolve: true, canExplain: true, canDecide: false }, 1),
        'intermediate',
      ),
    ).toBe(false);

    // Beginner only needs explain.
    expect(
      meetsMasteryBar(
        verdict({ canSolve: false, canExplain: true, canDecide: false }),
        'beginner',
      ),
    ).toBe(true);
  });
});

describe('mastery summary state', () => {
  it('reads malformed jsonb into an empty summary', () => {
    expect(readMasterySummary(null)).toEqual({
      concepts: {},
      goalMastered: false,
    });
    expect(readMasterySummary({ nonsense: true })).toEqual({
      concepts: {},
      goalMastered: false,
    });
  });

  it('tracks reinforcement rounds and enforces the per-concept cap', () => {
    const summary: MasterySummary = {
      goalMastered: false,
      concepts: {
        'consumer-groups': {
          level: 'developing',
          reinforcementRounds: MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT,
          lastAssessedAt: null,
        },
        'partitions': {
          level: 'developing',
          reinforcementRounds: 1,
          lastAssessedAt: null,
        },
      },
    };

    expect(reinforcementRoundsFor(summary, 'consumer-groups')).toBe(
      MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT,
    );
    expect(canReinforce(summary, 'consumer-groups')).toBe(false);
    expect(canReinforce(summary, 'partitions')).toBe(true);
    // Unknown concept starts at zero rounds → reinforceable.
    expect(canReinforce(summary, 'brand-new')).toBe(true);
  });
});
