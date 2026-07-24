import { cache, type JSX } from 'react';
import type { Metadata } from 'next';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { PathMap } from '@/components/curriculum/PathMap';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import {
  formatTopicLabel,
  getMetadataUserId,
  toMetaText,
} from '@/server/page-metadata';
import { getCurriculumMap } from '@/services/curriculum.service';

const loadCurriculum = cache(async (userId: string) =>
  getCurriculumMap({ userId, requestId: 'curriculum-page' }),
);

export async function generateMetadata(): Promise<Metadata> {
  const userId = await getMetadataUserId();

  if (userId === null) {
    return { title: 'Path' };
  }

  try {
    const curriculum = await loadCurriculum(userId);

    if (curriculum.topicSlug === null) {
      return {
        title: 'Path',
        description: 'No learning path has been planned yet.',
      };
    }

    const completed = curriculum.sessions.filter(
      (session) => session.status === 'completed',
    ).length;

    return {
      title: `Path · ${toMetaText(formatTopicLabel(curriculum.topicSlug), 55)}`,
      description: toMetaText(
        `${completed} of ${curriculum.sessions.length} sessions complete. ${curriculum.roadmap?.goal ?? ''}`,
        160,
      ),
    };
  } catch {
    return { title: 'Path' };
  }
}


function formatTopic(topicSlug: string): string {
  return topicSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function CurriculumPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const curriculum = await loadCurriculum(state.userId);
  const completedCount = curriculum.sessions.filter(
    (session) => session.status === 'completed',
  ).length;
  const hasCurriculum =
    curriculum.topicSlug !== null && curriculum.sessions.length > 0;

  return (
    <AppShell
      activeRoute="curriculum"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <div className="path-modernist">
        <header className="m-header">
          <div>
            <p className="m-eyebrow">The whole territory</p>
            <h1 className="m-title">
              {curriculum.topicSlug === null
                ? 'YOUR PATH'
                : `${formatTopic(curriculum.topicSlug)} · YOUR PATH`}
            </h1>
            <p className="m-subtitle text-muted">
              {curriculum.roadmap?.goal ??
                'Not a syllabus — the sessions LRNR planned for this goal'}
            </p>
          </div>
          {hasCurriculum ? (
            <div className="m-statbar" aria-label="Path progress">
              <div>
                <div className="m-stat-label text-muted">Completed</div>
                <div className="m-stat-value">
                  {completedCount}
                  <span className="text-muted" style={{ fontSize: '13px' }}>
                    /{curriculum.sessions.length}
                  </span>
                </div>
              </div>
              <div>
                <div className="m-stat-label text-muted">Depth</div>
                <div className="m-stat-value" style={{ fontSize: '15px' }}>
                  {curriculum.roadmap?.requiredDepth ?? '—'}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        {hasCurriculum ? (
          <PathMap
            sessions={curriculum.sessions}
            currentSessionId={curriculum.currentSessionId}
          />
        ) : (
          <div className="path-empty" aria-live="polite">
            <span className="m-pending">Path status</span>
            <h2>No path has been planned yet.</h2>
            <p>
              LRNR builds the path after it understands your goal and researches
              the topic. Start from Today and it will map the sessions before
              asking you to study.
            </p>
            <div className="path-empty-actions">
              <Link className="btn btn-primary" href="/dashboard">
                Return to Today →
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
