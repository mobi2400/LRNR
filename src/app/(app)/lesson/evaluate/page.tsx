import { cache, type JSX } from 'react';
import type { Metadata } from 'next';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { MasteryCheck } from '@/components/lesson/MasteryCheck';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { getCurriculumMap } from '@/services/curriculum.service';

const loadCurriculum = cache(async (userId: string) =>
  getCurriculumMap({ userId, requestId: 'evaluate-page' }),
);

export const metadata: Metadata = {
  title: 'Mastery check',
  description: 'A short evaluation that decides mastery or reinforcement.',
};

export default async function EvaluatePage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const curriculum = await loadCurriculum(state.userId);
  const hasTopic = curriculum.topicSlug !== null;

  return (
    <AppShell
      activeRoute="lesson-review"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <div className="review-modernist">
        <header className="m-header">
          <div>
            <p className="m-eyebrow">Learn to mastery</p>
            <h1 className="m-title">MASTERY CHECK</h1>
            <p className="m-subtitle text-muted">
              The path continues until you&rsquo;ve actually got it — not until a
              fixed number of days runs out.
            </p>
          </div>
        </header>

        {hasTopic ? (
          <MasteryCheck
            topicSlug={curriculum.topicSlug!}
            goal={curriculum.roadmap?.goal ?? 'this goal'}
          />
        ) : (
          <div className="review-empty" aria-live="polite">
            <span className="m-pending">Nothing to evaluate</span>
            <h2>No active learning path yet.</h2>
            <p>
              A mastery check evaluates the goal LRNR is teaching you. Start from
              Today to plan a path first.
            </p>
            <div className="review-done-actions">
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
