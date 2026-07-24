'use client';

import { useEffect, useId, useState, useTransition } from 'react';

import type {
  OnboardingCurrentResponse,
  OnboardingReplyResponse,
  PreferredDepth,
  StartGoalResponse,
} from '@/schemas/onboarding.schema';

import './onboarding-modernist.css';

/** Starting points offered by the design, as real goal text. */
const GOAL_PRESETS: Array<{ label: string; sub: string }> = [
  {
    label: 'Ship reliable AI agents',
    sub: 'Prompting → memory → evaluation → deploy',
  },
  {
    label: 'Applied machine learning',
    sub: 'From data to a model in production',
  },
  {
    label: 'Distributed systems design',
    sub: 'Consistency, scale, failure modes',
  },
];

const DEPTH_OPTIONS: Array<{
  value: PreferredDepth;
  label: string;
  sub: string;
}> = [
  { value: 'beginner', label: 'New to it', sub: 'Start at foundations' },
  { value: 'intermediate', label: 'Some exposure', sub: 'Probe, then fill gaps' },
  {
    value: 'advanced',
    label: 'Working knowledge',
    sub: 'Straight to the edges',
  },
  { value: 'expert', label: 'Deep already', sub: 'Stress-test judgment' },
];

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
    <div className="ob-modernist">
      <ol className="ob-steps" aria-label="Learning path progress">
        {progressSteps.map((step, index) => {
          const stepNumber = index + 1;
          const state =
            stepNumber === activeStep
              ? 'active'
              : stepNumber < activeStep
                ? 'complete'
                : 'waiting';

          return (
            <li className="ob-step" data-state={state} key={step}>
              <span className="ob-step-n">Step {stepNumber}</span>
              <span className="ob-step-label">{step}</span>
            </li>
          );
        })}
      </ol>

      <div
        aria-live="polite"
        className="ob-feedback"
        id={feedbackId}
        role={error === null ? 'status' : 'alert'}
      >
        {message === null ? null : <p className="text-muted">{message}</p>}
        {error === null ? null : <p className="ob-error">{error}</p>}
      </div>

      {current.status === 'not_started' ? (
        <form aria-describedby={feedbackId} onSubmit={handleStartSubmit}>
          <p className="m-eyebrow ob-eyebrow">
            What are you here to master?
          </p>
          <h3 className="ob-headline">
            Name the capability, not a course title.
          </h3>
          <p className="ob-lede">
            LRNR builds a living path to a real skill — one that stays current
            as the field moves. Tell it where you want to end up.
          </p>

          <div className="ob-block">
            <label className="ob-label text-muted" htmlFor="ob-goal">
              Your goal
            </label>
            <textarea
              aria-describedby={goalHelpId}
              className="ob-textarea"
              id="ob-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={3}
              placeholder="e.g. Build and ship reliable AI agents"
              required
            />
            <p className="ob-help text-muted" id={goalHelpId}>
              Say what you want to be able to explain, build, or decide after
              this path.
            </p>

            <div
              className="ob-label text-muted"
              style={{ margin: '20px 0 0' }}
              id="ob-preset-label"
            >
              Or start from a proven path
            </div>
            <div
              className="ob-chips"
              role="group"
              aria-labelledby="ob-preset-label"
            >
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="ob-chip"
                  aria-pressed={goal === preset.label}
                  onClick={() => {
                    setGoal(preset.label);
                  }}
                >
                  {preset.label}
                  <span>{preset.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ob-block">
            <div className="ob-label text-muted" id="ob-depth-label">
              Where you&apos;re starting
            </div>
            <div
              className="ob-segs"
              role="group"
              aria-labelledby="ob-depth-label"
            >
              {DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="ob-seg"
                  aria-pressed={preferredDepth === option.value}
                  onClick={() => {
                    setPreferredDepth(option.value);
                  }}
                >
                  {option.label}
                  <span>{option.sub}</span>
                </button>
              ))}
            </div>
            <p className="ob-help text-muted">
              This is a first read, not a placement test — LRNR verifies it with
              real probes in the interview that follows.
            </p>
          </div>

          <div className="ob-block">
            <label className="ob-label text-muted" htmlFor="ob-background">
              Why it matters to you{' '}
              <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                (optional — sharpens examples)
              </span>
            </label>
            <input
              className="ob-input"
              id="ob-background"
              value={background}
              onChange={(event) => setBackground(event.target.value)}
              placeholder="e.g. Switching from backend into an AI role this year"
            />
          </div>

          <div className="ob-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isPending || goal.trim().length === 0}
              style={{ padding: '12px 22px', fontSize: '15px' }}
            >
              {isPending ? 'Starting path…' : 'Calibrate →'}
            </button>
          </div>
        </form>
      ) : current.status === 'processing' ? (
        <div aria-busy="true">
          <p className="m-eyebrow ob-eyebrow">Mapping first steps</p>
          <h3 className="ob-headline">
            LRNR is turning your answers into a starting path.
          </h3>
          <p className="ob-lede">
            Your answers are saved. You can leave this surface and come back
            without losing progress.
          </p>
        </div>
      ) : current.status === 'completed' ? (
        <div>
          <p className="m-eyebrow ob-eyebrow">LRNR drafted your path</p>
          <h3 className="ob-headline">
            Enough context to prepare the first lesson.
          </h3>
          <p className="ob-lede">
            Completed after {current.turnsCompleted} focused replies. A
            dependency map, not a syllabus — it re-plans as you prove concepts.
          </p>
          <div className="ob-actions">
            <a className="btn btn-primary" href="/curriculum">
              Open learning path →
            </a>
          </div>
        </div>
      ) : (
        <form
          aria-describedby={`${answerHelpId} ${feedbackId}`}
          onSubmit={handleReplySubmit}
        >
          <p className="m-eyebrow ob-eyebrow">Calibrate the starting line</p>
          <h3 className="ob-headline">
            So LRNR skips what you know and probes what you don&apos;t.
          </h3>

          <div className="ob-question">
            <div className="ob-label text-muted">LRNR is asking</div>
            <p>{current.currentQuestion}</p>
          </div>

          <div className="ob-block">
            <label className="ob-label text-muted" htmlFor="ob-answer">
              Your answer
            </label>
            <textarea
              aria-describedby={answerHelpId}
              className="ob-textarea"
              id="ob-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={5}
              required
            />
            <p className="ob-help text-muted" id={answerHelpId}>
              A specific answer helps LRNR choose the first useful lesson and
              avoid repeating what you already know.
            </p>
          </div>

          <div className="ob-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isPending || answer.trim().length === 0}
              style={{ padding: '12px 22px', fontSize: '15px' }}
            >
              {isPending ? 'Saving answer…' : 'Save answer →'}
            </button>
          </div>
        </form>
      )}

      <div className="ob-promise">
        <div className="ob-label text-muted">The LRNR promise</div>
        <div className="ob-promise-quote">
          <p>
            The course that never goes out of date — because it isn&apos;t a
            course.
          </p>
        </div>
        <ul className="ob-promise-list">
          <li>
            You finish at <strong>mastery</strong>, never at 100% of a checklist.
          </li>
          <li>One reasoned next action a day — LRNR decides, you show up.</li>
          <li>
            Lessons are grounded in real sources, with the citations attached.
          </li>
        </ul>
      </div>
    </div>
  );
}
