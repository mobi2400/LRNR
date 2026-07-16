'use client';

import { useEffect, useId, useState, useTransition } from 'react';

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

const depthLabels: Record<PreferredDepth, string> = {
  beginner: 'Build foundations carefully',
  intermediate: 'Connect concepts to practice',
  advanced: 'Push toward architecture and tradeoffs',
  expert: 'Stress-test expert judgment',
};

const progressSteps = ['Goal', 'Starting point', 'Probe', 'Path building'];

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!json.ok) {
    throw new Error(json.error.message);
  }

  return json.data;
}

function getActiveStep(current: OnboardingCurrentResponse): number {
  if (current.status === 'not_started') {
    return 0;
  }

  if (current.status === 'processing') {
    return 3;
  }

  if (current.status === 'completed') {
    return 4;
  }

  return Math.min(3, Math.max(1, current.turnsCompleted + 1));
}

export function OnboardingPanel(): React.JSX.Element {
  const [current, setCurrent] =
    useState<OnboardingCurrentResponse>(initialCurrentState);
  const [goal, setGoal] = useState('');
  const [background, setBackground] = useState('');
  const [preferredDepth, setPreferredDepth] =
    useState<PreferredDepth>('beginner');
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const feedbackId = useId();
  const goalHelpId = useId();
  const answerHelpId = useId();
  const activeStep = getActiveStep(current);

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
                : 'Could not load the learning-path builder.',
            );
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStartSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
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
                background:
                  background.trim().length === 0 ? undefined : background,
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
          setMessage(
            'Good. LRNR has your goal and is asking one focused follow-up.',
          );
          setAnswer('');
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not start the learning-path builder.',
          );
        }
      })();
    });
  }

  async function handleReplySubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
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
            setMessage(
              'Your starting point is mapped. LRNR can now prepare the first path.',
            );
            setAnswer('');
            return;
          }

          setCurrent((previous) => ({
            onboardingId: previous.onboardingId,
            status: 'awaiting_reply',
            currentQuestion: data.nextQuestion,
            turnsCompleted: previous.turnsCompleted + 1,
          }));
          setMessage('Saved. LRNR is narrowing the next useful question.');
          setAnswer('');
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Could not submit this answer.',
          );
        }
      })();
    });
  }

  return (
    <article className="cockpit-panel onboarding-card">
      <div className="onboarding-card__intro">
        <p className="cockpit-panel__label">Build your learning path</p>
        <h2>Help LRNR understand where you are starting.</h2>
        <p>
          LRNR asks a few focused questions so the first lesson starts at the
          right depth instead of guessing from a single goal.
        </p>
      </div>

      <ol className="onboarding-steps" aria-label="Learning path progress">
        {progressSteps.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < activeStep;
          const isActive = stepNumber === activeStep;

          return (
            <li
              className={
                isActive
                  ? 'onboarding-step onboarding-step--active'
                  : isComplete
                    ? 'onboarding-step onboarding-step--complete'
                    : 'onboarding-step'
              }
              key={step}
            >
              <span aria-hidden="true">{stepNumber}</span>
              <strong>{step}</strong>
            </li>
          );
        })}
      </ol>

      <div
        aria-live="polite"
        className="onboarding-feedback"
        id={feedbackId}
        role={error === null ? 'status' : 'alert'}
      >
        {message === null ? null : (
          <p className="cockpit-feedback cockpit-feedback--success">
            {message}
          </p>
        )}
        {error === null ? null : (
          <p className="cockpit-feedback cockpit-feedback--error">{error}</p>
        )}
      </div>

      {current.status === 'not_started' ? (
        <form
          aria-describedby={feedbackId}
          className="cockpit-form onboarding-form"
          onSubmit={handleStartSubmit}
        >
          <label className="cockpit-field">
            <span>Learning goal</span>
            <small id={goalHelpId}>
              Say what you want to be able to explain, build, or decide after
              this path.
            </small>
            <textarea
              aria-describedby={goalHelpId}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={4}
              placeholder="Example: I want to understand agentic AI well enough to design a grounded study assistant."
              required
            />
          </label>
          <label className="cockpit-field">
            <span>Relevant background</span>
            <small>
              Optional, but useful: projects, study history, or what already
              feels confusing.
            </small>
            <textarea
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              rows={3}
              placeholder="I have built simple RAG apps, but agent planning still feels fuzzy."
            />
          </label>
          <label className="cockpit-field">
            <span>Preferred depth</span>
            <select
              value={preferredDepth}
              onChange={(event) =>
                setPreferredDepth(event.target.value as PreferredDepth)
              }
            >
              {Object.entries(depthLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="workspace-button"
            type="submit"
            disabled={isPending || goal.trim().length === 0}
          >
            {isPending ? 'Starting path...' : 'Build my learning path'}
          </button>
        </form>
      ) : current.status === 'processing' ? (
        <div className="onboarding-processing" aria-busy="true">
          <p className="cockpit-panel__label">Mapping first steps</p>
          <h3>LRNR is turning your answers into a starting path.</h3>
          <p>
            Your answers are saved. You can leave this surface and come back
            without losing progress.
          </p>
        </div>
      ) : current.status === 'completed' ? (
        <div className="cockpit-stack onboarding-complete">
          <p className="cockpit-panel__label">Path ready</p>
          <h3>LRNR has enough context to prepare the first lesson.</h3>
          <p className="cockpit-status">
            Completed after {current.turnsCompleted} focused replies.
          </p>
          <div className="cockpit-chip-row">
            <a className="workspace-button" href="/curriculum">
              Open learning path
            </a>
          </div>
        </div>
      ) : (
        <form
          aria-describedby={`${answerHelpId} ${feedbackId}`}
          className="cockpit-form onboarding-form"
          onSubmit={handleReplySubmit}
        >
          <p className="cockpit-status">
            Question {Math.min(current.turnsCompleted + 1, 4)} of 4
          </p>
          <div className="cockpit-field">
            <span>LRNR is asking this next</span>
            <div className="cockpit-question">{current.currentQuestion}</div>
          </div>
          <label className="cockpit-field">
            <span>Your answer</span>
            <small id={answerHelpId}>
              A specific answer helps LRNR choose the first useful lesson and
              avoid repeating what you already know.
            </small>
            <textarea
              aria-describedby={answerHelpId}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={5}
              required
            />
          </label>
          <button
            className="workspace-button"
            type="submit"
            disabled={isPending || answer.trim().length === 0}
          >
            {isPending ? 'Saving answer...' : 'Save answer'}
          </button>
        </form>
      )}
    </article>
  );
}
