import type { JSX } from 'react';

import { AppShell } from '@/components/app-shell/AppShell';
import { SettingsView } from '@/components/settings/SettingsView';
import { settingsService } from '@/services/settings.service';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';

import './settings-modernist.css';

export default async function SettingsPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const settings = await settingsService.getSettings({
    userId: state.userId,
  });

  return (
    <AppShell
      activeRoute="settings"
      identity={state.email ?? state.userId}
      unlockExpiresAt={state.unlockedUntil}
    >
      <SettingsView
        identity={state.email ?? state.userId}
        accessMode={state.accessMode}
        initialSettings={settings}
      />
    </AppShell>
  );
}
