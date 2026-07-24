import '../setup-env';

import { describe, expect, it } from 'vitest';

import { buildLlmCacheKey, createRequestBudget } from '@/lib/llm-budget';

/** Virtual clock so the rolling window can be tested without real waiting. */
function createClock() {
  let current = 0;

  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('llm request budget', () => {
  it('allows requests up to the limit without waiting', async () => {
    const clock = createClock();
    const budget = createRequestBudget({
      requestsPerMinute: 3,
      now: clock.now,
      sleep: clock.sleep,
    });

    await budget.acquire();
    await budget.acquire();
    await budget.acquire();

    expect(clock.now()).toBe(0);
    expect(budget.inFlightWindow()).toBe(3);
  });

  it('delays the request that would exceed the limit', async () => {
    const clock = createClock();
    const budget = createRequestBudget({
      requestsPerMinute: 2,
      now: clock.now,
      sleep: clock.sleep,
    });

    await budget.acquire();
    await budget.acquire();
    expect(clock.now()).toBe(0);

    // The third must wait for the oldest to leave the 60s window.
    await budget.acquire();
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
  });

  it('frees capacity once the window rolls forward', async () => {
    const clock = createClock();
    const budget = createRequestBudget({
      requestsPerMinute: 2,
      now: clock.now,
      sleep: clock.sleep,
    });

    await budget.acquire();
    await budget.acquire();
    clock.advance(61_000);

    expect(budget.inFlightWindow()).toBe(0);

    await budget.acquire();
    // No additional sleeping was needed.
    expect(clock.now()).toBe(61_000);
  });

  it('serializes concurrent acquisitions so they cannot burst past the limit', async () => {
    const clock = createClock();
    const budget = createRequestBudget({
      requestsPerMinute: 2,
      now: clock.now,
      sleep: clock.sleep,
    });

    await Promise.all([
      budget.acquire(),
      budget.acquire(),
      budget.acquire(),
      budget.acquire(),
    ]);

    // The first two ran immediately; the remaining two had to wait for the
    // window to roll, so no more than two were ever spent within one minute.
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
    expect(budget.inFlightWindow()).toBe(2);
  });
});

describe('llm cache key', () => {
  it('is stable for identical requests and differs on any input change', () => {
    const base = {
      model: 'gemini-flash-latest',
      system: 'system',
      prompt: 'prompt',
      temperature: 0.3,
      maxTokens: 2048,
    };

    expect(buildLlmCacheKey(base)).toBe(buildLlmCacheKey({ ...base }));
    expect(buildLlmCacheKey(base)).not.toBe(
      buildLlmCacheKey({ ...base, prompt: 'different' }),
    );
    expect(buildLlmCacheKey(base)).not.toBe(
      buildLlmCacheKey({ ...base, temperature: 0.4 }),
    );
    expect(buildLlmCacheKey(base)).toMatch(/^lrnr:v1:llm:[a-f0-9]{64}$/);
  });
});
