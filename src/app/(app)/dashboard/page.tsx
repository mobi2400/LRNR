import type { JSX } from 'react';

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell/AppShell';
import { buildDashboardViewModel } from '@/components/dashboard/dashboard-view-model';
import { OnboardingPanel } from '@/components/onboarding/OnboardingPanel';
import { PrepareLearningPathButton } from '@/components/onboarding/PrepareLearningPathButton';
import {
  assertUnlockedOwnerSession,
  clearSessionCookies,
  getSessionAccessState,
} from '@/server/session';
import { dashboardService } from '@/services/dashboard.service';

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
  const viewModel = buildDashboardViewModel(dashboard);
  const hasLearningPath = viewModel.mode !== 'no_goal';

  return (
    <AppShell
      activeRoute="dashboard"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page" aria-labelledby="dashboard-title">
        <header className="cockpit-page-header">
          <div>
            <p className="cockpit-kicker">Today</p>
            <h1 id="dashboard-title">
              {hasLearningPath
                ? 'Your next useful step is clear.'
                : 'Build a learning path that starts where you are.'}
            </h1>
            <p>
              {hasLearningPath
                ? 'LRNR keeps the day focused: one lesson, one review path, and clear background activity.'
                : 'Tell LRNR your goal once. It will map the first steps before asking you to study.'}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              className="workspace-button workspace-button--quiet"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </header>

        <div className="dashboard-layout">
          <article
            className={`cockpit-panel cockpit-panel--primary dashboard-action dashboard-action--${viewModel.mode}`}
            aria-labelledby="dashboard-primary-title"
          >
            <div>
              <p className="cockpit-panel__label">
                {hasLearningPath ? 'Up next' : 'First step'}
              </p>
              <h2 id="dashboard-primary-title">{viewModel.primaryTitle}</h2>
              <p>{viewModel.primaryDescription}</p>
              <div className="cockpit-chip-row">
                <Link
                  className="workspace-button dashboard-continue"
                  href={viewModel.primaryActionHref}
                >
                  {viewModel.primaryActionLabel}
                </Link>
                <Link
                  className="dashboard-inline-link"
                  href={viewModel.secondaryActionHref}
                >
                  {viewModel.secondaryActionLabel}
                </Link>
              </div>
            </div>
            <div
              className="dashboard-progress"
              aria-label={`${viewModel.progressPercent}% of planned sessions complete`}
            >
              <span>{viewModel.progressPercent}%</span>
              <small>complete</small>
            </div>
          </article>

          <div
            className="dashboard-secondary-grid"
            aria-label="Learning status"
          >
            <article className="cockpit-panel progress-card">
              <p className="cockpit-panel__label">Current path</p>
              <h2>{viewModel.topicLabel}</h2>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${viewModel.progressPercent}%` }} />
              </div>
              <p className="dashboard-metric">{viewModel.progressText}</p>
              <Link className="workspace-link" href="/curriculum">
                See the path
              </Link>
            </article>

            <article className="cockpit-panel activity-card">
              <p className="cockpit-panel__label">LRNR activity</p>
              <h2>{viewModel.activityTitle}</h2>
              <p>{viewModel.activityDescription}</p>
              <p className="dashboard-metric">{viewModel.alertSummary}</p>
            </article>
          </div>

          <div
            className="dashboard-secondary-grid"
            aria-label="Review and trust"
          >
            <article className="cockpit-panel trust-card">
              <p className="cockpit-panel__label">Review</p>
              <h2>Keep the ideas warm.</h2>
              <p>
                Review opens the current lesson questions without pretending to
                save answers until the API supports persistence.
              </p>
              <Link className="workspace-link" href="/lesson/review">
                Open guided review
              </Link>
            </article>

            <article className="cockpit-panel trust-card">
              <p className="cockpit-panel__label">Sources</p>
              <h2>Trust stays attached to lessons.</h2>
              <p>
                Source details appear when the persisted lesson payload includes
                them. LRNR will not invent confidence or citation quality here.
              </p>
              <Link className="workspace-link" href="/lesson/current">
                Inspect lesson sources
              </Link>
            </article>
          </div>

          {hasLearningPath ? null : (
            <section
              className="dashboard-onboarding"
              id="build-learning-path"
              aria-labelledby="build-learning-path-title"
            >
              <div className="section-heading">
                <p className="cockpit-kicker">Learning path builder</p>
                <h2 id="build-learning-path-title">
                  Help LRNR understand your starting point.
                </h2>
              </div>
              <OnboardingPanel />
            </section>
          )}
          {viewModel.mode === 'lesson_not_ready' &&
          dashboard.topic.totalSessionCount === 0 ? (
            <section
              className="dashboard-onboarding"
              aria-labelledby="prepare-path-title"
            >
              <div className="section-heading">
                <p className="cockpit-kicker">Path preparation</p>
                <h2 id="prepare-path-title">
                  Turn your onboarding answers into the first lesson.
                </h2>
                <p>
                  Your answers are saved. LRNR will now research the topic,
                  build the curriculum, and persist the first lesson.
                </p>
              </div>
              <PrepareLearningPathButton />
            </section>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
