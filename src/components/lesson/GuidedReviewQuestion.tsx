'use client';

import { useId, useState } from 'react';

type GuidedReviewQuestionProps = {
  index: number;
  question: string;
  hint: string;
  expectedPoints: string[];
};

export function GuidedReviewQuestion({
  index,
  question,
  hint,
  expectedPoints,
}: GuidedReviewQuestionProps): React.JSX.Element {
  const [answer, setAnswer] = useState('');
  const [hasCompared, setHasCompared] = useState(false);
  const answerId = useId();
  const guideId = useId();
  const hasAttempt = answer.trim().length > 0;
  const canShowGuide = hasAttempt || hasCompared;

  return (
    <article className="cockpit-panel review-question-card">
      <div>
        <p className="cockpit-panel__label">Question {index + 1}</p>
        <h3>{question}</h3>
      </div>

      <details className="review-disclosure">
        <summary>Need a hint?</summary>
        <p>{hint}</p>
      </details>

      <label className="cockpit-field" htmlFor={answerId}>
        <span>Your answer</span>
        <small>
          This is a local scratch answer for active recall. LRNR does not save
          review answers until a persistence API exists.
        </small>
      </label>
      <textarea
        className="review-answer"
        id={answerId}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={6}
        placeholder="Explain it in your own words before opening the guide."
      />

      <div className="review-actions">
        <button
          className="workspace-button workspace-button--secondary"
          type="button"
          aria-controls={guideId}
          aria-expanded={canShowGuide}
          onClick={() => setHasCompared(true)}
        >
          {hasAttempt ? 'Compare with guide' : 'Reveal guide'}
        </button>
        {!hasAttempt && !hasCompared ? (
          <p className="review-warning" role="note">
            Revealing now will show the guide before you try answering.
          </p>
        ) : null}
      </div>

      <div className="review-guide" id={guideId} hidden={!canShowGuide}>
        <p className="cockpit-panel__label">Gentle comparison guide</p>
        <ul className="cockpit-list">
          {expectedPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
