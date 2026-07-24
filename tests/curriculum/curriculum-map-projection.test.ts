import { describe, expect, it } from 'vitest';

import { curriculumMapSessionProjectionSchema } from '@/services/curriculum.service';
import { curriculumSessionSchema } from '@/schemas/curriculum.schema';

/**
 * getCurriculumMapReadModel projects each session down to exactly these four
 * fields in SQL. The curriculum page previously validated that projection
 * against the full session schema, which always threw on the omitted fields
 * (dayNumber, phase, masteryObjective, connectionToPrior, tomorrowPreview) and
 * broke the page for every user.
 */
const projectedSession = {
  id: '2dc7c214-64ff-46de-9869-986f9bd7f3b5',
  title: 'Day 2: core workflow',
  status: 'ready',
  phase: 'core',
  conceptsToCover: ['core-workflow'],
};

describe('curriculum map session projection', () => {
  it('accepts the exact shape the read model projects', () => {
    const parsed = curriculumMapSessionProjectionSchema.parse(projectedSession);

    expect(parsed.id).toBe(projectedSession.id);
    expect(parsed.title).toBe(projectedSession.title);
    expect(parsed.status).toBe('ready');
    expect(parsed.conceptsToCover).toEqual(['core-workflow']);
  });

  it('documents why the full session schema cannot validate the projection', () => {
    // Regression guard: if someone swaps the projection schema back to the full
    // session schema, this proves the curriculum page would break again.
    expect(() => curriculumSessionSchema.parse(projectedSession)).toThrow();
  });

  it('still rejects a genuinely malformed projection', () => {
    expect(() =>
      curriculumMapSessionProjectionSchema.parse({
        ...projectedSession,
        status: 'not-a-real-status',
      }),
    ).toThrow();

    expect(() =>
      curriculumMapSessionProjectionSchema.parse({
        ...projectedSession,
        conceptsToCover: [],
      }),
    ).toThrow();
  });
});
