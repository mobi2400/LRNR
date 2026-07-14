'use client';

import type { JSX } from 'react';

type AppErrorProps = {
  error: Error;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps): JSX.Element {
  return (
    <div className="cockpit-panel cockpit-panel--error">
      <p className="cockpit-kicker">Workspace error</p>
      <h2>The protected learning shell hit a problem.</h2>
      <p>{error.message}</p>
      <button className="workspace-button" type="button" onClick={reset}>
        Retry this view
      </button>
    </div>
  );
}
