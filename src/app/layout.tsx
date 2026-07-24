import type { JSX, ReactNode } from 'react';
import type { Metadata } from 'next';

import { Archivo } from 'next/font/google';

import './globals.css';
import '@/styles/modernist.css';

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
