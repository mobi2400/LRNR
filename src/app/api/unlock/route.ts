import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { unlockRequestSchema } from '@/schemas/auth.schema';
import { SessionAccessError, unlockOwnerSession } from '@/server/session';

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const rawBody = await request.json().catch(() => null);
  const parsedBody = unlockRequestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Unlock request is invalid.',
          details: parsedBody.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await unlockOwnerSession(parsedBody.data.accessSecret);

    return NextResponse.json({
      ok: true,
      requestId,
      data: result,
    });
  } catch (error) {
    if (error instanceof SessionAccessError) {
      const status =
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'FORBIDDEN'
            ? 403
            : 423;

      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status },
      );
    }

    throw error;
  }
}
