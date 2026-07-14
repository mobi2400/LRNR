import type { JSX } from 'react';

export default function AppLoading(): JSX.Element {
  return (
    <div className="cockpit-panel cockpit-panel--loading" aria-busy="true">
      <p className="cockpit-kicker">Loading</p>
      <h2>Preparing your study surface.</h2>
      <p>
        LRNR is checking the protected workspace and assembling the current
        learning view.
      </p>
    </div>
  );
}
