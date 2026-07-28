'use client';

import type { JSX, ReactNode } from 'react';

import { usePathname } from 'next/navigation';

/**
 * Plays a short fade/slide-in as each new page arrives.
 *
 * Keying the wrapper on the pathname remounts it on every navigation, which
 * replays the CSS enter animation. The animation deliberately does not use a
 * `forwards` fill mode, so no transform lingers on the element and the sticky
 * rail inside the shell keeps working after the transition settles.
 */
export function RouteTransition({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="route-transition" key={pathname}>
      {children}
    </div>
  );
}
