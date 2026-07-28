'use client';

import { useEffect, useRef, useState, type JSX } from 'react';

import { usePathname } from 'next/navigation';

/**
 * Top-of-page navigation progress bar.
 *
 * The App Router waits for the destination's server work before it swaps the
 * page, which reads as a "frozen" click. This bar gives the missing feedback:
 * it starts the instant an internal link (or a programmatic navigation that
 * dispatches `lrnr:nav-start`) is clicked, trickles toward the end while the
 * route resolves, and completes when the pathname actually changes.
 *
 * It sits at the document root — outside the .lrnr-modernist token scope — so
 * it carries its own colour with a sensible fallback.
 */
export const NAV_START_EVENT = 'lrnr:nav-start';

export function NavigationProgress(): JSX.Element {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPath = useRef(pathname);

  function clearTimers(): void {
    if (trickleRef.current !== null) clearInterval(trickleRef.current);
    if (failsafeRef.current !== null) clearTimeout(failsafeRef.current);
    if (hideRef.current !== null) clearTimeout(hideRef.current);
    trickleRef.current = null;
    failsafeRef.current = null;
    hideRef.current = null;
  }

  function start(): void {
    // Already running for the current navigation — don't restart the trickle.
    if (trickleRef.current !== null) return;

    clearTimers();
    setActive(true);
    setWidth(8);

    trickleRef.current = setInterval(() => {
      setWidth((current) => {
        if (current >= 90) return current;
        // Diminishing steps so it eases toward — but never reaches — the end.
        const step = current < 40 ? 9 : current < 70 ? 4 : 1.5;
        return Math.min(current + step, 90);
      });
    }, 220);

    // Safety net: if a navigation is cancelled or hangs, finish anyway.
    failsafeRef.current = setTimeout(() => {
      complete();
    }, 12000);
  }

  function complete(): void {
    if (trickleRef.current !== null) clearInterval(trickleRef.current);
    if (failsafeRef.current !== null) clearTimeout(failsafeRef.current);
    trickleRef.current = null;
    failsafeRef.current = null;
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 280);
  }

  // Complete when the route actually changes.
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      complete();
    }
  }, [pathname]);

  // Start on internal link clicks and on programmatic navigations.
  useEffect(() => {
    function onDocumentClick(event: MouseEvent): void {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest('a');
      if (anchor === null || anchor === undefined) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (href === null || href.startsWith('#')) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      // Same page — no navigation to indicate.
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }

      start();
    }

    function onNavStart(): void {
      start();
    }

    document.addEventListener('click', onDocumentClick, { capture: true });
    window.addEventListener(NAV_START_EVENT, onNavStart);

    return () => {
      document.removeEventListener('click', onDocumentClick, { capture: true });
      window.removeEventListener(NAV_START_EVENT, onNavStart);
      clearTimers();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="nav-progress"
      data-active={active ? 'true' : 'false'}
      style={{ width: `${width}%` }}
    />
  );
}
