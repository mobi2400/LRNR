import type { JSX } from 'react';
import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { loginRequestSchema } from '@/schemas/auth.schema';
import { isOwnerIdentity } from '@/server/owner';
import { clearSessionCookies, createLocalOwnerSession } from '@/server/session';


export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Unlock your private LRNR workspace.',
};

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
      return 'That identity is not the configured owner of this workspace.';
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
    <div className="lrnr-modernist">
      <main className="login-modernist">
        <section className="lg-poster">
          <div className="lg-brand">
            <span>LRNR</span>
          </div>

          <div>
            <div className="lg-kicker">Your personal AI university</div>
            <h1 className="lg-headline">
              The course that never goes out of date.
            </h1>
            <p className="lg-lede">
              Because it isn&apos;t a course. One private workspace, one owner,
              one living path to mastery.
            </p>
          </div>

          {/* The design shows the owner's streak and mastery counts here.
              Nothing is known before sign-in, so this states what LRNR is
              instead of inventing numbers. */}
          <div className="lg-facts">
            <div>
              <div className="lg-fact-title">Mastery</div>
              <div className="lg-fact-note">Not completion</div>
            </div>
            <div>
              <div className="lg-fact-title">Grounded</div>
              <div className="lg-fact-note">Cited sources</div>
            </div>
            <div>
              <div className="lg-fact-title">Single owner</div>
              <div className="lg-fact-note">Your database</div>
            </div>
          </div>
        </section>

        <section className="lg-panel">
          <div className="lg-panel-inner">
            <p className="m-eyebrow">Private workspace</p>
            <h2 className="lg-title">Welcome back.</h2>
            <p className="lg-sub text-muted">
              This install belongs to one owner. Sign in to pick up where LRNR
              left off — it has already chosen today&apos;s move.
            </p>

            <form action={loginAction}>
              <div className="lg-card">
                <div className="lg-card-head">
                  <span className="lg-avatar" aria-hidden="true">
                    L
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="lg-card-identity">Owner sign-in</div>
                    <div className="lg-card-note text-muted">
                      This device · local session
                    </div>
                  </div>
                  <span className="lg-card-tag">Local</span>
                </div>

                <div className="lg-card-body">
                  <label className="lg-label text-muted" htmlFor="identifier">
                    Owner email
                  </label>
                  <input
                    autoComplete="username"
                    className="lg-input"
                    id="identifier"
                    name="identifier"
                    placeholder="you@example.com"
                    type="text"
                    aria-describedby={
                      hasMessage ? 'login-feedback login-help' : 'login-help'
                    }
                  />
                  {hasMessage ? (
                    <p className="lg-alert" id="login-feedback" role="alert">
                      {message}
                    </p>
                  ) : null}
                  <p className="lg-hint text-muted" id="login-help">
                    Must match the configured OWNER_EMAIL or OWNER_USER_ID.
                  </p>
                  <button
                    className="btn btn-primary btn-block"
                    type="submit"
                    style={{
                      padding: '13px 16px',
                      fontSize: '15px',
                      marginTop: '16px',
                    }}
                  >
                    Unlock →
                  </button>
                </div>
              </div>
            </form>

            <div className="lg-actions">
              <form action={resetLocalSessionAction}>
                <button className="btn btn-ghost" type="submit">
                  Reset local session cookies
                </button>
              </form>
            </div>

            <div className="lg-foot">
              <div className="lg-foot-label text-muted">New here?</div>
              <div className="lg-foot-row">
                <p className="text-muted">
                  Sign in first — LRNR asks for your goal and builds the path
                  from there.
                </p>
              </div>
            </div>

            <p className="lg-privacy text-muted">
              This local sign-in is disabled in production. Your progress, notes
              and path stay in the database you own — LRNR is single-owner by
              design.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
