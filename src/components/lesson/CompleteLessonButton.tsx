'use client';

import { useState, useTransition } from 'react';

type CompleteLessonButtonProps = {
  sessionId: string;
};

type ApiEnvelope<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export function CompleteLessonButton({
  sessionId,
}: CompleteLessonButtonProps): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function completeLesson(): void {
    setMessage(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/lesson/${sessionId}/mark-complete`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            understood: true,
          }),
        });
        const json = (await response.json()) as ApiEnvelope<{
          nextSessionId: string | null;
        }>;

        if (!json.ok) {
          setError(json.error.message);
          return;
        }

        setMessage(
          json.data.nextSessionId === null
            ? 'Lesson completed. This topic has no next planned session yet.'
            : 'Lesson completed. The next session is ready in your path.',
        );
      })();
    });
  }

  return (
    <div className="lesson-complete">
      <button
        className="btn btn-primary btn-block"
        type="button"
        onClick={completeLesson}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Completing lesson…' : 'Mark lesson complete'}
      </button>
      <div aria-live="polite">
        {message === null ? null : (
          <p className="lesson-complete-msg lesson-complete-msg--success">
            {message}
          </p>
        )}
        {error === null ? null : (
          <p className="lesson-complete-msg lesson-complete-msg--error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
