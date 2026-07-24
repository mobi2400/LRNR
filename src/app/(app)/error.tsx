'use client';

import type { JSX } from 'react';

import Link from 'next/link';

type AppErrorProps = {
  error: Error;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps): JSX.Element {
  return (
    <div className="lrnr-modernist">
      <main className="lrnr-main">
        <div className="m-state" role="alert">
          <p className="m-eyebrow">Workspace error</p>
          <h1>This view could not finish loading.</h1>
          <p>
            Your learning progress is safe — nothing was lost. Retry the view,
            and use the technical details only if you are debugging this
            deployment.
          </p>
          <div className="m-state-actions">
            <button className="btn btn-primary" type="button" onClick={reset}>
              Retry this view →
            </button>
            <Link className="btn btn-secondary" href="/dashboard">
              Back to Today
            </Link>
          </div>
          <details className="m-state-details">
            <summary>Technical details</summary>
            <pre>{error.message}</pre>
          </details>
        </div>
      </main>
    </div>
  );
}
