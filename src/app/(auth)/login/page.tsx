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
  const hasMessage = message !== null;

  if (state.isAuthenticated && state.isOwner && state.isUnlocked) {
    redirect('/dashboard');
  }

  if (state.isAuthenticated && state.isOwner) {
    redirect('/unlock');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-eyebrow">Gate 1 of 2</p>
        <h1 id="login-title">Confirm the owner identity.</h1>
        <p className="auth-copy">
          LRNR is private. First confirm the configured owner account, then use
          the separate private unlock secret to open the learning cockpit.
        </p>
        {hasMessage ? (
          <p className="auth-alert" id="login-feedback" role="alert">
            {message}
          </p>
        ) : null}
        <form
          action={loginAction}
          aria-describedby={
            hasMessage ? 'login-feedback login-help' : 'login-help'
          }
          className="auth-form"
        >
          <label className="auth-field" htmlFor="owner-identifier">
            <span>Owner email or user ID</span>
            <small id="login-help">
              Use the identity configured for this private LRNR deployment.
            </small>
          </label>
          <input
            autoComplete="username"
            className="auth-input"
            id="owner-identifier"
            name="identifier"
            placeholder="owner@example.com"
            type="text"
          />
          <button className="auth-button" type="submit">
            Continue to private unlock
          </button>
        </form>
        <p className="auth-footnote">
          Identity verification alone never exposes lessons, provider keys, or
          private learning context.
        </p>
      </section>
    </main>
  );
}
