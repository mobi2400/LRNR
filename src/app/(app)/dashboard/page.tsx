import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { OnboardingPanel } from '@/components/onboarding/OnboardingPanel';
import { dashboardService } from '@/services/dashboard.service';
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

  const dashboard = await dashboardService.getDashboard({
    userId: state.userId,
    requestId: 'dashboard-page',
  });

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
            <p className="cockpit-panel__label">Learning State</p>
            <h3>{dashboard.topic.currentTopicSlug ?? 'No active topic yet'}</h3>
            <dl className="cockpit-definition-list">
              <div><dt>Topic status</dt><dd>{dashboard.topic.topicStatus ?? 'not ready'}</dd></div>
              <div><dt>Current session</dt><dd>{dashboard.topic.currentSession?.title ?? dashboard.topic.currentSessionId ?? 'none'}</dd></div>
              <div><dt>Progress</dt><dd>{dashboard.topic.completedSessionCount} / {dashboard.topic.totalSessionCount}</dd></div>
              <div><dt>Cache</dt><dd>{dashboard.cache.status}</dd></div>
            </dl>
            <div className="cockpit-chip-row">
              <a className="workspace-button" href="/lesson/current">Current lesson</a>
              <a className="workspace-button workspace-button--secondary" href="/lesson/review">Lesson review</a>
            </div>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Workflow</p>
            <h3>{dashboard.latestWorkflow?.jobType ?? 'No workflow runs yet'}</h3>
            <dl className="cockpit-definition-list">
              <div><dt>Status</dt><dd>{dashboard.latestWorkflow?.status ?? 'idle'}</dd></div>
              <div><dt>Alerts</dt><dd>{dashboard.alerts.length} recent delivery rows</dd></div>
              <div><dt>Revision</dt><dd>{dashboard.topic.curriculumRevision ?? 'none'}</dd></div>
            </dl>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
