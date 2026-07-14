import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/server/errors';
import { createRequestContext } from '../../src/server/request-context';
import {
  errorResponse,
  successResponse,
} from '../../src/server/response';

function createRequest(path: string) {
  return new Request(`https://lrnr.test${path}`, {
    method: 'GET',
  });
}

describe('response helpers', () => {
  it('returns a stable success envelope with the request ID header', async () => {
    const context = createRequestContext(createRequest('/api/me'));
    const response = successResponse(context, {
      status: 'ok',
    });

    expect(response.headers.get('x-request-id')).toBe(context.requestId);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requestId: context.requestId,
      data: {
        status: 'ok',
      },
    });
  });

  it('returns a stable error envelope for app errors', async () => {
    const context = createRequestContext(createRequest('/api/unlock'));
    const response = errorResponse(
      context,
      new AppError({
        code: 'FORBIDDEN',
        message: 'Nope.',
        status: 403,
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      requestId: context.requestId,
      error: {
        code: 'FORBIDDEN',
        message: 'Nope.',
      },
    });
  });
});
