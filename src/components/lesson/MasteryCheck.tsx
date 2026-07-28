'use client';

import { useState, type JSX } from 'react';

import Link from 'next/link';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } };

type StartData = {
  sessionId: string;
  currentProbe: string | null;
};

type MasteryGrid = { canSolve: boolean; canExplain: boolean; canDecide: boolean };

type AnswerData = {
  completed: boolean;
  currentProbe: string | null;
  verdict: {
    headline: string;
    masteryGrid: MasteryGrid;
    gaps: Array<{ claim: string }>;
  } | null;
};

type Phase = 'idle' | 'running' | 'submitting' | 'done' | 'error';

async function postJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return (await response.json()) as ApiEnvelope<T>;
}

const GRID_LABEL: Record<keyof MasteryGrid, string> = {
  canSolve: 'Can solve',
  canExplain: 'Can explain',
  canDecide: 'Can decide',
};

/**
 * The learner-facing mastery check. It drives the evaluation interview through
 * the existing /api/interview endpoints; when it completes, the server applies
 * the verdict to the live path (master the goal or grow it), so the Path page
 * reflects the outcome on return.
 */
export function MasteryCheck({
  topicSlug,
  goal,
}: {
  topicSlug: string;
  goal: string;
}): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<AnswerData['verdict']>(null);
  const [error, setError] = useState<string | null>(null);

  async function begin(): Promise<void> {
    setError(null);
    setPhase('running');

    const result = await postJson<StartData>('/api/interview/start', {
      topicSlug,
    });

    if (!result.ok) {
      setError(result.error.message);
      setPhase('error');
      return;
    }

    setSessionId(result.data.sessionId);
    setProbe(result.data.currentProbe);
  }

  async function submit(): Promise<void> {
    if (sessionId === null) return;

    setPhase('submitting');
    setError(null);

    const result = await postJson<AnswerData>('/api/interview/answer', {
      sessionId,
      answer: answer.trim(),
    });

    if (!result.ok) {
      setError(result.error.message);
      setPhase('error');
      return;
    }

    setAnswer('');

    if (result.data.completed) {
      setVerdict(result.data.verdict);
      setProbe(null);
      setPhase('done');
      return;
    }

    setProbe(result.data.currentProbe);
    setPhase('running');
  }

  if (phase === 'idle') {
    return (
      <div className="mastery-check">
        <p className="mastery-check-lead">
          You&rsquo;ve worked through the planned sessions for{' '}
          <strong>{goal}</strong>. A short evaluation now decides what happens
          next: if you&rsquo;ve mastered the goal, the path is complete; if not,
          LRNR adds targeted reinforcement sessions and you keep going.
        </p>
        <p className="text-muted mastery-check-note">
          Answer from understanding, not recall. A few probes, adapting to your
          answers.
        </p>
        <button className="btn btn-primary" type="button" onClick={begin}>
          Start the mastery check →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const grid = verdict?.masteryGrid;

    return (
      <div className="mastery-check">
        <span className="m-pending">Evaluation complete</span>
        <h2 className="mastery-check-headline">
          {verdict?.headline ?? 'Evaluation recorded.'}
        </h2>
        {grid === undefined ? null : (
          <div className="mastery-grid" aria-label="Demonstrated capabilities">
            {(Object.keys(GRID_LABEL) as Array<keyof MasteryGrid>).map((key) => (
              <span key={key} data-met={grid[key] ? 'true' : 'false'}>
                {grid[key] ? '✓' : '—'} {GRID_LABEL[key]}
              </span>
            ))}
          </div>
        )}
        <p className="text-muted mastery-check-note">
          Your path has been updated from this result — open it to see whether
          the goal is complete or new reinforcement sessions were added.
        </p>
        <Link className="btn btn-primary" href="/curriculum">
          See your updated path →
        </Link>
      </div>
    );
  }

  return (
    <div className="mastery-check">
      <div className="mastery-check-probe-label text-muted">Probe</div>
      <h2 className="mastery-check-probe">{probe ?? 'Preparing the first probe…'}</h2>
      <textarea
        className="mastery-check-answer"
        value={answer}
        disabled={phase === 'submitting' || probe === null}
        onChange={(event) => {
          setAnswer(event.target.value);
        }}
        placeholder="Explain in your own words…"
        rows={6}
      />
      <div className="mastery-check-actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={phase === 'submitting' || probe === null}
          onClick={submit}
        >
          {phase === 'submitting' ? 'Judging…' : 'Submit answer'}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={phase === 'submitting' || probe === null}
          onClick={submit}
          title="Submit an empty answer to skip this probe"
        >
          Skip
        </button>
      </div>
      {error === null ? null : (
        <p className="cockpit-feedback cockpit-feedback--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
