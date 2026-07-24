import { cache, type JSX } from 'react';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell/AppShell';
import { SettingsView } from '@/components/settings/SettingsView';
import { getMetadataUserId, toMetaText } from '@/server/page-metadata';
import { settingsService } from '@/services/settings.service';

const loadSettings = cache(async (userId: string) =>
  settingsService.getSettings({ userId }),
);

export async function generateMetadata(): Promise<Metadata> {
  const userId = await getMetadataUserId();

  if (userId === null) {
    return { title: 'Settings' };
  }

  try {
    const settings = await loadSettings(userId);

    return {
      title: 'Settings',
      description: toMetaText(
        `${settings.dailyMinutes} minutes a day · daily nudge ${settings.dailyNudgeEnabled ? 'on' : 'off'}.`,
        160,
      ),
    };
  } catch {
    return { title: 'Settings' };
  }
}
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';


export default async function SettingsPage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  assertUnlockedOwnerSession(state);

  const settings = await loadSettings(state.userId);

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
