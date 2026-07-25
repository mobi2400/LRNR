import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { generateStructured, type StructuredGenerationInput } from '@/lib/llm';
import { appLogger } from '@/lib/logger';
import { serverConfig } from '@/server/config';
import {
  gapFindingSchema,
  interviewSessionStateSchema,
  interviewVerdictSchema,
  type GapFinding,
  type InterviewSessionState,
  type InterviewTurn,
  type InterviewVerdict,
} from '@/schemas/evaluation.schema';

// The interview is intentionally short: evaluation fatigue destroys the signal.
const DEFAULT_TURN_CAP = 5;

interface StartInterviewInput {
  topicSlug: string;
  turnCap?: number;
  sessionId?: string;
  /** Optional seed probe; otherwise the generator (or fallback) writes one. */
  firstProbe?: string;
}

export interface InterviewProgress {
  state: InterviewSessionState;
  completed: boolean;
  verdict: InterviewVerdict | null;
}

/**
 * Structured generator seam, identical in spirit to the Architect's. `undefined`
 * resolves to the real LLM in production and the deterministic path under
 * test/offline; `null` forces deterministic; a function overrides it (tests
 * drive the judge through this seam). The interview must never hard-fail on a
 * model error — a degraded turn becomes an *unscored* turn, not a crash.
 */
export type EvaluationGenerator =
  | (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>)
  | null;

