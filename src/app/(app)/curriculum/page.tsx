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
import {
  getCurriculumMap,
  getPathProgression,
} from '@/services/curriculum.service';

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

  const [curriculum, progression] = await Promise.all([
    loadCurriculum(state.userId),
    getPathProgression({ userId: state.userId, requestId: 'curriculum-page' }),
  ]);
  const completedCount = curriculum.sessions.filter(
    (session) => session.status === 'completed',
  ).length;
  const hasCurriculum =
    curriculum.topicSlug !== null && curriculum.sessions.length > 0;
  const isFallbackGrounding = curriculum.roadmap?.grounding === 'fallback';
  const allSessionsComplete =
    hasCurriculum && completedCount === curriculum.sessions.length;
  // The path is complete on demonstrated mastery. Until then, finishing the
  // planned sessions opens the mastery check rather than a silent dead-end.
  const showMasteryComplete = progression.goalMastered;
  const showEvaluationGate = allSessionsComplete && !progression.goalMastered;

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

        {showMasteryComplete ? (
          <div className="path-mastery-note path-mastery-note--done" role="status">
            <strong>Goal mastered.</strong> You cleared the mastery bar for this
            goal with no open gaps, so the path is complete — you learned to
            mastery, not to a fixed number of days.
          </div>
        ) : null}

        {showEvaluationGate ? (
          <div className="path-mastery-note" role="status">
            <strong>Planned sessions done.</strong> A short mastery check now
            decides whether you&rsquo;ve got the goal or need targeted
            reinforcement — the path keeps going until you have it.
            <div className="path-mastery-actions">
              <Link className="btn btn-primary" href="/lesson/evaluate">
                Take the mastery check →
              </Link>
            </div>
          </div>
        ) : null}

        {hasCurriculum && isFallbackGrounding ? (
          <div className="path-grounding-note" role="status">
            <strong>Grounding limited.</strong> This path was built from LRNR&rsquo;s
            offline scaffold, not live research — so the sessions are generic
            rather than tailored to your goal. It usually means the research model
            was unavailable when the path was planned (often a rate limit). Re-plan
            the topic once the model is reachable to get a grounded path.
          </div>
        ) : null}

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
