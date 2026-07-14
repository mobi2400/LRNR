import { describe, expect, it } from 'vitest';

import { runPhase1Eval } from '../../src/evals/phase1-eval';

describe('Phase 1 eval harness', () => {
  it('passes when all private core flow evidence is present', () => {
    const result = runPhase1Eval({
      onboardingQuestionCount: 3,
      sourceCount: 2,
      conceptCount: 5,
      curriculumSessionCount: 4,
      lessonHasGrounding: true,
      deliveryOutboxHasUniqueKey: true,
    });

    expect(result.passed).toBe(true);
  });

  it('fails when delivery duplicate protection evidence is missing', () => {
    const result = runPhase1Eval({
      onboardingQuestionCount: 3,
      sourceCount: 2,
      conceptCount: 5,
      curriculumSessionCount: 4,
      lessonHasGrounding: true,
      deliveryOutboxHasUniqueKey: false,
    });

    expect(result.passed).toBe(false);
    expect(
      result.checks.find((check) => check.name === 'duplicate_delivery_guard')
        ?.passed,
    ).toBe(false);
  });
});
