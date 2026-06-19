import type { JSX } from 'react';

import { redirect } from 'next/navigation';

import { loginRequestSchema } from '@/schemas/auth.schema';
import { signIn } from '@/server/auth';
import { getSessionAccessState } from '@/server/session';

type RouteSearchParams = Record<string, string | string[] | undefined>;

type LoginPageProps = {
  searchParams?: Promise<RouteSearchParams>;
};

function readMessage(code: string | undefined): string | null {
  switch (code) {
    case 'missing-identifier':
      return 'Enter the owner email or owner user ID configured for LRNR.';
    case 'invalid-owner':
      return 'That identity is not allowed into this private LRNR workspace.';
    case 'owner-only':
      return 'This workspace only accepts the configured owner account.';
    case 'signed-out':
      return 'You have been signed out of LRNR.';
    default:
      return null;
  }
}

async function loginAction(formData: FormData): Promise<void> {
  'use server';

  const parsedInput = loginRequestSchema.safeParse({
    identifier: formData.get('identifier'),
  });

  if (!parsedInput.success) {
    redirect('/login?error=missing-identifier');
  }

  try {
    await signIn('credentials', {
      identifier: parsedInput.data.identifier,
      redirectTo: '/unlock',
    });
  } catch {
    redirect('/login?error=invalid-owner');
  }
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<JSX.Element> {
  const state = await getSessionAccessState();
  const resolvedSearchParams: RouteSearchParams = searchParams
    ? await searchParams
    : {};
  const errorValue = resolvedSearchParams.error;
  const message = readMessage(
    Array.isArray(errorValue) ? errorValue[0] : errorValue,
  );

  if (state.isAuthenticated && state.isOwner && state.isUnlocked) {
    redirect('/dashboard');
  }

  if (state.isAuthenticated && state.isOwner) {
    redirect('/unlock');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-eyebrow">LRNR Private Access</p>
        <h1>Enter the owner identity for this learning cockpit.</h1>
        <p className="auth-copy">
          Gate one confirms the signed-in owner account before LRNR asks for the
          private unlock secret.
        </p>
        {message ? <p className="auth-alert">{message}</p> : null}
        <form action={loginAction} className="auth-form">
          <label className="auth-field">
            <span>Owner email or user ID</span>
            <input
              autoComplete="username"
              className="auth-input"
              name="identifier"
              placeholder="owner@example.com"
              type="text"
            />
          </label>
          <button className="auth-button" type="submit">
            Continue to unlock
          </button>
        </form>
        <p className="auth-footnote">
          Auth.js handles the session, but LRNR stays locked until the second
          private secret is verified.
        </p>
        <a className="auth-link" href="https://authjs.dev">
          Auth.js reference
        </a>
      </section>
    </main>
  );
}
