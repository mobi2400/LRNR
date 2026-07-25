import { describe, expect, it, vi } from 'vitest';

import {
  applyInterviewAnswer,
  createInterviewSession,
  type EvaluationGenerator,
  type InterviewProgress,
} from '@/agents/evaluation/evaluation-agent';
import { LlmDegradedError } from '@/lib/llm';
import type { StructuredGenerationInput } from '@/lib/llm';

/**
 * Evaluation agent tests — the spec the implementation must satisfy.
 *
 * The judge is driven through the injected generator seam (same pattern as
 * architect-agent.test.ts:62), so these run deterministically without a model.
 * Judge-calibration cases that assert real model semantics remain it.todo until
 * the golden set lands.
 */

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WRONG_ANSWER_CONFIDENT =
  'Consistent hashing means the server hashes the password consistently ' +
  'so the same password always produces the same hash. This is important ' +
  'for load balancing because each server can verify passwords independently.';

const PARTIAL_ANSWER_REPLICA =
  "I'd add a read replica because it's easier and it spreads the read load " +
  'across more machines.';

const CORRECT_ANSWER_ENGLISH =
  'A read replica stops working when replication lag exceeds the ' +
  "application's consistency requirements. The signal is replica lag " +
  'exceeding your SLA threshold under sustained write load.';

const SKIP_ANSWER = '';

// ── Generator harness ─────────────────────────────────────────────────────────

interface ScriptedJudgment {
  verdict?: string | null;
  gapFindings?: unknown[];
  unscored?: boolean;
  pressDeeper?: boolean;
  nextProbe?: string | null;
}

/**
 * Builds a generator keyed by the call's `label`, so a test can script the
 * opening probe, each turn's judgment, and the final verdict independently.
 * A judgment supplied as an Error is thrown — the way a degraded model surfaces.
 */
function scriptedGenerator(script: {
  opening?: string;
  judgments?: Array<ScriptedJudgment | Error>;
  verdict?: Record<string, unknown> | Error;
}): { generate: EvaluationGenerator; calls: string[] } {
  const judgments = [...(script.judgments ?? [])];
  const calls: string[] = [];

  const generate = (async <TOutput>(
    input: StructuredGenerationInput<TOutput>,
  ): Promise<TOutput> => {
    calls.push(input.label);

    if (input.label === 'evaluation_opening_probe') {
      return { probe: script.opening ?? 'Opening probe?' } as TOutput;
    }

    if (input.label === 'evaluation_turn_judgment') {
      const next = judgments.shift();
      if (next instanceof Error) {
        throw next;
      }
      return {
        verdict: next?.verdict ?? 'Working understanding.',
        gapFindings: next?.gapFindings ?? [],
        unscored: next?.unscored ?? false,
        pressDeeper: next?.pressDeeper ?? false,
        nextProbe: next?.nextProbe ?? null,
      } as TOutput;
    }

    if (input.label === 'evaluation_verdict') {
      if (script.verdict instanceof Error) {
        throw script.verdict;
      }
      return (script.verdict ?? {
        headline: 'Solid grasp overall.',
        gaps: [],
        masteryGrid: { canSolve: true, canExplain: true, canDecide: false },
        partialCoverage: null,
      }) as TOutput;
    }

    throw new Error(`unexpected generator label: ${input.label}`);
  }) as EvaluationGenerator;

  return { generate, calls };
}

const degraded = () =>
  new LlmDegradedError('evaluation_turn_judgment', {
    degraded: true,
    reason: 'templated_fallback',
  });

async function answerN(
  turnCap: number,
  answers: string[],
  script: Parameters<typeof scriptedGenerator>[0],
) {
  const { generate } = scriptedGenerator(script);
  let progress: InterviewProgress = {
    state: await createInterviewSession(
      { topicSlug: 'system-design', turnCap, firstProbe: 'First probe?' },
      generate,
    ),
    completed: false,
    verdict: null,
  };

  for (const answer of answers) {
    progress = await applyInterviewAnswer(progress.state, answer, generate);
  }

  return progress;
}

// ── Critical path 1: Judge leniency (real model semantics) ────────────────────

describe('evaluation agent — judge calibration', () => {
  it.todo('never praises a confidently wrong answer');
  it.todo('names the specific missing element in a partial answer');
  it.todo('cites a source for every gap finding');
  it.todo('grades a Hinglish answer on knowledge not language');
  it.todo('does not invent a citation when rag_search returns empty evidence');
});

// ── Critical path 2: Degradation / unscored turns ─────────────────────────────

