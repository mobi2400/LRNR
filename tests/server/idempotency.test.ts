import { describe, expect, it } from 'vitest';

import {
  assertIdempotencyReplay,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from '../../src/server/idempotency';
import {
  IdempotencyConflictAppError,
  IdempotencyInProgressAppError,
} from '../../src/server/errors';

describe('idempotency helpers', () => {
  it('reads and normalizes the idempotency key header', () => {
    const headers = new Headers({
      'Idempotency-Key': '  lesson-123  ',
    });

    expect(readIdempotencyKey(headers)).toBe('lesson-123');
  });

  it('creates a stable hash for equivalent request bodies and owner scope', () => {
    const first = hashIdempotencyRequest(
      '/api/lesson',
      {
        title: 'Intro',
        metadata: {
          sequence: 1,
          tags: ['a', 'b'],
        },
      },
      'owner-1',
    );
    const second = hashIdempotencyRequest(
      '/api/lesson',
      {
        metadata: {
          tags: ['a', 'b'],
          sequence: 1,
        },
        title: 'Intro',
      },
      'owner-1',
    );
    const otherOwner = hashIdempotencyRequest(
      '/api/lesson',
      {
        title: 'Intro',
        metadata: {
          sequence: 1,
          tags: ['a', 'b'],
        },
      },
      'owner-2',
    );

    expect(first).toBe(second);
    expect(first).not.toBe(otherOwner);
  });

  it('rejects a reused key when the payload hash changes', () => {
    expect(() =>
      assertIdempotencyReplay(
        {
          key: 'lesson-123',
          route: '/api/lesson',
          requestHash: 'one',
          response: {
            ok: true,
          },
          statusCode: 200,
          status: 'completed',
        },
        '/api/lesson',
        'different',
      ),
    ).toThrow(IdempotencyConflictAppError);
  });

  it('rejects in-progress records without returning a replay', () => {
    expect(() =>
      assertIdempotencyReplay(
        {
          key: 'lesson-123',
          route: '/api/lesson',
          requestHash: 'same',
          response: null,
          statusCode: null,
          status: 'processing',
        },
        '/api/lesson',
        'same',
      ),
    ).toThrow(IdempotencyInProgressAppError);
  });
});