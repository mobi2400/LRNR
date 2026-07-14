import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { assertUnlockedOwnerSession, getSessionAccessState } from '@/server/session';

export default async function CurrentLessonPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="lesson-current"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page">
        <header className="cockpit-hero cockpit-hero--compact">
          <div>
            <p className="cockpit-kicker">Daily Lesson</p>
            <h2>Frontend lesson cockpit is ready for persisted teaching payloads.</h2>
            <p>
              Part 7 focuses on the study surface: clear explanation space,
              mental-model emphasis, code/example room, and obvious next actions.
            </p>
          </div>
        </header>
        <div className="cockpit-grid cockpit-grid--lesson">
          <article className="cockpit-panel cockpit-panel--primary">
            <p className="cockpit-panel__label">Mental model</p>
            <h3>Learn one session at a time, then convert it into active recall.</h3>
            <p>
              Teaching content will land here in Part 11. This shell already
              prioritizes the explanation, examples, and follow-up area.
            </p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Explanation area</p>
            <ul className="cockpit-list">
              <li>structured explanation block</li>
              <li>diagram or mermaid slot</li>
              <li>code/example panel</li>
              <li>source citations strip</li>
            </ul>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Next action</p>
            <div className="cockpit-chip-row">
              <a className="workspace-button" href="/lesson/review">Move to review</a>
              <a className="workspace-button workspace-button--secondary" href="/curriculum">Open curriculum map</a>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
