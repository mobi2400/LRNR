import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import {
  assertUnlockedOwnerSession,
  clearSessionCookies,
  getSessionAccessState,
} from '@/server/session';
import { redirect } from 'next/navigation';

async function logoutAction(): Promise<void> {
  'use server';

  await clearSessionCookies();
  redirect('/login?error=signed-out');
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="dashboard"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page">
        <header className="cockpit-hero">
          <div>
            <p className="cockpit-kicker">Learning Dashboard</p>
            <h2>Continue the private Phase 1 study loop from one calm command center.</h2>
            <p>
              The dashboard is frontend-first now: current lesson, curriculum,
              review, and settings are all available as protected study surfaces.
            </p>
          </div>
          <form action={logoutAction}>
            <button className="workspace-button workspace-button--ghost" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <div className="cockpit-grid cockpit-grid--dashboard">
          <article className="cockpit-panel cockpit-panel--primary">
            <p className="cockpit-panel__label">Today</p>
            <h3>Current lesson surface is ready</h3>
            <p>
              Start with the lesson page, then move into guided review once the
              explanation and mental model feel clear.
            </p>
            <div className="cockpit-chip-row">
              <a className="workspace-button" href="/lesson/current">Continue learning</a>
              <a className="workspace-button workspace-button--secondary" href="/lesson/review">Open review</a>
            </div>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Protection</p>
            <dl className="cockpit-definition-list">
              <div><dt>Owner</dt><dd>{state.email ?? state.userId}</dd></div>
              <div><dt>Access mode</dt><dd>{state.accessMode}</dd></div>
              <div><dt>Unlock expires</dt><dd>{state.unlockedUntil}</dd></div>
            </dl>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Curriculum</p>
            <h3>Roadmap shell is in place</h3>
            <p>
              The curriculum page now acts as the study map where Layer 1, Layer 2,
              and upcoming live updates will converge.
            </p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Settings</p>
            <h3>Notification and voice controls are staged</h3>
            <p>
              Settings already reserve space for Telegram, evaluation reminders,
              and future voice UX preferences.
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
