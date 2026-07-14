import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { assertUnlockedOwnerSession, getSessionAccessState } from '@/server/session';

export default async function CurriculumPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="curriculum"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page">
        <header className="cockpit-hero cockpit-hero--compact">
          <div>
            <p className="cockpit-kicker">Curriculum Map</p>
            <h2>The roadmap shell is ready for Layer 1, Layer 2, and live updates.</h2>
            <p>
              Phase 1 can stay simple here: clear roadmap area, session list,
              current pointer, and prerequisite context without deep graph work yet.
            </p>
          </div>
        </header>
        <div className="cockpit-grid cockpit-grid--curriculum">
          <article className="cockpit-panel cockpit-panel--primary">
            <p className="cockpit-panel__label">Layer 1 roadmap</p>
            <p>High-level milestones and topic direction will render here.</p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Layer 2 sessions</p>
            <p>Ordered session cards and the current-session pointer will appear here.</p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Layer 3 queue</p>
            <p>Later live updates will surface here without disturbing protected near-term sessions.</p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
