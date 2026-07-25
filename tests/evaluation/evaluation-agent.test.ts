import { describe, expect, it } from 'vitest';

/**
 * Evaluation agent test skeletons — the spec the implementation must satisfy.
 *
 * Each it.todo() becomes a real test as T1-T11 land. The fixtures below are
 * the golden inputs; the assertions are the contract.
 *
 * Import pattern (uncomment when the agent exists):
 *   import { createInterviewSession, applyInterviewAnswer, type EvaluationGenerator }
 *     from '@/agents/evaluation/evaluation-agent';
 */

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WRONG_ANSWER_CONFIDENT =
  'Consistent hashing means the server hashes the password consistently ' +
  'so the same password always produces the same hash. This is important ' +
  'for load balancing because each server can verify passwords independently.';

const PARTIAL_ANSWER_REPLICA =
  "I'd add a read replica because it's easier and it spreads the read load " +
  'across more machines.';

const CORRECT_ANSWER_HINGLISH =
  'Replication lag tab hota hai jab write load zyada ho jaata hai. ' +
  'Read replica eventually consistent hota hai, toh agar lag badh gaya ' +
  'toh stale reads milenge. Signal yeh hai ki replica lag monitoring ' +
  'mein spike aaye aur application-level consistency guarantee break ho.';

const CORRECT_ANSWER_ENGLISH =
  'A read replica stops working when replication lag exceeds the ' +
  "application's consistency requirements. The signal is replica lag " +
  'exceeding your SLA threshold under sustained write load.';

const SKIP_ANSWER = '';

// ── Critical path 1: Judge leniency ──────────────────────────────────────────

describe('evaluation agent — judge calibration', () => {
  it.todo(
    'never praises a confidently wrong answer',
    // Fixture: WRONG_ANSWER_CONFIDENT — confuses password hashing with
    // consistent hashing for load balancing. Judge must find at least one
    // gap finding. If it praises this, the product has failed.
  );

  it.todo(
    'names the specific missing element in a partial answer',
    // Fixture: PARTIAL_ANSWER_REPLICA — mentions replicas but not
    // replication lag. Gap finding must mention "replication lag" or
    // equivalent concept. The claim must be specific, not generic.
  );

  it.todo(
    'cites a source for every gap finding',
    // No gap finding in the verdict may have an empty sourceUri.
    // The gapFindingSchema enforces z.string().url() but the judge
    // must actually provide one — a fabricated "https://example.com"
    // is a test failure too if we can detect it.
  );

  it.todo(
    'grades a Hinglish answer on knowledge not language',
    // Fixture: CORRECT_ANSWER_HINGLISH — technically correct, mixed
    // Hindi-English. Judge must grade as correct (no gap finding for
    // the concept being tested). Design decision 11: "grade technical
    // knowledge, not English proficiency."
  );

  it.todo(
    'does not invent a citation when rag_search returns empty evidence',
    // When retrieval returns { evidence: [] }, the judge must not
    // fabricate a source URI. The turn should be marked unscored
    // rather than grounded against nothing.
  );
});

// ── Critical path 2: Degradation / unscored turns ────────────────────────────

describe('evaluation agent — degradation and unscored turns', () => {
  it.todo(
    'marks a turn unscored when the model returns degraded output',
    // Depends on T1 (degradation detection). The generator mock
    // returns a degraded/templated response; the turn must have
    // unscored=true and no gap findings.
  );

  it.todo(
    'continues the interview after an unscored turn',
    // After an unscored turn, the next probe must appear. The
    // session status stays 'awaiting_answer', not 'completed'.
  );

  it.todo(
    'produces a partial verdict when some turns are unscored',
    // 3 of 5 turns scored. Verdict must include partialCoverage
    // string like "based on 3 of 5 answers" and only grade the
    // scored turns.
  );

  it.todo(
    'produces no verdict when all turns are unscored',
    // All 5 turns unscored. verdictSummary must be null. The UI
    // shows "we couldn't evaluate this session" — not a fabricated
    // verdict.
  );

  it.todo(
    'never emits a fabricated verdict',
    // On model error during verdict synthesis, verdictSummary must
    // be null. The session completes with status 'completed' but
    // no verdict, rather than a hallucinated one.
  );
});

// ── Turn loop mechanics ──────────────────────────────────────────────────────

describe('evaluation agent — turn loop', () => {
  it.todo(
    'completes after the turn cap',
    // 5-turn interview. After turn 5, status must be 'completed'
    // and a verdict must be present (assuming scored turns exist).
  );

  it.todo(
    'records a skip as a blank answer with skipped=true',
    // Fixture: SKIP_ANSWER (empty string). Turn must have
    // skipped=true, answer='', and the judge treats it as
    // "did not attempt."
  );

  it.todo(
    'does not allow editing a submitted answer',
    // After applyInterviewAnswer succeeds for turn N, a second
    // call for the same turnIndex must throw or return the
    // existing turn unchanged. Design decision 8: "No."
  );

  it.todo(
    'logs startedAt and answeredAt per turn',
    // Every turn must have startedAt (when the probe was presented)
    // and answeredAt (when the answer was submitted). Design
    // decision 9: no visible timer, but log elapsed.
  );

  it.todo(
    'presses deeper on a weak answer',
    // Fixture: PARTIAL_ANSWER_REPLICA. The follow-up probe must
    // address the same area (replicas/replication), not move on.
  );

  it.todo(
    'moves on after a strong answer',
    // Fixture: CORRECT_ANSWER_ENGLISH. The next probe must cover
    // a different concept, not re-ask the same area.
  );
});
