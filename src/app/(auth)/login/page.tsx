import type { JSX } from 'react';

import { redirect } from 'next/navigation';

import { loginRequestSchema } from '@/schemas/auth.schema';
import { isOwnerIdentity } from '@/server/owner';
import { clearSessionCookies, createLocalOwnerSession } from '@/server/session';

type RouteSearchParams = Record<string, string | string[] | undefined>;

type LoginPageProps = {
  searchParams?: Promise<RouteSearchParams>;
};

function readMessage(code: string | undefined): string | null {
  switch (code) {
    case 'missing-identifier':
      return 'Enter your owner email to create a signed local LRNR session.';
    case 'invalid-owner':
      return 'Local owner login could not create a session.';
    case 'owner-only':
      return 'This workspace only accepts the configured owner account.';
    case 'signed-out':
      return 'Local session was cleared. Sign in again when ready.';
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

  // Only the configured owner identity may open a session. The identifier is
  // checked against both OWNER_EMAIL and OWNER_USER_ID so the local JWT can
  // never be minted for anyone else.
  const identifier = parsedInput.data.identifier;

  if (!isOwnerIdentity({ userId: identifier, email: identifier })) {
    redirect('/login?error=owner-only');
  }

  await createLocalOwnerSession();
  redirect('/dashboard');
}

async function resetLocalSessionAction(): Promise<void> {
  'use server';

  await clearSessionCookies();
  redirect('/login?error=signed-out');
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<JSX.Element> {
  const resolvedSearchParams: RouteSearchParams = searchParams
    ? await searchParams
    : {};
  const errorValue = resolvedSearchParams.error;
  const message = readMessage(
    Array.isArray(errorValue) ? errorValue[0] : errorValue,
  );
  const hasMessage = message !== null;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-eyebrow">Local owner login</p>
        <h1 id="login-title">Open the local LRNR workspace.</h1>
        <p className="auth-copy">
          Use this temporary local JWT login while checking the Phase 1 cockpit.
          It creates a signed local session with the configured owner UUID.
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
            <span>Owner email</span>
            <small id="login-help">
              Must match the configured OWNER_EMAIL or OWNER_USER_ID.
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
            Sign in locally
          </button>
        </form>
        <form action={resetLocalSessionAction} className="auth-form">
          <button className="auth-link" type="submit">
            Reset local session cookies
          </button>
        </form>
        <p className="auth-footnote">
          This local JWT flow is disabled in production. The reset button clears
          stale Auth.js/local cookies when the browser keeps redirecting.
        </p>
      </section>
    </main>
  );
}
