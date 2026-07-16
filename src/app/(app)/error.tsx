'use client';

import type { JSX } from 'react';

type AppErrorProps = {
  error: Error;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps): JSX.Element {
  return (
    <main className="state-shell">
      <section className="cockpit-panel state-card" role="alert">
        <p className="cockpit-kicker">Workspace error</p>
        <h1>This view could not finish loading.</h1>
        <p>
          Your learning progress is safe. Retry the view, and use the technical
          details only if you are debugging the private deployment.
        </p>
        <button className="workspace-button" type="button" onClick={reset}>
          Retry this view
        </button>
        <details className="technical-details">
          <summary>Technical details</summary>
          <pre>{error.message}</pre>
        </details>
      </section>
    </main>
  );
}
