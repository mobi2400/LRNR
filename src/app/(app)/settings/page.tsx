import type { JSX } from 'react';

import { Archivo } from 'next/font/google';

import { AppShell } from '@/components/app-shell/AppShell';
import { SettingsView } from '@/components/settings/SettingsView';
import { settingsService } from '@/services/settings.service';
import {
  assertUnlockedOwnerSession,
  getSessionAccessState,
} from '@/server/session';

import './settings-modernist.css';

/**
 * The modernist settings design is set in Archivo. next/font self-hosts it, so
 * the page carries no external font request at runtime.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

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
      <div className={archivo.variable}>
        <SettingsView
          identity={state.email ?? state.userId}
          accessMode={state.accessMode}
          initialSettings={settings}
        />
      </div>
    </AppShell>
  );
}
