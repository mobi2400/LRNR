import type { JSX } from 'react';

/**
 * Temporary Phase 1 foundation route.
 * Provides a minimal app entry while the private shell and workflows are added in later parts.
 */
export default function HomePage(): JSX.Element {
  return (
    <main className="foundation-shell">
      <section className="foundation-card">
        <p className="foundation-eyebrow">LRNR</p>
        <h1>Phase 1 foundation scaffold is in place.</h1>
        <p>
          This route stays intentionally minimal until the private frontend shell
          is built in later parts.
        </p>
      </section>
    </main>
  );
}
