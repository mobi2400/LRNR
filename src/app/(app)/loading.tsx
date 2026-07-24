import type { JSX } from 'react';

/**
 * Loading state for every protected surface.
 *
 * It reproduces the real shell — rail, double-ruled header, content columns —
 * so the page resolves in place rather than swapping a card for a layout. The
 * skeleton itself is hidden from assistive tech; one live message carries the
 * status instead.
 */
export default function AppLoading(): JSX.Element {
  return (
    <div className="lrnr-modernist">
      <div className="lrnr-shell" aria-busy="true">
        <p className="sr-only" role="status" aria-live="polite">
          Loading your workspace.
        </p>

        <aside className="lrnr-rail" aria-hidden="true">
          <div>
            <div className="lrnr-brand">
              <span>LRNR</span>
            </div>
            <p className="lrnr-tagline text-muted">
              Your personal AI university. Learn to mastery, not to 100%.
            </p>
          </div>
          <div className="lrnr-railnav m-load-navrow">
            <span className="m-skeleton" style={{ height: '34px' }} />
            <span className="m-skeleton" style={{ height: '34px' }} />
            <span className="m-skeleton" style={{ height: '34px' }} />
            <span className="m-skeleton" style={{ height: '34px' }} />
            <span className="m-skeleton" style={{ height: '34px' }} />
          </div>
          <div className="lrnr-owner">
            <div className="lrnr-owner-label text-muted">Owner</div>
            <span
              className="m-skeleton"
              style={{ height: '14px', width: '80%', marginTop: '8px' }}
            />
          </div>
        </aside>

        <main className="lrnr-main">
          <header className="m-load-header" aria-hidden="true">
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <span
                className="m-skeleton m-skeleton--accent"
                style={{ height: '12px', width: '128px' }}
              />
              <span
                className="m-skeleton"
                style={{ height: '30px', width: 'min(420px, 80%)', marginTop: '14px' }}
              />
              <span
                className="m-skeleton"
                style={{ height: '12px', width: 'min(300px, 60%)', marginTop: '12px' }}
              />
            </div>
            <span
              className="m-skeleton"
              style={{ height: '58px', width: '210px' }}
            />
          </header>

          <div className="m-load-body" aria-hidden="true">
            <div className="m-load-col">
              <span className="m-skeleton" style={{ height: '52px', width: '90%' }} />
              <span className="m-skeleton" style={{ height: '52px', width: '70%' }} />
              <span className="m-skeleton" style={{ height: '16px', width: '100%' }} />
              <span className="m-skeleton" style={{ height: '16px', width: '94%' }} />
              <span className="m-skeleton" style={{ height: '16px', width: '76%' }} />
              <span
                className="m-skeleton m-skeleton--accent"
                style={{ height: '44px', width: '190px', marginTop: '10px' }}
              />
            </div>
            <div className="m-load-col">
              <span className="m-skeleton" style={{ height: '12px', width: '60%' }} />
              <span className="m-skeleton" style={{ height: '132px', width: '100%' }} />
              <span className="m-skeleton" style={{ height: '12px', width: '80%' }} />
            </div>
          </div>

          <p className="m-load-note">Assembling your current learning view</p>
        </main>
      </div>
    </div>
  );
}
