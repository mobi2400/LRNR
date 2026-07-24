import type { JSX } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Unlock',
  description: 'Enter the private access secret to open this workspace.',
};

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
  const hasMessage = message !== null;

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
      <section
        className="auth-card auth-card--compact"
        aria-labelledby="unlock-title"
      >
        <p className="auth-eyebrow">Gate 2 of 2</p>
        <h1 id="unlock-title">Unlock the private learning cockpit.</h1>
        <p className="auth-copy">
          This second gate protects LRNR even after the owner identity is
          confirmed. The secret is verified server-side and never displayed.
        </p>
        <p className="auth-meta">Signed in as {state.email ?? state.userId}</p>
        {hasMessage ? (
          <p className="auth-alert" id="unlock-feedback" role="alert">
            {message}
          </p>
        ) : null}
        <form
          action={unlockAction}
          aria-describedby={
            hasMessage ? 'unlock-feedback unlock-help' : 'unlock-help'
          }
          className="auth-form"
        >
          <label className="auth-field" htmlFor="accessSecret">
            <span>Private LRNR access secret</span>
            <small id="unlock-help">
              Use the deployment secret. It is never logged or shown back to
              you.
            </small>
          </label>
          <input
            autoComplete="current-password"
            className="auth-input"
            id="accessSecret"
            name="accessSecret"
            placeholder="Enter your private LRNR secret"
            type="password"
          />
          <button className="auth-button" type="submit">
            Unlock LRNR
          </button>
        </form>
        <form action={logoutAction}>
          <button className="auth-link-button" type="submit">
            Sign out and switch identity
          </button>
        </form>
      </section>
    </main>
  );
}
