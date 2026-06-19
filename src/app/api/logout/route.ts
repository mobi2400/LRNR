import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { clearSessionCookies, getSessionAccessState } from '@/server/session';

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const state = await getSessionAccessState();

  if (!state.isAuthenticated) {
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in to continue.',
        },
      },
      { status: 401 },
    );
  }

  await clearSessionCookies();

  return NextResponse.json({
    ok: true,
    requestId,
    data: {
      loggedOut: true,
    },
  });
}
