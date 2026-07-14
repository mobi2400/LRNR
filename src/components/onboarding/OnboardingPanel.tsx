'use client';

import { useEffect, useState, useTransition } from 'react';

import type {
  OnboardingCurrentResponse,
  OnboardingReplyResponse,
  PreferredDepth,
  StartGoalResponse,
} from '@/schemas/onboarding.schema';

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: {
    message: string;
  };
};

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

const initialCurrentState: OnboardingCurrentResponse = {
  onboardingId: null,
  status: 'not_started',
  turnsCompleted: 0,
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!json.ok) {
    throw new Error(json.error.message);
  }

  return json.data;
}

export function OnboardingPanel(): React.JSX.Element {
  const [current, setCurrent] = useState<OnboardingCurrentResponse>(initialCurrentState);
  const [goal, setGoal] = useState('');
  const [background, setBackground] = useState('');
  const [preferredDepth, setPreferredDepth] = useState<PreferredDepth>('beginner');
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    startTransition(() => {
      void (async () => {
        try {
          const nextState = await readJson<OnboardingCurrentResponse>(
            await fetch('/api/onboarding/current', { cache: 'no-store' }),
          );

          if (!cancelled) {
            setCurrent(nextState);
          }
        } catch (nextError) {
          if (!cancelled) {
            setError(
              nextError instanceof Error
                ? nextError.message
                : 'Could not load onboarding state.',
            );
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStartSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const data = await readJson<StartGoalResponse>(
            await fetch('/api/goals/start', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': crypto.randomUUID(),
              },
              body: JSON.stringify({
                goal,
                background: background.trim().length === 0 ? undefined : background,
                preferredDepth,
              }),
            }),
          );

          setCurrent({
            onboardingId: data.onboardingId,
            status: data.status,
            currentQuestion: data.firstQuestion,
            turnsCompleted: 0,
          });
          setMessage('Architect onboarding started.');
          setAnswer('');
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not start onboarding.',
          );
        }
      })();
    });
  }

  async function handleReplySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (current.onboardingId === null) {
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const data = await readJson<OnboardingReplyResponse>(
            await fetch('/api/onboarding/reply', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': crypto.randomUUID(),
              },
              body: JSON.stringify({
                onboardingId: current.onboardingId,
                answer,
              }),
            }),
          );

          if (data.status === 'completed') {
            setCurrent((previous) => ({
              onboardingId: previous.onboardingId,
              status: 'completed',
              turnsCompleted: previous.turnsCompleted + 1,
            }));
            setMessage('Onboarding is complete. The topic brief and memory seed are ready.');
            setAnswer('');
            return;
          }

          setCurrent((previous) => ({
            onboardingId: previous.onboardingId,
            status: 'awaiting_reply',
            currentQuestion: data.nextQuestion,
            turnsCompleted: previous.turnsCompleted + 1,
          }));
          setAnswer('');
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not submit onboarding reply.',
          );
        }
      })();
    });
  }

  return (
    <article className="cockpit-panel cockpit-panel--primary">
      <p className="cockpit-panel__label">Architect Onboarding</p>
      <h3>Shape the first study plan before curriculum generation begins</h3>
      <p>
        LRNR uses a short probing flow here so the profile, topic brief, and
        onboarding memory are grounded in more than a single self-assessment.
      </p>
      {message === null ? null : <p className="cockpit-feedback cockpit-feedback--success">{message}</p>}
      {error === null ? null : <p className="cockpit-feedback cockpit-feedback--error">{error}</p>}
      {current.status === 'not_started' ? (
        <form className="cockpit-form" onSubmit={handleStartSubmit}>
          <label className="cockpit-field">
            <span>Learning goal</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={4}
              placeholder="Example: I want to learn agentic AI well enough to build and ship a grounded study assistant."
              required
            />
          </label>
          <label className="cockpit-field">
            <span>Relevant background</span>
            <textarea
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              rows={3}
              placeholder="Optional: mention projects, study history, or what already feels confusing."
            />
          </label>
          <label className="cockpit-field">
            <span>Preferred depth</span>
            <select
              value={preferredDepth}
              onChange={(event) => setPreferredDepth(event.target.value as PreferredDepth)}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          <button className="workspace-button" type="submit" disabled={isPending || goal.trim().length === 0}>
            {isPending ? 'Starting...' : 'Start onboarding'}
          </button>
        </form>
      ) : current.status === 'completed' ? (
        <div className="cockpit-stack">
          <p className="cockpit-status">Onboarding complete after {current.turnsCompleted} replies.</p>
          <div className="cockpit-chip-row">
            <a className="workspace-button" href="/curriculum">Open curriculum</a>
            <a className="workspace-button workspace-button--secondary" href="/lesson/current">Go to lesson surface</a>
          </div>
        </div>
      ) : (
        <form className="cockpit-form" onSubmit={handleReplySubmit}>
          <p className="cockpit-status">Reply {current.turnsCompleted + 1} of 4</p>
          <label className="cockpit-field">
            <span>Current Architect question</span>
            <div className="cockpit-question">{current.currentQuestion}</div>
          </label>
          <label className="cockpit-field">
            <span>Your answer</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={5}
              required
            />
          </label>
          <button className="workspace-button" type="submit" disabled={isPending || answer.trim().length === 0}>
            {isPending ? 'Sending...' : 'Send reply'}
          </button>
        </form>
      )}
    </article>
  );
}
