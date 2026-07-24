import { createHash } from 'node:crypto';

import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/llm-budget.ts');

const WINDOW_MS = 60_000;

export interface RequestBudget {
  /** Resolves when the caller is allowed to spend one provider request. */
  acquire(): Promise<void>;
  /** Requests currently counted inside the rolling window (for tests/metrics). */
  inFlightWindow(): number;
}

export interface RequestBudgetOptions {
  requestsPerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A rolling-window request budget for the LLM provider.
 *
 * Gemini's free tier allows a small number of generate_content calls per
 * minute, and one LRNR pipeline run makes many. Without pacing, the tail of a
 * run gets 429s and every affected agent silently degrades to templated output.
 * Waiting a few seconds produces a good lesson; failing fast produces a bad one,
 * so this queues rather than rejects.
 *
 * Acquisitions are serialized so concurrent callers cannot all observe spare
 * capacity at the same instant and burst past the limit together.
 */
export function createRequestBudget(
  options: RequestBudgetOptions,
): RequestBudget {
  const limit = Math.max(1, Math.floor(options.requestsPerMinute));
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const history: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  function prune(current: number): void {
    while (history.length > 0 && current - (history[0] as number) >= WINDOW_MS) {
      history.shift();
    }
  }

  async function reserve(): Promise<void> {
    for (;;) {
      const current = now();

      prune(current);

      if (history.length < limit) {
        history.push(current);

        return;
      }

      // Wait until the oldest request leaves the window, plus a small margin so
      // we do not wake up a millisecond early and spin.
      const oldest = history[0] as number;

      await sleep(WINDOW_MS - (current - oldest) + 25);
    }
  }

  return {
    acquire(): Promise<void> {
      const next = queue.then(reserve, reserve);

      queue = next.then(
        () => undefined,
        () => undefined,
      );

      return next;
    },
    inFlightWindow(): number {
      prune(now());

      return history.length;
    },
  };
}

/**
 * Stable cache key for a deterministic provider request. Identical prompts are
 * answered from cache instead of spending quota, which matters most on retries,
 * idempotent replays, and repeated local runs.
 */
export function buildLlmCacheKey(input: {
  model: string;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        input.model,
        input.system,
        input.prompt,
        input.temperature,
        input.maxTokens,
      ]),
      'utf8',
    )
    .digest('hex');

  return `lrnr:v1:llm:${digest}`;
}
