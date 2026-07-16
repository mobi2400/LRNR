import type { JSX } from 'react';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { getCurriculumMap } from '@/services/curriculum.service';

function formatStatus(status: string): string {
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function CurriculumPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const curriculum = await getCurriculumMap({
    userId: state.userId,
    requestId: 'curriculum-page',
  });
  const completedCount = curriculum.sessions.filter(
    (session) => session.status === 'completed',
  ).length;
  const hasCurriculum = curriculum.topicSlug !== null;

  return (
    <AppShell
      activeRoute="curriculum"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section
        className="cockpit-page curriculum-page"
        aria-labelledby="curriculum-title"
      >
        <header className="cockpit-page-header">
          <div>
            <p className="cockpit-kicker">Learning path</p>
            <h1 id="curriculum-title">
              {curriculum.roadmap?.title ?? 'No active learning path yet.'}
            </h1>
            <p>
              {curriculum.roadmap?.goal ??
                'Start from Today to help LRNR build the first path. This page will show ordered sessions once they exist.'}
            </p>
          </div>
          <Link className="workspace-button" href="/lesson/current">
            Current lesson
          </Link>
        </header>

        {!hasCurriculum ? (
          <article className="cockpit-panel empty-state" aria-live="polite">
            <p className="cockpit-panel__label">Path status</p>
            <h2>No sessions planned yet.</h2>
            <p>
              LRNR needs a learning goal and starting-point answers before it
              can show a truthful curriculum timeline.
            </p>
            <Link
              className="workspace-button"
              href="/dashboard#build-learning-path"
            >
              Build learning path
            </Link>
          </article>
        ) : (
          <div className="curriculum-layout">
            <aside
              className="cockpit-panel curriculum-summary"
              aria-label="Path summary"
            >
              <p className="cockpit-panel__label">Progress</p>
              <h2>
                {completedCount} of {curriculum.sessions.length} sessions
                complete
              </h2>
              <p>
                Required depth:{' '}
                <strong>
                  {curriculum.roadmap?.requiredDepth ?? 'not specified'}
                </strong>
              </p>
              <p>
                Revision:{' '}
                <strong>{curriculum.revision ?? 'not available'}</strong>
              </p>
              {curriculum.roadmap === null ? null : (
                <div>
                  <p className="cockpit-panel__label">Milestones</p>
                  <ul className="cockpit-list">
                    {curriculum.roadmap.milestones.map((milestone) => (
                      <li key={milestone}>{milestone}</li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>

            <ol className="curriculum-timeline" aria-label="Ordered sessions">
              {curriculum.sessions.map((session, index) => {
                const isCurrent =
                  session.sessionId === curriculum.currentSessionId;

                return (
                  <li
                    className={
                      isCurrent
                        ? 'curriculum-session curriculum-session--current'
                        : `curriculum-session curriculum-session--${session.status}`
                    }
                    key={session.sessionId}
                  >
                    <div
                      className="curriculum-session__marker"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </div>
                    <article className="cockpit-panel curriculum-session__card">
                      <div>
                        <p className="cockpit-panel__label">
                          {isCurrent
                            ? 'Current session'
                            : formatStatus(session.status)}
                        </p>
                        <h2>{session.title}</h2>
                      </div>
                      <ul className="concept-chip-list" aria-label="Concepts">
                        {session.concepts.map((concept) => (
                          <li key={concept}>{concept}</li>
                        ))}
                      </ul>
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    </AppShell>
  );
}
