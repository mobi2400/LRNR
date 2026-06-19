import type { JSX } from 'react';

import { redirect } from 'next/navigation';

import { getSessionAccessState } from '@/server/session';

export default async function HomePage(): Promise<JSX.Element> {
  const state = await getSessionAccessState();

  if (!state.isAuthenticated) {
    redirect('/login');
  }

  if (!state.isOwner) {
    redirect('/login?error=owner-only');
  }

  if (!state.isUnlocked) {
    redirect('/unlock');
  }

  redirect('/dashboard');
}
