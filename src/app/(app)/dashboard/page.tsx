import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { OnboardingPanel } from '@/components/onboarding/OnboardingPanel';
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
            <h2>Start the Architect flow, then let the rest of Phase 1 build on grounded learner context.</h2>
            <p>
              Frontend stays the cockpit. This onboarding loop now goes through protected
              LRNR APIs and writes profile, topic brief, and compact learner-memory seed data.
            </p>
          </div>
          <form action={logoutAction}>
            <button className="workspace-button workspace-button--ghost" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <div className="cockpit-grid cockpit-grid--dashboard">
          <OnboardingPanel />
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Protection</p>
            <dl className="cockpit-definition-list">
              <div><dt>Owner</dt><dd>{state.email ?? state.userId}</dd></div>
              <div><dt>Access mode</dt><dd>{state.accessMode}</dd></div>
              <div><dt>Unlock expires</dt><dd>{state.unlockedUntil}</dd></div>
            </dl>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Lesson Surfaces</p>
            <h3>Protected pages are still ready while onboarding stays interactive</h3>
            <p>
              The workflow will hold off on curriculum and lesson generation until the
              Architect has enough signal to hand off a real topic brief.
            </p>
            <div className="cockpit-chip-row">
              <a className="workspace-button" href="/lesson/current">Current lesson</a>
              <a className="workspace-button workspace-button--secondary" href="/lesson/review">Lesson review</a>
            </div>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Curriculum</p>
            <h3>Next phase handoff is staged, not rushed</h3>
            <p>
              Part 8 stops after Architect completion so Cartographer and Curriculum Builder
              can start later from a typed topic brief instead of a vague goal.
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
