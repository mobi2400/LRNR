import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { applyLessonToSession } from '../../src/db/curriculum.repo';
import { buildLessonGenerationKey } from '../../src/services/lesson.service';

describe('lesson generation lifecycle idempotency', () => {
  it('marks generated lesson content as ready, not delivered', () => {
    const [session] = applyLessonToSession(
      [{ id: 'session-1', status: 'planned' }],
      { sessionId: 'session-1', lesson: { title: 'Lesson' } },
    );

    expect(session?.status).toBe('ready');
    expect(session?.lesson).toEqual({ title: 'Lesson' });
  });

  it('uses revision-aware lesson generation keys', () => {
    expect(
      buildLessonGenerationKey({
        userId: 'user-1',
        sessionId: 'session-1',
        curriculumRevision: 7,
      }),
    ).toBe('lesson-generate:user-1:session-1:7');
  });

  it('does not mark notification delivery from lesson generation', () => {
    const source = readFileSync('src/services/lesson.service.ts', 'utf8');
    const generationSource = source.slice(
      source.indexOf('export async function generateAndPersistCurrentLesson'),
      source.indexOf('export async function getCurrentLesson'),
    );

    expect(generationSource).not.toContain("status: 'delivered'");
    expect(generationSource).toContain('expectedRevision: curriculum.revision');
  });
});
