import { describe, expect, it } from 'vitest';

import {
  applyOnboardingAnswer,
  buildOnboardingRagSeedPlan,
  createInitialOnboardingState,
} from '@/agents/architect/architect-agent';

describe('architect onboarding agent', () => {
  it('starts with a goal-aware probe question', () => {
    const state = createInitialOnboardingState({
      goal: 'I want to learn agentic AI well enough to build tools',
      preferredDepth: 'intermediate',
    });

    expect(state.questions[2]?.question).toContain('plain LLM call');
    expect(state.currentQuestion).toContain('What outcome');
  });

  it('completes onboarding and produces compact rag seed entries', () => {
    let state = createInitialOnboardingState({
      goal: 'I want to learn agentic AI well enough to build tools',
      background: 'I have built small scripts before.',
      preferredDepth: 'intermediate',
    });

    state = applyOnboardingAnswer(state, 'I want to ship a study copilot for myself soon.').state;
    state = applyOnboardingAnswer(state, 'I have built small scripts and watched a few courses.').state;
    state = applyOnboardingAnswer(
      state,
      'A plain LLM call gives one response, while RAG adds retrieval. I am still fuzzy on agent state.',
    ).state;
    const result = applyOnboardingAnswer(
      state,
      'I tried a prototype already, got stuck, and can give 1 hour daily.',
    );

    expect(result.completed).toBe(true);
    expect(result.state.topicBlueprint?.topicSlug).toBeTruthy();
    expect(result.state.detectedWeakAreas.length).toBeGreaterThan(0);

    const ragPlan = buildOnboardingRagSeedPlan(result.state);

    expect(ragPlan.length).toBeGreaterThan(3);
    expect(ragPlan.some((entry) => entry.eventType === 'gap_detected')).toBe(true);
    expect(ragPlan.every((entry) => entry.content.includes('Question:'))).toBe(false);
  });
});
