'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { NAV_START_EVENT } from '@/components/nav/NavigationProgress';

type PreparationEnvelope =
  | { ok: true; data: { lessonReady: true } }
  | { ok: false; error: { message: string } };

export function PrepareLearningPathButton(): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function prepare(): void {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch('/api/workflows/phase1/prepare', {
            method: 'POST',
            headers: {
              'idempotency-key': crypto.randomUUID(),
            },
          });
          const envelope = (await response.json()) as PreparationEnvelope;

          if (!envelope.ok) {
            throw new Error(envelope.error.message);
          }

          window.dispatchEvent(new Event(NAV_START_EVENT));
          router.push('/lesson/current');
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'LRNR could not prepare the first lesson.',
          );
        }
      })();
    });
  }

  return (
    <div className="cockpit-stack">
      <button
        className="workspace-button"
        disabled={isPending}
        onClick={prepare}
        type="button"
      >
        {isPending
          ? 'Preparing your first lesson...'
          : 'Prepare my first lesson'}
      </button>
      {error === null ? null : (
        <p className="cockpit-feedback cockpit-feedback--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
