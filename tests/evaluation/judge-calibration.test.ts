import { describe, expect, it } from 'vitest';

import {
  applyInterviewAnswer,
  createInterviewSession,
} from '@/agents/evaluation/evaluation-agent';
import { generateStructured } from '@/lib/llm';
import type { GapFinding, InterviewTurn } from '@/schemas/evaluation.schema';

import { JUDGE_GOLDEN_SET } from './golden-set';

/**
 * Judge calibration (T11).
 *
 * The golden set is curated data; the calibration properties are asserted two
 * ways:
 *   - Always: the golden set stays well-formed, and the OFFLINE judge never
 *     fabricates a gap finding or a citation (a real, CI-enforced guarantee).
 *   - Gated (RUN_JUDGE_CALIBRATION=1, needs a live model): the REAL judge is run
 *     over each golden case and the calibration properties are asserted against
 *     its actual output. This is how the prompt is tuned; it stays skipped in CI.
 */

function gapText(finding: GapFinding): string {
  return `${finding.claim} ${finding.evidence}`.toLowerCase();
}

async function judgeGoldenCase(
  goldenCase: (typeof JUDGE_GOLDEN_SET)[number],
  generate: Parameters<typeof applyInterviewAnswer>[2],
): Promise<InterviewTurn> {
  const state = await createInterviewSession(
    { topicSlug: goldenCase.topicSlug, turnCap: 5, firstProbe: goldenCase.probe },
    null,
  );
  const progress = await applyInterviewAnswer(state, goldenCase.answer, generate);
  const turn = progress.state.turns[0];

  if (turn === undefined) {
    throw new Error(`golden case ${goldenCase.id} produced no turn`);
  }

  return turn;
}

describe('judge golden set — integrity', () => {
  it('has unique, well-formed cases', () => {
    const ids = new Set<string>();

    for (const goldenCase of JUDGE_GOLDEN_SET) {
      expect(goldenCase.id).toBeTruthy();
      expect(ids.has(goldenCase.id)).toBe(false);
      ids.add(goldenCase.id);

      expect(goldenCase.probe.length).toBeGreaterThan(0);
      expect(goldenCase.answer.length).toBeGreaterThan(0);
      // Every case must assert at least one calibration property.
      expect(Object.keys(goldenCase.expect).length).toBeGreaterThan(0);
    }
  });
});

describe('judge — offline never fabricates', () => {
  // The offline judge has no evidence, so it must never emit a gap finding
  // (which would require a citation it cannot have). This holds for every
  // golden case, including the confidently-wrong ones.
  it.each(JUDGE_GOLDEN_SET.map((c) => [c.id, c] as const))(
    'produces no fabricated gap finding for %s',
    async (_id, goldenCase) => {
      const turn = await judgeGoldenCase(goldenCase, null);
      expect(turn.gapFindings).toHaveLength(0);
    },
  );
});

// ── Real-model calibration (gated) ────────────────────────────────────────────

const RUN_CALIBRATION = process.env.RUN_JUDGE_CALIBRATION === '1';

describe.skipIf(!RUN_CALIBRATION)('judge — real-model calibration', () => {
  it.each(JUDGE_GOLDEN_SET.map((c) => [c.id, c] as const))(
    'judges %s to spec',
    async (_id, goldenCase) => {
      const turn = await judgeGoldenCase(goldenCase, generateStructured);

      if (goldenCase.expect.mustFindGap) {
        expect(turn.unscored).toBe(false);
        expect(turn.gapFindings.length).toBeGreaterThan(0);
      }

      if (goldenCase.expect.mustMention) {
        const combined = turn.gapFindings.map(gapText).join(' ');
        expect(
          goldenCase.expect.mustMention.some((term) =>
            combined.includes(term.toLowerCase()),
          ),
        ).toBe(true);
      }

      if (goldenCase.expect.gradeAsCorrect) {
        expect(turn.unscored).toBe(false);
        expect(turn.gapFindings).toHaveLength(0);
      }

      if (goldenCase.expect.ragEvidence === 'empty') {
        // With no evidence the judge must not fabricate a citation: either leave
        // the turn unscored, or emit no gap at all. Never a placeholder URL.
        const fabricated = turn.gapFindings.some((finding) =>
          /example\.com|todo|placeholder/i.test(finding.sourceUri),
        );
        expect(fabricated).toBe(false);
      }
    },
  );
});
