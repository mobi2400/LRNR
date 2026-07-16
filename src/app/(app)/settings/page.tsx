import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';

export default async function SettingsPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  return (
    <AppShell
      activeRoute="settings"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <section
        className="cockpit-page settings-page"
        aria-labelledby="settings-title"
      >
        <header className="cockpit-page-header">
          <div>
            <p className="cockpit-kicker">Settings</p>
            <h1 id="settings-title">Private workspace settings.</h1>
            <p>
              This page shows the owner identity, notification readiness, voice
              availability, and privacy boundaries currently supported by the
              Phase 1 frontend.
            </p>
          </div>
        </header>

        <div className="settings-grid">
          <article className="cockpit-panel settings-card">
            <p className="cockpit-panel__label">Owner identity</p>
            <h2>{state.email ?? state.userId}</h2>
            <p>
              LRNR is running in <strong>{state.accessMode}</strong> mode with a
              separate private unlock gate.
            </p>
          </article>

          <article className="cockpit-panel settings-card">
            <p className="cockpit-panel__label">Private session</p>
            <h2>Workspace access is active.</h2>
            <p>
              The exact unlock expiry is intentionally kept subordinate to the
              learning UI. Server-side guards still protect every app route and
              API request.
            </p>
          </article>

          <article className="cockpit-panel settings-card">
            <p className="cockpit-panel__label">Notifications and Telegram</p>
            <h2>Configured through backend delivery.</h2>
            <p>
              Lesson-ready alerts, reminders, and failure notices are owned by
              backend delivery and outbox logic. Editable preferences will
              appear here only after the settings API is implemented.
            </p>
          </article>

          <article className="cockpit-panel settings-card">
            <p className="cockpit-panel__label">Voice availability</p>
            <h2>Upcoming, not a working control yet.</h2>
            <p>
              ElevenLabs and voice-answer UX require typed audio and transcript
              APIs. LRNR will not show working voice toggles until those
              contracts exist.
            </p>
          </article>

          <article className="cockpit-panel settings-card settings-card--wide">
            <p className="cockpit-panel__label">Privacy boundary</p>
            <h2>Frontend displays. Backend decides.</h2>
            <p>
              The browser never receives service-role database access, provider
              keys, Telegram secrets, embedding keys, or raw private RAG
              context.
            </p>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
