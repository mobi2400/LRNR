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
  { href: '/dashboard', label: 'Today', route: 'dashboard' },
  { href: '/lesson/current', label: 'Lesson', route: 'lesson-current' },
  { href: '/lesson/review', label: 'Review', route: 'lesson-review' },
  { href: '/curriculum', label: 'Path', route: 'curriculum' },
  { href: '/settings', label: 'Settings', route: 'settings' },
];

/**
 * Shared protected shell for LRNR's learner-facing cockpit surfaces.
 * It owns navigation and landmarks only; page components own learning data.
 *
 * The rail follows the modernist redesign and is identical on every page, so
 * this component also carries the .lrnr-modernist token scope that page-level
 * stylesheets nest inside.
 */
export function AppShell({
  activeRoute,
  identity,
  unlockExpiresAt,
  children,
}: AppShellProps): JSX.Element {
  return (
    <div className="lrnr-modernist">
      <div className="lrnr-shell">
        <a className="skip-link" href="#main-content">
          Skip to learning content
        </a>
        <aside className="lrnr-rail" aria-label="LRNR workspace">
          <div>
            <div className="lrnr-brand" aria-label="LRNR learning cockpit">
              <span>LRNR</span>
            </div>
            <p className="lrnr-tagline text-muted">
              Your personal AI university. Learn to mastery, not to 100%.
            </p>
          </div>
          <nav className="lrnr-railnav" aria-label="Primary">
            {navigationItems.map((item, index) => {
              const isActive = item.route === activeRoute;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="lrnr-railnav-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="lrnr-owner" aria-label="Private workspace status">
            <div className="lrnr-owner-label text-muted">Owner</div>
            <div className="lrnr-owner-identity" title={identity}>
              {identity}
            </div>
            <div className="lrnr-owner-status">Private workspace active</div>
            {unlockExpiresAt === null ? null : (
              <span className="sr-only">Unlock expires at {unlockExpiresAt}</span>
            )}
          </div>
        </aside>
        <main className="lrnr-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
