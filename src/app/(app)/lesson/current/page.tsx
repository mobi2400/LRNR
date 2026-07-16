import type { JSX } from 'react';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { CompleteLessonButton } from '@/components/lesson/CompleteLessonButton';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { getCurrentLesson } from '@/services/lesson.service';

type EmptyLessonCopy = { title: string; body: string };

const defaultEmptyLessonCopy: EmptyLessonCopy = {
  title: 'Your next lesson is being prepared.',
  body: 'LRNR reads persisted lesson state here. It will not generate a lesson during normal page load.',
};

const emptyLessonCopy: Record<string, EmptyLessonCopy> = {
  no_active_topic: {
    title: 'No active topic yet.',
    body: 'Start by building a learning path. LRNR will prepare lessons only after it understands your goal and starting point.',
  },
  waiting_for_onboarding: {
    title: 'LRNR is still learning where to start.',
    body: 'Finish the learning-path questions first. Your answers help LRNR prepare a lesson at the right depth.',
  },
  completed: {
    title: 'This topic has no next lesson ready.',
    body: 'The current path appears complete or between sessions. Use review or inspect the path for the next safe step.',
  },
  not_ready: defaultEmptyLessonCopy,
};

function getEmptyLessonCopy(reason: string | undefined): EmptyLessonCopy {
  return emptyLessonCopy[reason ?? 'not_ready'] ?? defaultEmptyLessonCopy;
}

export default async function CurrentLessonPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const currentLesson = await getCurrentLesson({
    userId: state.userId,
  });
  const lesson = currentLesson.lesson;
  const emptyCopy = getEmptyLessonCopy(currentLesson.reasonIfEmpty);

  return (
    <AppShell
      activeRoute="lesson-current"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section
        className="cockpit-page lesson-page"
        aria-labelledby="lesson-title"
      >
        <header className="cockpit-page-header lesson-page__header">
          <div>
            <p className="cockpit-kicker">Daily lesson</p>
            <h1 id="lesson-title">{lesson?.title ?? emptyCopy.title}</h1>
            <p>{lesson?.objective ?? emptyCopy.body}</p>
          </div>
          <Link
            className="workspace-button workspace-button--secondary"
            href="/lesson/review"
          >
            Open review
          </Link>
        </header>

        {lesson === null ? (
          <article className="cockpit-panel empty-state" aria-live="polite">
            <p className="cockpit-panel__label">Lesson status</p>
            <h2>{emptyCopy.title}</h2>
            <p>{emptyCopy.body}</p>
            <div className="cockpit-chip-row">
              <Link className="workspace-button" href="/dashboard">
                Return to Today
              </Link>
              <Link
                className="workspace-button workspace-button--secondary"
                href="/curriculum"
              >
                View learning path
              </Link>
            </div>
          </article>
        ) : (
          <div className="lesson-layout">
            <article className="cockpit-panel reading-card lesson-reading">
              <p className="cockpit-panel__label">Session context</p>
              <h2>{lesson.objective}</h2>

              <section
                className="mental-model-callout"
                aria-labelledby="mental-model-title"
              >
                <p className="cockpit-panel__label" id="mental-model-title">
                  Mental model
                </p>
                <p>{lesson.mentalModel}</p>
              </section>

              <div className="lesson-prose" aria-label="Lesson explanation">
                {lesson.explanation.map((section) => (
                  <section className="lesson-section" key={section.heading}>
                    <h3>{section.heading}</h3>
                    <p>{section.body}</p>
                  </section>
                ))}
              </div>

              <section
                className="lesson-section"
                aria-labelledby="diagram-title"
              >
                <h3 id="diagram-title">Diagram</h3>
                <pre
                  className="lesson-diagram"
                  data-diagram-type={lesson.diagram.type}
                >
                  {lesson.diagram.content}
                </pre>
              </section>

              {lesson.codeExamples.length === 0 ? null : (
                <section
                  className="lesson-section"
                  aria-labelledby="code-title"
                >
                  <h3 id="code-title">Examples and code</h3>
                  {lesson.codeExamples.map((example) => (
                    <figure className="lesson-code-block" key={example.title}>
                      <figcaption>
                        <strong>{example.title}</strong>
                        <span>{example.language}</span>
                      </figcaption>
                      <pre className="lesson-code">
                        <code>{example.code}</code>
                      </pre>
                      <p>{example.explanation}</p>
                    </figure>
                  ))}
                </section>
              )}

              {lesson.commonMistakes.length === 0 ? null : (
                <section
                  className="lesson-section"
                  aria-labelledby="mistakes-title"
                >
                  <h3 id="mistakes-title">Common mistakes</h3>
                  <ul className="cockpit-list lesson-mistakes">
                    {lesson.commonMistakes.map((mistake) => (
                      <li key={mistake}>{mistake}</li>
                    ))}
                  </ul>
                </section>
              )}
            </article>

            <aside
              className="lesson-side"
              aria-label="Lesson actions and sources"
            >
              <article className="cockpit-panel action-card lesson-action-card">
                <p className="cockpit-panel__label">Before you leave</p>
                <h2>{lesson.nextAction}</h2>
                <p>
                  Marking complete advances the persisted session pointer and
                  writes the compact lesson summary once.
                </p>
                <CompleteLessonButton sessionId={lesson.sessionId} />
                <Link className="workspace-link" href="/lesson/review">
                  Review before completing
                </Link>
              </article>

              <article className="cockpit-panel source-card">
                <p className="cockpit-panel__label">Sources</p>
                {lesson.sourceReferences.length === 0 ? (
                  <p>
                    No source references were attached to this persisted lesson
                    payload.
                  </p>
                ) : (
                  <ul className="source-list">
                    {lesson.sourceReferences.map((source) => (
                      <li key={`${source.label}-${source.url}`}>
                        <a href={source.url} rel="noreferrer" target="_blank">
                          <span>{source.label}</span>
                          <small>{source.url}</small>
                          <em>External source</em>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </aside>
          </div>
        )}
      </section>
    </AppShell>
  );
}
