import { cache, type JSX } from 'react';
import type { Metadata } from 'next';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { ReviewFlow } from '@/components/lesson/ReviewFlow';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import {
  formatTopicLabel,
  getMetadataUserId,
  toMetaText,
} from '@/server/page-metadata';
import { getCurrentLesson } from '@/services/lesson.service';

const loadLesson = cache(async (userId: string) =>
  getCurrentLesson({ userId }),
);

export async function generateMetadata(): Promise<Metadata> {
  const userId = await getMetadataUserId();

  if (userId === null) {
    return { title: 'Review' };
  }

  try {
    const { lesson } = await loadLesson(userId);

    if (lesson === null) {
      return {
        title: 'Review',
        description: 'Review unlocks once a lesson is persisted.',
      };
    }

    const probeCount = lesson.reviewQuestions.length;

    return {
      title: `Review · ${toMetaText(lesson.title, 55)}`,
      description: toMetaText(
        `${probeCount} probe${probeCount === 1 ? '' : 's'} from this lesson. ${lesson.mentalModel}`,
        160,
      ),
    };
  } catch {
    return { title: 'Review' };
  }
}


export default async function LessonReviewPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const currentLesson = await loadLesson(state.userId);
  const lesson = currentLesson.lesson;
  const hasProbes = lesson !== null && lesson.reviewQuestions.length > 0;

  return (
    <AppShell
      activeRoute="lesson-review"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <div className="review-modernist">
        <header className="m-header">
          <div>
            <p className="m-eyebrow">Guided review</p>
            <h1 className="m-title">GUIDED REVIEW</h1>
            <p className="m-subtitle text-muted">
              {lesson === null
                ? 'No lesson is persisted yet'
                : 'Answer from memory first — retrieval is what moves mastery'}
            </p>
          </div>
          {lesson === null ? null : (
            <div className="m-statbar" aria-label="Review queue">
              <div>
                <div className="m-stat-label text-muted">Probes</div>
                <div className="m-stat-value">
                  {lesson.reviewQuestions.length}
                </div>
              </div>
              <div>
                <div className="m-stat-label text-muted">Topic</div>
                <div className="m-stat-value" style={{ fontSize: '13px' }}>
                  {formatTopicLabel(lesson.topicSlug)}
                </div>
              </div>
            </div>
          )}
        </header>

        {hasProbes && lesson !== null ? (
          <ReviewFlow
            lessonTitle={lesson.title}
            mentalModel={lesson.mentalModel}
            questions={lesson.reviewQuestions}
          />
        ) : (
          <div className="review-empty" aria-live="polite">
            <span className="m-pending">Review status</span>
            <h2>Review unlocks after a lesson is persisted.</h2>
            <p>
              LRNR keeps review tied to the current lesson payload. Once the
              lesson exists, its probes appear here — it will not invent
              questions to fill the page.
            </p>
            <div className="review-done-actions">
              <Link className="btn btn-primary" href="/dashboard">
                Return to Today →
              </Link>
              <Link className="btn btn-secondary" href="/lesson/current">
                Open the lesson
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
