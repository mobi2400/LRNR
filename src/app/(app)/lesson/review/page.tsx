import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { assertUnlockedOwnerSession, getSessionAccessState } from '@/server/session';
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
      <section className="cockpit-page">
        <header className="cockpit-hero cockpit-hero--compact">
          <div>
            <p className="cockpit-kicker">Lesson Review</p>
            <h2>{lesson === null ? 'No review is ready yet.' : `Review: ${lesson.title}`}</h2>
            <p>
              {lesson?.objective ??
                `Current state: ${currentLesson.reasonIfEmpty ?? 'not_ready'}.`}
            </p>
          </div>
        </header>
        {lesson === null ? (
          <article className="cockpit-panel cockpit-panel--primary">
            <p className="cockpit-panel__label">Review status</p>
            <p>Generate and persist the lesson first, then review questions will appear here.</p>
          </article>
        ) : (
          <div className="cockpit-grid cockpit-grid--review">
            <article className="cockpit-panel cockpit-panel--primary">
              <p className="cockpit-panel__label">Recap</p>
              <h3>{lesson.mentalModel}</h3>
              <p>{lesson.nextAction}</p>
            </article>
            {lesson.reviewQuestions.map((question, index) => (
              <article className="cockpit-panel" key={question.id}>
                <p className="cockpit-panel__label">Question {index + 1}</p>
                <h3>{question.question}</h3>
                <p>{question.hint}</p>
                <ul className="cockpit-list">
                  {question.expectedPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
