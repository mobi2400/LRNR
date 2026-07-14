import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ValidationAppError } from '../../src/server/errors';
import {
  parseJsonBody,
  parseWithSchema,
} from '../../src/server/validation';

describe('validation helpers', () => {
  it('returns parsed data when the payload matches the schema', () => {
    const result = parseWithSchema(
      z.object({
        topic: z.string(),
      }),
      {
        topic: 'redis',
      },
    );

    expect(result).toEqual({
      topic: 'redis',
    });
  });

  it('throws a typed validation error with flattened details', () => {
    expect(() =>
      parseWithSchema(
        z.object({
          topic: z.string().min(3),
        }),
        {
          topic: 'go',
        },
        'Topic payload is invalid.',
      ),
    ).toThrow(ValidationAppError);
  });

  it('parses request JSON bodies through the shared helper', async () => {
    const request = new Request('https://lrnr.test/api/unlock', {
      method: 'POST',
      body: JSON.stringify({
        accessSecret: 'open sesame',
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    await expect(
      parseJsonBody(
        request,
        z.object({
          accessSecret: z.string().min(1),
        }),
      ),
    ).resolves.toEqual({
      accessSecret: 'open sesame',
    });
  });
});
