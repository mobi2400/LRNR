import type { JSX } from 'react';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import {
  buildDashboardViewModel,
  type DashboardMode,
} from '@/components/dashboard/dashboard-view-model';
import { OnboardingPanel } from '@/components/onboarding/OnboardingPanel';
import { PrepareLearningPathButton } from '@/components/onboarding/PrepareLearningPathButton';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { dashboardService } from '@/services/dashboard.service';
import { settingsService } from '@/services/settings.service';


/**
 * The design's eyebrow reads "Due now — LRNR chose this". That is only true
 * when a lesson is actually waiting, so each dashboard mode gets its own
 * honest version of the same line.
 */
const EYEBROW_BY_MODE: Record<DashboardMode, string> = {
  no_goal: 'Start here — tell LRNR your goal',
  workflow_failed: 'Needs attention',
  topic_completed: 'Topic complete',
  lesson_not_ready: 'Preparing your next step',
  lesson_ready: 'Due now — LRNR chose this',
};

export default async function DashboardPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();
  assertUnlockedOwnerSession(state);

  const actor = { userId: state.userId, requestId: 'dashboard-page' };
  const [dashboard, settings] = await Promise.all([
    dashboardService.getDashboard(actor),
    settingsService.getSettings(actor),
  ]);
  const viewModel = buildDashboardViewModel(dashboard);
  const hasLearningPath = viewModel.mode !== 'no_goal';
  const needsPreparation =
    viewModel.mode === 'lesson_not_ready' &&
    dashboard.topic.totalSessionCount === 0;

  return (
    <AppShell
      activeRoute="dashboard"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <div className="today-modernist">
        <header className="m-header">
          <div>
            <h1 className="m-title">THE LRNR BRIEFING</h1>
            <p className="m-subtitle text-muted">
              {viewModel.topicLabel} · {viewModel.progressText}
            </p>
          </div>
          <div className="m-statbar" aria-label="Path progress">
            <div>
              <div className="m-stat-label text-muted">Progress</div>
              <div className="m-stat-value">{viewModel.progressPercent}%</div>
            </div>
            <div>
              <div className="m-stat-label text-muted">Sessions</div>
              <div className="m-stat-value">
                {dashboard.topic.completedSessionCount}
                <span className="text-muted" style={{ fontSize: '13px' }}>
                  /{dashboard.topic.totalSessionCount}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="lrnr-pad">
          <section className="today-lead">
            <div className="today-lead-main">
              <p className="m-eyebrow">{EYEBROW_BY_MODE[viewModel.mode]}</p>
              <h2 className="today-headline">{viewModel.primaryTitle}</h2>
              <p className="today-lede">{viewModel.primaryDescription}</p>
              <div className="today-actions">
                <Link
                  className="btn btn-primary"
                  href={viewModel.primaryActionHref}
                >
                  {viewModel.primaryActionLabel} →
                </Link>
                <Link
                  className="btn btn-secondary"
                  href={viewModel.secondaryActionHref}
                >
                  {viewModel.secondaryActionLabel}
                </Link>
              </div>
              <div className="today-meta">
                <div>
                  <div className="today-meta-label text-muted">Est. time</div>
                  <div className="today-meta-value">
                    ~{settings.dailyMinutes} min
                  </div>
                </div>
                <div>
                  <div className="today-meta-label text-muted">Path</div>
                  <div className="today-meta-value">{viewModel.topicLabel}</div>
                </div>
                <div>
                  <div className="today-meta-label text-muted">Then next</div>
                  <div className="today-meta-value">
                    {viewModel.secondaryActionLabel}
                  </div>
                </div>
              </div>
            </div>

            <aside className="today-news" aria-labelledby="today-news-title">
              <span className="today-news-title" id="today-news-title">
                What changed in your field
              </span>
              <p className="today-news-intro text-muted">
                Your course is never out of date. Developments are scored against
                where you are, then folded into the lessons they affect.
              </p>
              <div className="today-news-empty">
                <span className="m-pending">Phase 3</span>
                <p
                  className="today-news-intro text-muted"
                  style={{ marginTop: '10px' }}
                >
                  Field monitoring arrives with the Scout and News Intelligence
                  agents. Until then LRNR does not surface developments here
                  rather than showing ones it has not actually checked.
                </p>
              </div>
            </aside>
          </section>

          <hr className="m-rule" />

          <section className="today-territory" aria-labelledby="territory-title">
            <div className="today-territory-head">
              <div>
                <div className="today-section-label" id="territory-title">
                  Your concept territory
                </div>
                <p className="today-section-intro text-muted">
                  Everything the goal requires, and where you stand on each.
                  Mastery decays — LRNR watches for the slip and routes you back
                  before it costs you.
                </p>
              </div>
              <Link className="btn btn-secondary" href="/curriculum">
                Open full path →
              </Link>
            </div>

            <div className="today-map-grid">
              <div className="today-map">
                <div className="m-empty">
                  <span className="m-pending">Phase 2</span>
                  <p className="text-muted">
                    The concept map is drawn from per-concept mastery, which the
                    Evaluation agent produces. Your path and sessions are live
                    today — open the full path to see them.
                  </p>
                </div>
              </div>

              <div className="today-mapstats" aria-label="Concept mastery">
                <div>
                  <div className="today-mapstat-value">
                    {dashboard.topic.completedSessionCount}
                  </div>
                  <div className="today-mapstat-label text-muted">
                    Sessions done
                  </div>
                </div>
                <div>
                  <div
                    className="today-mapstat-value"
                    style={{ color: 'var(--color-neutral-600)' }}
                  >
                    —
                  </div>
                  <div className="today-mapstat-label text-muted">▲ Weak</div>
                </div>
                <div>
                  <div
                    className="today-mapstat-value"
                    style={{ color: 'var(--color-neutral-600)' }}
                  >
                    —
                  </div>
                  <div className="today-mapstat-label text-muted">
                    ◷ Decaying
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="today-footer">
            <span className="today-footer-note">{viewModel.alertSummary}</span>
            <Link className="btn btn-secondary" href="/lesson/review">
              Open guided review →
            </Link>
          </div>

          {hasLearningPath ? null : (
            <section
              className="today-onboarding"
              id="build-learning-path"
              aria-labelledby="build-learning-path-title"
            >
              <div className="today-section-label">Learning path builder</div>
              <h2 id="build-learning-path-title">
                Help LRNR understand your starting point.
              </h2>
              <OnboardingPanel />
            </section>
          )}

          {needsPreparation ? (
            <section
              className="today-onboarding"
              aria-labelledby="prepare-path-title"
            >
              <div className="today-section-label">Path preparation</div>
              <h2 id="prepare-path-title">
                Turn your onboarding answers into the first lesson.
              </h2>
              <p className="today-section-intro text-muted">
                Your answers are saved. LRNR will now research the topic, build
                the curriculum, and persist the first lesson.
              </p>
              <PrepareLearningPathButton />
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
