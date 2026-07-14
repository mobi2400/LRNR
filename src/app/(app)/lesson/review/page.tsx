import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { assertUnlockedOwnerSession, getSessionAccessState } from '@/server/session';

export default async function LessonReviewPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="lesson-review"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page">
        <header className="cockpit-hero cockpit-hero--compact">
          <div>
            <p className="cockpit-kicker">Lesson Review</p>
            <h2>Review questions, hints, and recap space are ready for active recall.</h2>
            <p>
              This page is intentionally gentler than an exam screen. It exists to
              help the owner restate ideas, spot gaps, and compare against expected points.
            </p>
          </div>
        </header>
        <div className="cockpit-grid cockpit-grid--review">
          <article className="cockpit-panel cockpit-panel--primary">
            <p className="cockpit-panel__label">Review flow</p>
            <ol className="cockpit-list cockpit-list--ordered">
              <li>read the recap</li>
              <li>answer one question at a time</li>
              <li>check hints only when needed</li>
              <li>compare with the answer guide</li>
            </ol>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Answer surface</p>
            <p>
              The final answer box and saved-response history will connect here once
              the lesson and evaluation backend flows are implemented.
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
