import type { JSX } from 'react';

import { redirect } from 'next/navigation';

import { unlockRequestSchema } from '@/schemas/auth.schema';
import {
  clearSessionCookies,
  getSessionAccessState,
  SessionAccessError,
  unlockOwnerSession,
} from '@/server/session';

type RouteSearchParams = Record<string, string | string[] | undefined>;

type UnlockPageProps = {
  searchParams?: Promise<RouteSearchParams>;
};

function readMessage(code: string | undefined): string | null {
  switch (code) {
    case 'missing-secret':
      return 'Enter the LRNR private access secret to unlock the workspace.';
    case 'invalid-secret':
      return 'That private access secret did not match this LRNR deployment.';
    case 'owner-only':
      return 'Only the configured owner account can unlock LRNR.';
    default:
      return null;
  }
}

async function unlockAction(formData: FormData): Promise<void> {
  'use server';

  const parsedInput = unlockRequestSchema.safeParse({
    accessSecret: formData.get('accessSecret'),
  });

  if (!parsedInput.success) {
    redirect('/unlock?error=missing-secret');
  }

  try {
    await unlockOwnerSession(parsedInput.data.accessSecret);
    redirect('/dashboard');
  } catch (error) {
    if (error instanceof SessionAccessError) {
      if (error.code === 'FORBIDDEN') {
        redirect('/unlock?error=owner-only');
      }

      if (error.code === 'LOCKED') {
        redirect('/unlock?error=invalid-secret');
      }

      redirect('/login');
    }

    throw error;
  }
}

async function logoutAction(): Promise<void> {
  'use server';

  await clearSessionCookies();
  redirect('/login?error=signed-out');
}

export default async function UnlockPage({
  searchParams,
}: UnlockPageProps): Promise<JSX.Element> {
  const state = await getSessionAccessState();
  const resolvedSearchParams: RouteSearchParams = searchParams
    ? await searchParams
    : {};
  const errorValue = resolvedSearchParams.error;
  const message = readMessage(
    Array.isArray(errorValue) ? errorValue[0] : errorValue,
  );

  if (!state.isAuthenticated) {
    redirect('/login');
  }

  if (!state.isOwner) {
    redirect('/login?error=owner-only');
  }

  if (state.isUnlocked) {
    redirect('/dashboard');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card--compact">
        <p className="auth-eyebrow">LRNR Unlock</p>
        <h1>Use the private LRNR secret to open the workspace.</h1>
        <p className="auth-copy">
          Gate two protects the learning cockpit even if the wrong provider
          session reaches the login screen.
        </p>
        <div className="auth-meta">
          <span>Signed in as {state.email ?? state.userId}</span>
        </div>
        {message ? <p className="auth-alert">{message}</p> : null}
        <form action={unlockAction} className="auth-form">
          <label className="auth-field">
            <span>Private LRNR access secret</span>
            <input
              autoComplete="current-password"
              className="auth-input"
              name="accessSecret"
              placeholder="Enter your private LRNR secret"
              type="password"
            />
          </label>
          <button className="auth-button" type="submit">
            Unlock LRNR
          </button>
        </form>
        <form action={logoutAction}>
          <button className="auth-link-button" type="submit">
            Sign out and switch identity
          </button>
        </form>
        <a className="auth-link" href="/api/me">
          Inspect current auth summary
        </a>
      </section>
    </main>
  );
}
