import { describe, expect, it } from 'vitest';

import {
  assertIdempotencyReplay,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from '../../src/server/idempotency';
import { IdempotencyConflictAppError } from '../../src/server/errors';

describe('idempotency helpers', () => {
  it('reads and normalizes the idempotency key header', () => {
    const headers = new Headers({
      'Idempotency-Key': '  lesson-123  ',
    });

    expect(readIdempotencyKey(headers)).toBe('lesson-123');
  });

  it('creates a stable hash for equivalent request bodies', () => {
    const first = hashIdempotencyRequest('/api/lesson', {
      title: 'Intro',
      metadata: {
        sequence: 1,
        tags: ['a', 'b'],
      },
    });
    const second = hashIdempotencyRequest('/api/lesson', {
      metadata: {
        tags: ['a', 'b'],
        sequence: 1,
      },
      title: 'Intro',
    });

    expect(first).toBe(second);
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
        },
        '/api/lesson',
        'different',
      ),
    ).toThrow(IdempotencyConflictAppError);
  });
});
