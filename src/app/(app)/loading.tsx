import type { JSX } from 'react';

export default function AppLoading(): JSX.Element {
  return (
    <main className="state-shell" aria-busy="true" aria-live="polite">
      <section className="cockpit-panel state-card">
        <p className="cockpit-kicker">Loading</p>
        <h1>Preparing your study surface.</h1>
        <p>
          LRNR is checking the protected workspace and assembling the current
          learning view. Your progress is safe.
        </p>
      </section>
    </main>
  );
}