function resolveGenerator(
  generate: EvaluationGenerator | undefined,
): (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>) | null {
  if (generate === null) {
    return null;
  }

  if (generate === undefined) {
    return serverConfig.nodeEnv === 'test' ? null : generateStructured;
  }

  return generate;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const evaluationSystemPrompt = `You are LRNR's Evaluation agent: a detective-mode interviewer.
Your job is to find the precise boundary between what the learner genuinely
understands and what they can only recite.

Rules:
- One probe at a time. Adapt to the previous answer.
- Grade technical knowledge, not language: a correct answer in mixed
  Hindi-English (Hinglish) is a correct answer.
- Never praise a confidently wrong answer. If the answer is wrong or partial,
  name the specific missing element.
- Every gap finding MUST cite a real source URL from the evidence provided. If
  retrieval returned no evidence, do not invent a citation — mark the turn
  unscored instead.
- Return one JSON object, no markdown fence.`;

const openingProbeSchema = z.object({
  probe: z.string().trim().min(1).max(2000),
});

// The judge tolerates a model that omits optional fields; a missing verdict or
// empty findings is a valid "nothing to flag" turn, not a parse failure.
const turnJudgmentSchema = z.object({
  verdict: z.string().trim().min(1).nullable().default(null),
  gapFindings: z.array(gapFindingSchema).default([]),
  unscored: z.boolean().default(false),
  pressDeeper: z.boolean().default(false),
  nextProbe: z.string().trim().min(1).nullable().default(null),
});

function transcript(turns: InterviewTurn[]): string {
  if (turns.length === 0) {
    return '(no answers yet)';
  }

  return turns
    .map(
      (turn, index) =>
        `Turn ${index + 1}\nProbe: ${turn.probe}\nAnswer: ${
          turn.skipped ? '(skipped)' : turn.answer
        }`,
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Generator-backed steps
// ---------------------------------------------------------------------------

async function generateOpeningProbe(
  input: StartInterviewInput,
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<string> {
  const decision = await generate({
    label: 'evaluation_opening_probe',
    system: evaluationSystemPrompt,
    prompt: `Topic under evaluation: ${input.topicSlug}

Write the single best opening probe for this interview. It must require
demonstrating understanding, not reciting a definition.
Return { "probe": "..." }.`,
    schema: openingProbeSchema,
    temperature: 0.5,
    maxTokens: 2_500,
  });

  return decision.probe;
}

async function judgeAnswer(
  state: InterviewSessionState,
  probe: string,
  answer: string,
  turnIndex: number,
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<z.infer<typeof turnJudgmentSchema>> {
  return generate({
    label: 'evaluation_turn_judgment',
    system: evaluationSystemPrompt,
    prompt: `Topic: ${state.topicSlug}
Turns so far:
${transcript(state.turns)}

Current probe: ${probe}
Learner answered: ${answer}

This is turn ${turnIndex + 1} of at most ${state.turnCap}.
Judge the answer. If it is wrong or partial, record a gap finding naming the
specific missing element, each with a real source URL. If the answer is strong,
move on to a new concept; if it is weak, press deeper on the same area.
Return JSON: { "verdict": str|null, "gapFindings": [{"claim","evidence","sourceUri","masteryLevel"}], "unscored": bool, "pressDeeper": bool, "nextProbe": str|null }`,
    schema: turnJudgmentSchema,
    temperature: 0.3,
    maxTokens: 3_000,
  });
}

async function synthesizeVerdict(
  state: InterviewSessionState,
  turns: InterviewTurn[],
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<InterviewVerdict> {
  return generate({
    label: 'evaluation_verdict',
    system: evaluationSystemPrompt,
    prompt: `Synthesize the final verdict for this evaluation interview.

Topic: ${state.topicSlug}
Transcript:
${turns
  .map(
    (turn, index) =>
      `Q${index + 1}: ${turn.probe}\nA${index + 1}: ${
        turn.skipped ? '(skipped)' : turn.answer
      }\nVerdict: ${turn.verdict ?? '(unscored)'}`,
  )
  .join('\n')}

Grade only the scored turns. Return JSON:
{ "headline": "...", "gaps": [{"claim","evidence","sourceUri","masteryLevel"}], "masteryGrid": {"canSolve": bool, "canExplain": bool, "canDecide": bool}, "partialCoverage": str|null }`,
    schema: interviewVerdictSchema,
    temperature: 0.3,
    maxTokens: 3_000,
  });
}

// ---------------------------------------------------------------------------
// Deterministic path (test/offline and resilient fallback)
// ---------------------------------------------------------------------------

const DETERMINISTIC_PROBES = [
  'Explain the core idea in your own words — what problem does it exist to solve?',
  'Walk me through how you would apply this in a real system you were building.',
  'Someone senior claims this is unnecessary. How do you respond?',
  'What breaks first at ten times your current scale?',
  'How does this connect to the other concepts you have covered?',
];

function deterministicProbe(turnIndex: number): string {
  return (
    DETERMINISTIC_PROBES[turnIndex % DETERMINISTIC_PROBES.length] ??
    DETERMINISTIC_PROBES[0]!
  );
}

/**
 * Offline judging. It never fabricates a citation, so it produces no gap
 * findings — it only records a plain verdict and whether to press deeper. This
 * keeps the interview usable without a model while never inventing evidence.
 */
function deterministicJudgment(
  answer: string,
  skipped: boolean,
): z.infer<typeof turnJudgmentSchema> {
  if (skipped) {
    return {
      verdict: 'Did not attempt.',
      gapFindings: [],
      unscored: false,
      pressDeeper: false,
      nextProbe: null,
    };
  }

  const normalized = answer.toLowerCase();
  const weak = /\b(not sure|idk|don.t know|maybe|i think|easier)\b/.test(
    normalized,
  );

  return {
    verdict: weak
      ? 'Partial answer — did not name the specific mechanism.'
      : 'Answer demonstrates working understanding.',
    gapFindings: [],
    unscored: false,
    pressDeeper: weak,
    nextProbe: null,
  };
}

// ---------------------------------------------------------------------------
// Turn assembly (shared by both paths)
// ---------------------------------------------------------------------------

function cap<T>(values: T[], max: number): T[] {
  return values.slice(0, max);
}

function buildTurn(
  turnIndex: number,
  probe: string,
  answer: string,
  skipped: boolean,
  startedAt: string,
  judgment: z.infer<typeof turnJudgmentSchema>,
): InterviewTurn {
  // A degraded/unscored turn carries no verdict and no findings — it must never
  // masquerade as a graded answer.
  const unscored = judgment.unscored;

  return {
    turnIndex,
    probe,
    answer: skipped ? '' : answer,
    startedAt,
    answeredAt: new Date().toISOString(),
    verdict: unscored ? null : judgment.verdict,
    gapFindings: unscored ? [] : cap(judgment.gapFindings, 8),
    unscored,
    skipped,
  };
}

function scoredTurns(turns: InterviewTurn[]): InterviewTurn[] {
  return turns.filter((turn) => !turn.unscored);
}

function collectGaps(turns: InterviewTurn[]): GapFinding[] {
  return turns.flatMap((turn) => turn.gapFindings);
}

async function buildFinalVerdict(
  state: InterviewSessionState,
  turns: InterviewTurn[],
  generate:
    | (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>)
    | null,
): Promise<InterviewVerdict | null> {
  const scored = scoredTurns(turns);

  // No scored turns → no verdict. The UI shows "we couldn't evaluate this
  // session" rather than a fabricated grade.
  if (scored.length === 0) {
    return null;
  }

  const partialCoverage =
    scored.length < turns.length
      ? `based on ${scored.length} of ${turns.length} answers`
      : null;

  if (generate === null) {
    // Deterministic verdict: grounded only in what was actually scored.
    return interviewVerdictSchema.parse({
      headline: 'Evaluation complete.',
      gaps: collectGaps(scored),
      masteryGrid: { canSolve: false, canExplain: true, canDecide: false },
      partialCoverage,
    });
  }

  try {
    const verdict = await synthesizeVerdict(state, scored, generate);

    // Preserve the computed coverage string even if the model omitted it — the
    // partial-coverage signal is a fact about the session, not a model opinion.
    return interviewVerdictSchema.parse({
      ...verdict,
      partialCoverage: verdict.partialCoverage ?? partialCoverage,
    });
  } catch (error) {
    // A model error during synthesis must never yield a hallucinated verdict.
    appLogger.warn('evaluation.verdict_fallback', {
      sessionId: state.sessionId,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createInterviewSession(
  input: StartInterviewInput,
  generate?: EvaluationGenerator,
): Promise<InterviewSessionState> {
  const topicSlug = input.topicSlug.trim();
  const turnCap = input.turnCap ?? DEFAULT_TURN_CAP;
  const resolved = resolveGenerator(generate);
  let firstProbe = input.firstProbe?.trim() || deterministicProbe(0);

  if (input.firstProbe === undefined && resolved !== null) {
    try {
      firstProbe = await generateOpeningProbe(input, resolved);
    } catch (error) {
      appLogger.warn('evaluation.opening_probe_fallback', {
        topicSlug,
        error: error instanceof Error ? error.message : 'unknown',
      });
      firstProbe = deterministicProbe(0);
    }
  }

  return interviewSessionStateSchema.parse({
    sessionId: input.sessionId ?? randomUUID(),
    topicSlug,
    status: 'awaiting_answer',
    turns: [],
    turnCap,
    currentProbe: firstProbe,
    detectedGaps: [],
    verdictSummary: null,
  });
}

export async function applyInterviewAnswer(
  state: InterviewSessionState,
  rawAnswer: string,
  generate?: EvaluationGenerator,
): Promise<InterviewProgress> {
  // A completed session is frozen: no editing a submitted answer, no extra
  // turns past the cap.
  if (state.status === 'completed' || state.currentProbe === null) {
    return {
      state,
      completed: state.status === 'completed',
      verdict: state.verdictSummary,
    };
  }

  const probe = state.currentProbe;
  const turnIndex = state.turns.length;
  const startedAt = state.turns[turnIndex - 1]?.answeredAt ?? new Date().toISOString();
  const answer = rawAnswer.trim();
  const skipped = answer.length === 0;
  const resolved = resolveGenerator(generate);

  let judgment: z.infer<typeof turnJudgmentSchema>;

  if (resolved === null || skipped) {
    judgment = deterministicJudgment(answer, skipped);
  } else {
    try {
      judgment = await judgeAnswer(state, probe, answer, turnIndex, resolved);
    } catch (error) {
      // Degraded model output (LlmDegradedError from T1) or any judging failure
      // marks the turn unscored — never a fabricated grade.
      appLogger.warn('evaluation.turn_unscored', {
        sessionId: state.sessionId,
        turn: turnIndex,
        error: error instanceof Error ? error.message : 'unknown',
      });
      judgment = {
        verdict: null,
        gapFindings: [],
        unscored: true,
        pressDeeper: false,
        nextProbe: null,
      };
    }
  }

  const turn = buildTurn(turnIndex, probe, answer, skipped, startedAt, judgment);
  const turns = [...state.turns, turn];
  const detectedGaps = collectGaps(turns);
  const isComplete = turns.length >= state.turnCap;

  if (isComplete) {
    const verdict = await buildFinalVerdict(state, turns, resolved);
    const nextState = interviewSessionStateSchema.parse({
      ...state,
      status: 'completed',
      turns,
      currentProbe: null,
      detectedGaps,
      verdictSummary: verdict,
    });

    return { state: nextState, completed: true, verdict };
  }

  // Not complete: present the next probe and keep waiting for an answer. An
  // unscored turn does not end the interview.
  const nextProbe =
    !turn.unscored && judgment.nextProbe !== null
      ? judgment.nextProbe
      : deterministicProbe(turns.length);

  const nextState = interviewSessionStateSchema.parse({
    ...state,
    status: 'awaiting_answer',
    turns,
    currentProbe: nextProbe,
    detectedGaps,
    verdictSummary: null,
  });

  return { state: nextState, completed: false, verdict: null };
}
