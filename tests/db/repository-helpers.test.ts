import { describe, expect, it } from 'vitest';

import {
  assertDbActor,
  curriculumSessionDocumentSchema,
  matchesMetadataFilters,
} from '../../src/db/repository-helpers';

describe('repository helpers', () => {
  it('rejects actors without a UUID user id', () => {
    expect(() =>
      assertDbActor({
        userId: 'owner@example.com',
      }),
    ).toThrow('Repository access requires a UUID userId.');
  });

  it('matches nested metadata filters conservatively', () => {
    expect(
      matchesMetadataFilters(
        {
          topic: 'typescript',
          source: {
            kind: 'lesson',
            tags: ['intro', 'phase1'],
          },
        },
        {
          source: {
            kind: 'lesson',
          },
        },
      ),
    ).toBe(true);

    expect(
      matchesMetadataFilters(
        {
          source: {
            kind: 'lesson',
          },
        },
        {
          source: {
            kind: 'brief',
          },
        },
      ),
    ).toBe(false);
  });

  it('accepts session documents with additional lesson fields', () => {
    expect(
      curriculumSessionDocumentSchema.parse({
        id: 'session-01',
        status: 'ready',
        title: 'Intro to LRNR',
      }),
    ).toMatchObject({
      id: 'session-01',
      status: 'ready',
    });
  });
});
