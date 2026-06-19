import type { JSX } from 'react';

import { redirect } from 'next/navigation';

import {
  assertUnlockedOwnerSession,
  clearSessionCookies,
  getSessionAccessState,
} from '@/server/session';

async function logoutAction(): Promise<void> {
  'use server';

  await clearSessionCookies();
  redirect('/login?error=signed-out');
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <main className="workspace-shell">
      <section className="workspace-card">
        <div className="workspace-header">
          <div>
            <p className="auth-eyebrow">LRNR Dashboard</p>
            <h1>Owner access is active and the workspace is unlocked.</h1>
          </div>
          <form action={logoutAction}>
            <button
              className="workspace-button workspace-button--ghost"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <p className="workspace-copy">
          Part 4 intentionally stops at private access control. The richer
          dashboard, lesson surfaces, and workflow data arrive in later Phase 1
          parts after the security boundary is stable.
        </p>
        <dl className="workspace-grid">
          <div>
            <dt>Owner identity</dt>
            <dd>{state.email ?? state.userId}</dd>
          </div>
          <div>
            <dt>Access mode</dt>
            <dd>{state.accessMode}</dd>
          </div>
          <div>
            <dt>Unlock expires</dt>
            <dd>{state.unlockedUntil}</dd>
          </div>
          <div>
            <dt>Protection status</dt>
            <dd>authenticated, owner-verified, and unlocked</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