describe('evaluation agent — degradation and unscored turns', () => {
  it('marks a turn unscored when the model returns degraded output', async () => {
    const progress = await answerN(5, [WRONG_ANSWER_CONFIDENT], {
      judgments: [degraded()],
    });

    const turn = progress.state.turns[0]!;
    expect(turn.unscored).toBe(true);
    expect(turn.gapFindings).toHaveLength(0);
    expect(turn.verdict).toBeNull();
  });

  it('continues the interview after an unscored turn', async () => {
    const progress = await answerN(5, [WRONG_ANSWER_CONFIDENT], {
      judgments: [degraded()],
    });

    expect(progress.completed).toBe(false);
    expect(progress.state.status).toBe('awaiting_answer');
    expect(progress.state.currentProbe).toBeTruthy();
  });

  it('produces a partial verdict when some turns are unscored', async () => {
    const progress = await answerN(
      3,
      [CORRECT_ANSWER_ENGLISH, CORRECT_ANSWER_ENGLISH, WRONG_ANSWER_CONFIDENT],
      {
        judgments: [{}, {}, degraded()],
        verdict: {
          headline: 'Partial evaluation.',
          gaps: [],
          masteryGrid: { canSolve: true, canExplain: true, canDecide: false },
          partialCoverage: null,
        },
      },
    );

    expect(progress.completed).toBe(true);
    expect(progress.verdict).not.toBeNull();
    expect(progress.verdict!.partialCoverage).toBe('based on 2 of 3 answers');
  });

  it('produces no verdict when all turns are unscored', async () => {
    const progress = await answerN(
      2,
      [WRONG_ANSWER_CONFIDENT, WRONG_ANSWER_CONFIDENT],
      { judgments: [degraded(), degraded()] },
    );

    expect(progress.completed).toBe(true);
    expect(progress.state.verdictSummary).toBeNull();
  });

  it('never emits a fabricated verdict on synthesis error', async () => {
    const progress = await answerN(
      2,
      [CORRECT_ANSWER_ENGLISH, CORRECT_ANSWER_ENGLISH],
      { judgments: [{}, {}], verdict: new Error('model down') },
    );

    expect(progress.completed).toBe(true);
    expect(progress.state.status).toBe('completed');
    expect(progress.state.verdictSummary).toBeNull();
  });
});

// ── Turn loop mechanics ───────────────────────────────────────────────────────

describe('evaluation agent — turn loop', () => {
  it('completes after the turn cap', async () => {
    const progress = await answerN(
      3,
      [CORRECT_ANSWER_ENGLISH, CORRECT_ANSWER_ENGLISH, CORRECT_ANSWER_ENGLISH],
      { judgments: [{}, {}, {}] },
    );

    expect(progress.state.status).toBe('completed');
    expect(progress.verdict).not.toBeNull();
  });

  it('records a skip as a blank answer with skipped=true', async () => {
    const { generate } = scriptedGenerator({ judgments: [{}] });
    const state = await createInterviewSession(
      { topicSlug: 'system-design', turnCap: 5, firstProbe: 'First probe?' },
      generate,
    );
    const progress = await applyInterviewAnswer(state, SKIP_ANSWER, generate);

    const turn = progress.state.turns[0]!;
    expect(turn.skipped).toBe(true);
    expect(turn.answer).toBe('');
  });

  it('does not allow editing a completed session', async () => {
    const done = await answerN(1, [CORRECT_ANSWER_ENGLISH], {
      judgments: [{}],
    });
    expect(done.completed).toBe(true);

    const { generate } = scriptedGenerator({ judgments: [{}] });
    const again = await applyInterviewAnswer(done.state, 'a different answer', generate);

    expect(again.state.turns).toHaveLength(1);
    expect(again.state.turns[0]!.answer).toBe(CORRECT_ANSWER_ENGLISH);
  });

  it('logs startedAt and answeredAt per turn', async () => {
    const progress = await answerN(5, [CORRECT_ANSWER_ENGLISH], {
      judgments: [{}],
    });

    const turn = progress.state.turns[0]!;
    expect(turn.startedAt).toBeTruthy();
    expect(turn.answeredAt).toBeTruthy();
  });

  it('presses deeper on a weak answer', async () => {
    const progress = await answerN(5, [PARTIAL_ANSWER_REPLICA], {
      judgments: [{ pressDeeper: true, nextProbe: 'What exactly is replication lag?' }],
    });

    expect(progress.state.currentProbe).toBe('What exactly is replication lag?');
  });

  it('moves on after a strong answer', async () => {
    const progress = await answerN(5, [CORRECT_ANSWER_ENGLISH], {
      judgments: [{ pressDeeper: false, nextProbe: 'Now, a different concept entirely.' }],
    });

    expect(progress.state.currentProbe).toBe('Now, a different concept entirely.');
  });
});
