import type { JSX } from 'react';

import Link from 'next/link';

import { AppShell } from '@/components/app-shell/AppShell';
import { CompleteLessonButton } from '@/components/lesson/CompleteLessonButton';
import { LessonDiagram } from '@/components/lesson/LessonDiagram';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';
import { getCurrentLesson } from '@/services/lesson.service';

import './lesson-modernist.css';

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

function formatTopic(topicSlug: string): string {
  return topicSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
      <div className="lesson-modernist">
        <header className="m-header">
          <div>
            <p className="m-eyebrow">Daily lesson</p>
            <p className="m-subtitle text-muted">
              {lesson === null
                ? 'No lesson ready'
                : `${formatTopic(lesson.topicSlug)} · ${lesson.title}`}
            </p>
          </div>
          <Link className="btn btn-secondary" href="/lesson/review">
            Open review →
          </Link>
        </header>

        {lesson === null ? (
          <div className="lesson-empty" aria-live="polite">
            <span className="m-pending">Lesson status</span>
            <h2>{emptyCopy.title}</h2>
            <p>{emptyCopy.body}</p>
            <div className="lesson-empty-actions">
              <Link className="btn btn-primary" href="/dashboard">
                Return to Today →
              </Link>
              <Link className="btn btn-secondary" href="/curriculum">
                View learning path
              </Link>
            </div>
          </div>
        ) : (
          <div className="lesson-grid">
            <article className="lesson-article">
              <h1 className="lesson-headline">{lesson.title}</h1>
              <p className="lesson-objective">{lesson.objective}</p>

              <section className="lesson-mental" aria-labelledby="mental-title">
                <div className="lesson-mental-label" id="mental-title">
                  Mental model
                </div>
                <p>{lesson.mentalModel}</p>
              </section>

              {lesson.explanation.map((section) => (
                <section className="lesson-section" key={section.heading}>
                  <h2>{section.heading}</h2>
                  <p>{section.body}</p>
                </section>
              ))}

              <figure className="lesson-figure">
                <div className="lesson-figure-frame">
                  <LessonDiagram diagram={lesson.diagram} />
                </div>
                <figcaption>
                  Diagram generated with the lesson and grounded in the same
                  sources.
                </figcaption>
              </figure>

              {lesson.codeExamples.length === 0 ? null : (
                <section className="lesson-section" aria-labelledby="code-title">
                  <h2 id="code-title">Examples and code</h2>
                  {lesson.codeExamples.map((example) => (
                    <div key={example.title}>
                      <div className="lesson-code-head">
                        <span>{example.title}</span>
                        <span>{example.language}</span>
                      </div>
                      <pre className="lesson-code">
                        <code>{example.code}</code>
                      </pre>
                      <p className="lesson-code-note">{example.explanation}</p>
                    </div>
                  ))}
                </section>
              )}

              {lesson.commonMistakes.length === 0 ? null : (
                <section
                  className="lesson-mistakes-section"
                  aria-labelledby="mistakes-title"
                >
                  <h2 id="mistakes-title">Common mistakes</h2>
                  <ul className="lesson-mistakes">
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
              <div className="lesson-side-card">
                <div className="lesson-side-label">Before you leave</div>
                <div className="lesson-side-title">{lesson.nextAction}</div>
                <CompleteLessonButton sessionId={lesson.sessionId} />
                <Link
                  className="btn btn-secondary btn-block"
                  href="/lesson/review"
                  style={{ marginTop: '8px' }}
                >
                  Review before completing
                </Link>
              </div>

              <div className="lesson-side-block">
                <div className="lesson-side-label">Sources</div>
                {lesson.sourceReferences.length === 0 ? (
                  <p className="lesson-source-meta text-muted">
                    No source references were attached to this persisted lesson
                    payload.
                  </p>
                ) : (
                  <ul className="lesson-sources">
                    {lesson.sourceReferences.map((source) => {
                      const isInternal =
                        source.kind === 'internal' ||
                        source.url.startsWith('lrnr://');

                      return (
                        <li key={`${source.label}-${source.url}`}>
                          {isInternal ? (
                            <div className="lesson-source-name">
                              {source.label}
                            </div>
                          ) : (
                            <a href={source.url} rel="noreferrer" target="_blank">
                              {source.label}
                            </a>
                          )}
                          <div className="lesson-source-meta text-muted">
                            {isInternal
                              ? 'Internal learning context'
                              : 'External source'}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="lesson-note">
                <p className="text-muted">
                  <strong style={{ color: 'var(--color-text)' }}>
                    Field updates:
                  </strong>{' '}
                  the design shows live change alerts here. Scout and News
                  Intelligence land in Phase 3, so LRNR does not claim a lesson
                  is out of date until it can actually check.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
