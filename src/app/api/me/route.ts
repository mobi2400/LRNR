import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getSessionAccessState } from '@/server/session';

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const state = await getSessionAccessState();

  if (!state.isAuthenticated || state.userId === null || state.email === null) {
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

  return NextResponse.json({
    ok: true,
    requestId,
    data: {
      id: state.userId,
      email: state.email,
      displayName: state.displayName,
      isOwner: state.isOwner,
      isUnlocked: state.isUnlocked,
      accessMode: state.accessMode,
    },
  });
}
