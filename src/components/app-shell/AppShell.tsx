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
  shortLabel: string;
}> = [
  {
    href: '/dashboard',
    label: 'Today',
    route: 'dashboard',
    shortLabel: 'Today',
  },
  {
    href: '/lesson/current',
    label: 'Lesson',
    route: 'lesson-current',
    shortLabel: 'Lesson',
  },
  {
    href: '/lesson/review',
    label: 'Review',
    route: 'lesson-review',
    shortLabel: 'Review',
  },
  {
    href: '/curriculum',
    label: 'Path',
    route: 'curriculum',
    shortLabel: 'Path',
  },
  {
    href: '/settings',
    label: 'Settings',
    route: 'settings',
    shortLabel: 'Settings',
  },
];

/**
 * Shared protected shell for LRNR's learner-facing cockpit surfaces.
 * It owns navigation and landmarks only; page components own learning data.
 */
export function AppShell({
  activeRoute,
  identity,
  unlockExpiresAt,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div className="cockpit-shell">
      <a className="skip-link" href="#main-content">
        Skip to learning content
      </a>
      <aside className="cockpit-sidebar" aria-label="LRNR workspace">
        <div className="cockpit-brand" aria-label="LRNR learning cockpit">
          <p className="cockpit-kicker">LRNR</p>
          <strong>Learning cockpit</strong>
          <p>
            Your private study surface for today, review, and the path ahead.
          </p>
        </div>
        <nav className="cockpit-nav" aria-label="Primary navigation">
          {navigationItems.map((item, index) => {
            const isActive = item.route === activeRoute;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'cockpit-nav__item cockpit-nav__item--active'
                    : 'cockpit-nav__item'
                }
              >
                <span className="cockpit-nav__index" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
        <div
          className="cockpit-sidebar__meta"
          aria-label="Private workspace status"
        >
          <span className="cockpit-sidebar__meta-label">Owner</span>
          <strong className="cockpit-identity" title={identity}>
            {identity}
          </strong>
          <span className="cockpit-private-status">
            Private workspace active
          </span>
          {unlockExpiresAt === null ? null : (
            <span className="sr-only">Unlock expires at {unlockExpiresAt}</span>
          )}
        </div>
      </aside>
      <main className="cockpit-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
