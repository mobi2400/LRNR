import { describe, expect, it } from 'vitest';

import { onboardingCurrentResponseSchema } from '@/schemas/onboarding.schema';

describe('onboarding schemas', () => {
  it('accepts the current onboarding contract', () => {
    const parsed = onboardingCurrentResponseSchema.parse({
      onboardingId: null,
      status: 'not_started',
      turnsCompleted: 0,
    });

    expect(parsed.status).toBe('not_started');
  });
});
