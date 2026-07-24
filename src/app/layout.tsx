import type { JSX, ReactNode } from 'react';
import type { Metadata } from 'next';

import { Archivo } from 'next/font/google';

import './globals.css';

/**
 * All modernist styles are imported here rather than per page.
 *
 * Per-page CSS imports made Next emit a separate stylesheet chunk per route
 * (including URLs containing the `(app)` route-group parentheses). A single
 * layout-level stylesheet keeps one predictable CSS URL for the whole app, so a
 * dev-server restart cannot leave a cached page pointing at a stylesheet chunk
 * that no longer exists. Every file below is class-scoped, so loading them
 * together changes nothing visually.
 */
import '@/styles/modernist.css';
import '@/styles/modernist/today.css';
import '@/styles/modernist/lesson.css';
import '@/styles/modernist/review.css';
import '@/styles/modernist/path.css';
import '@/styles/modernist/settings.css';
import '@/styles/modernist/login.css';
import '@/styles/modernist/onboarding.css';

export const metadata: Metadata = {
  title: 'LRNR',
  description: 'Personal-first learning operating system.',
};

/**
 * The modernist redesign is set in Archivo. next/font self-hosts it, so no
 * external font request is made at runtime. The variable is exposed on <html>
 * so both the protected shell and the auth pages can use it.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
