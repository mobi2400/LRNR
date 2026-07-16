import type { JSX } from 'react';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { GuidedReviewQuestion } from '@/components/lesson/GuidedReviewQuestion';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { getCurrentLesson } from '@/services/lesson.service';

export default async function LessonReviewPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const currentLesson = await getCurrentLesson({
    userId: state.userId,
  });
  const lesson = currentLesson.lesson;

  return (
    <AppShell
      activeRoute="lesson-review"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section
        className="cockpit-page review-page"
        aria-labelledby="review-title"
      >
        <header className="cockpit-page-header">
          <div>
            <p className="cockpit-kicker">Guided review</p>
            <h1 id="review-title">
              {lesson === null
                ? 'No review is ready yet.'
                : `Review: ${lesson.title}`}
            </h1>
            <p>
              {lesson?.objective ??
                `Current state: ${currentLesson.reasonIfEmpty ?? 'not_ready'}.`}
            </p>
          </div>
          <Link
            className="workspace-button workspace-button--secondary"
            href="/lesson/current"
          >
            Back to lesson
          </Link>
        </header>

        {lesson === null ? (
          <article className="cockpit-panel empty-state" aria-live="polite">
            <p className="cockpit-panel__label">Review status</p>
            <h2>Review unlocks after a lesson is persisted.</h2>
            <p>
              LRNR keeps review tied to the current lesson payload. Once the
              lesson exists, the questions and guide will appear here.
            </p>
            <Link className="workspace-button" href="/dashboard">
              Return to Today
            </Link>
          </article>
        ) : (
          <div className="review-layout">
            <article className="cockpit-panel review-recap">
              <p className="cockpit-panel__label">
                Before you answer, remember this
              </p>
              <h2>{lesson.mentalModel}</h2>
              <p>{lesson.nextAction}</p>
            </article>

            <div className="review-question-list" aria-label="Review questions">
              {lesson.reviewQuestions.map((question, index) => (
                <GuidedReviewQuestion
                  expectedPoints={question.expectedPoints}
                  hint={question.hint}
                  index={index}
                  key={question.id}
                  question={question.question}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
