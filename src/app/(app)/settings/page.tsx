import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { assertUnlockedOwnerSession, getSessionAccessState } from '@/server/session';

export default async function SettingsPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="settings"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section className="cockpit-page">
        <header className="cockpit-hero cockpit-hero--compact">
          <div>
            <p className="cockpit-kicker">Settings</p>
            <h2>Owner profile, notifications, and future voice preferences have a home.</h2>
            <p>
              The settings shell is ready for backend-driven preferences without exposing
              secrets or moving control logic into the browser.
            </p>
          </div>
        </header>
        <div className="cockpit-grid cockpit-grid--settings">
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Identity</p>
            <h3>{state.email ?? state.userId}</h3>
            <p>Owner-only workspace with a separate private unlock gate.</p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Notifications</p>
            <p>Telegram delivery preferences and reminder timing will connect here in later parts.</p>
          </article>
          <article className="cockpit-panel">
            <p className="cockpit-panel__label">Voice UX</p>
            <p>Evaluation playback, spoken answers, and transcript confirmation controls will live here.</p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
