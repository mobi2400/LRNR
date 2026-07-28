import type { JSX, ReactNode } from 'react';

import { redirect } from 'next/navigation';

import { NavigationProgress } from '@/components/nav/NavigationProgress';
import { RouteTransition } from '@/components/nav/RouteTransition';
import { getSessionAccessState } from '@/server/session';

type AppLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function AppLayout({ children }: AppLayoutProps): Promise<JSX.Element> {
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

  return (
    <>
      <NavigationProgress />
      <RouteTransition>{children}</RouteTransition>
    </>
  );
}
