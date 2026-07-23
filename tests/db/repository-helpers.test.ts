import { describe, expect, it } from 'vitest';

import {
  assertDbActor,
  curriculumSessionDocumentSchema,
  matchesMetadataFilters,
} from '../../src/db/repository-helpers';

describe('repository helpers', () => {
  it('normalizes non-production local actors to a stable UUID user id', () => {
    expect(
      assertDbActor({
        userId: 'owner@example.com',
      }),
    ).toMatchObject({
      userId: '00000000-0000-4000-8000-000000000001',
    });
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

