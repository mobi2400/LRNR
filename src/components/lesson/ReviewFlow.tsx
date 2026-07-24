'use client';

import { useState, type JSX } from 'react';

import Link from 'next/link';

export type ReviewQuestion = {
  id: string;
  question: string;
  hint: string;
  expectedPoints: string[];
};

type Rating = 'miss' | 'shaky' | 'solid' | 'skip';

type ReviewFlowProps = {
  lessonTitle: string;
  mentalModel: string;
  questions: ReviewQuestion[];
};

const STATUS_LABEL: Record<Rating, string> = {
  solid: 'Solid',
  shaky: 'Shaky',
  miss: 'Missed',
  skip: 'Skipped',
};

/**
 * The design's card flow: one probe at a time, answer from memory, then reveal
 * what LRNR was checking and rate how it landed.
 *
 * The probes, the hint and the "what LRNR was checking" points are all real —
 * they come from the persisted lesson. The ratings move you through tonight's
 * set but are NOT persisted: scheduling the next sighting from them is the
 * Evaluation agent's job in Phase 2, so the UI says so rather than implying a
 * spaced-repetition schedule that does not exist yet.
 */
export function ReviewFlow({
  lessonTitle,
  mentalModel,
  questions,
}: ReviewFlowProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [results, setResults] = useState<Rating[]>([]);

  const total = questions.length;
  const isFinished = index >= total;
  const current = questions[index];
  const answeredCount = results.filter((rating) => rating !== 'skip').length;

  function advance(rating: Rating): void {
    setResults((previous) => [...previous, rating]);
    setIndex((previous) => previous + 1);
    setIsRevealed(false);
  }

  return (
    <div className="review-grid">
      <section className="review-main">
        <div className="review-pips" aria-label="Review progress">
          {questions.map((question, pipIndex) => (
            <span
              key={question.id}
              className="review-pip"
              data-state={
                pipIndex < index
                  ? results[pipIndex]
                  : pipIndex === index && !isFinished
                    ? 'current'
                    : 'waiting'
              }
            />
          ))}
          <span className="review-pos text-muted">
            {isFinished
              ? `${total} of ${total}`
              : `Card ${index + 1} of ${total}`}
          </span>
        </div>

        {isFinished || current === undefined ? (
          <div className="review-done">
            <div className="review-done-label">Reviewed</div>
            <h2>That is tonight&apos;s set closed.</h2>
            <p>
              You worked through {total} probe{total === 1 ? '' : 's'} from this
              lesson and rated {answeredCount} of them. LRNR keeps review tied to
              the current lesson: scheduling the next sighting from your ratings
              arrives with the Evaluation agent in Phase 2, so nothing was saved.
            </p>
            <div className="review-done-actions">
              <Link className="btn btn-primary" href="/dashboard">
                Back to Today →
              </Link>
              <Link className="btn btn-secondary" href="/curriculum">
                See it on the path
              </Link>
            </div>
          </div>
        ) : (
          <>
            <article className="review-card">
              <div className="review-card-head">
                <span className="review-card-concept">{lessonTitle}</span>
                <span className="review-card-meta text-muted">
                  Probe {index + 1} of {total}
                </span>
              </div>
              <div className="review-card-body">
                <div className="review-probe-label">Probe</div>
                <h2 className="review-question">{current.question}</h2>

                {isRevealed ? (
                  <>
                    <div className="review-answer">
                      <div className="review-answer-label">
                        What LRNR was checking
                      </div>
                      <ul>
                        {current.expectedPoints.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="review-rate">
                      <div className="review-rate-label">
                        How did that land?
                      </div>
                      <div className="review-rate-grid">
                        <button
                          type="button"
                          className="review-rate-btn"
                          data-rating="miss"
                          onClick={() => {
                            advance('miss');
                          }}
                        >
                          Missed it<span>Worth re-reading</span>
                        </button>
                        <button
                          type="button"
                          className="review-rate-btn"
                          data-rating="shaky"
                          onClick={() => {
                            advance('shaky');
                          }}
                        >
                          Shaky<span>Come back to it</span>
                        </button>
                        <button
                          type="button"
                          className="review-rate-btn"
                          data-rating="solid"
                          onClick={() => {
                            advance('solid');
                          }}
                        >
                          Solid<span>You can explain it</span>
                        </button>
                      </div>
                      <p className="review-note text-muted">
                        Rating moves you through tonight&apos;s set. It is not
                        saved yet — mastery scheduling belongs to the Evaluation
                        agent in Phase 2.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="review-prompt text-muted">
                      Answer it in your head first. Retrieval is the point —
                      reading the answer without the effort does not move
                      mastery.
                    </p>
                    <details className="review-hint">
                      <summary>Need a hint?</summary>
                      <p>{current.hint}</p>
                    </details>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        padding: '12px 20px',
                        fontSize: '15px',
                        marginTop: '20px',
                      }}
                      onClick={() => {
                        setIsRevealed(true);
                      }}
                    >
                      Reveal answer
                    </button>
                  </>
                )}
              </div>
            </article>

            <div className="review-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  advance('skip');
                }}
              >
                Skip this one →
              </button>
              <span className="text-muted" style={{ fontSize: '11.5px' }}>
                These probes come from the current lesson.
              </span>
            </div>
          </>
        )}
      </section>

      <aside className="review-side" aria-label="Review queue">
        <div className="review-side-label">This lesson&apos;s probes</div>
        <ul className="review-queue">
          {questions.map((question, queueIndex) => {
            const state =
              queueIndex < index
                ? 'done'
                : queueIndex === index && !isFinished
                  ? 'current'
                  : 'waiting';
            const rating = results[queueIndex];

            return (
              <li key={question.id} data-state={state}>
                <span className="review-queue-dot" />
                <div style={{ minWidth: 0 }}>
                  <div className="review-queue-name">
                    Probe {queueIndex + 1}
                  </div>
                  <div className="review-queue-status text-muted">
                    {state === 'current'
                      ? 'Now'
                      : rating === undefined
                        ? 'Waiting'
                        : STATUS_LABEL[rating]}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="review-side-note">
          <p className="text-muted">
            <strong style={{ color: 'var(--color-text)' }}>
              Before you answer:
            </strong>{' '}
            {mentalModel}
          </p>
        </div>
      </aside>
    </div>
  );
}
