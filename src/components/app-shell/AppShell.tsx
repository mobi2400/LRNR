import type { JSX, ReactNode } from 'react';

import Link from 'next/link';

export type AppShellRoute =
  | 'dashboard'
  | 'lesson-current'
  | 'lesson-review'
  | 'curriculum'
  | 'settings';

type AppShellProps = {
  activeRoute: AppShellRoute;
  identity: string;
  unlockExpiresAt: string | null;
  children: ReactNode;
};

const navigationItems: Array<{
  href: string;
  label: string;
  route: AppShellRoute;
}> = [
  { href: '/dashboard', label: 'Dashboard', route: 'dashboard' },
  { href: '/lesson/current', label: 'Current Lesson', route: 'lesson-current' },
  { href: '/lesson/review', label: 'Lesson Review', route: 'lesson-review' },
  { href: '/curriculum', label: 'Curriculum', route: 'curriculum' },
  { href: '/settings', label: 'Settings', route: 'settings' },
];

/**
 * The app shell keeps protected learning pages visually consistent while the
 * richer Phase 1 backend routes are still being implemented.
 */
export function AppShell({
  activeRoute,
  identity,
  unlockExpiresAt,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div className="cockpit-shell">
      <aside className="cockpit-sidebar">
        <div className="cockpit-brand">
          <p className="cockpit-kicker">LRNR</p>
          <h1>Private learning cockpit</h1>
          <p>
            One protected workspace for deliberate study, review, and progress
            tracking.
          </p>
        </div>
        <nav className="cockpit-nav" aria-label="Primary">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                item.route === activeRoute
                  ? 'cockpit-nav__item cockpit-nav__item--active'
                  : 'cockpit-nav__item'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="cockpit-sidebar__meta">
          <span>Owner</span>
          <strong>{identity}</strong>
          <span>Unlock window</span>
          <strong>{unlockExpiresAt ?? 'Active session'}</strong>
        </div>
      </aside>
      <div className="cockpit-main">{children}</div>
    </div>
  );
}
