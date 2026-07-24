import { describe, expect, it, vi } from 'vitest';

import {
  applyOnboardingAnswer,
  buildOnboardingRagSeedPlan,
  createInitialOnboardingState,
  type ArchitectGenerator,
} from '@/agents/architect/architect-agent';

describe('architect onboarding agent', () => {
  it('runs a deterministic discovery interview under the test environment', async () => {
    let state = await createInitialOnboardingState({
      goal: 'I want to learn agentic AI well enough to build tools',
      preferredDepth: 'intermediate',
    });

    // The interview is now conversational: one question exists at a time.
    expect(state.questions).toHaveLength(1);
    expect(state.currentQuestion).toContain('What outcome');

    state = (
      await applyOnboardingAnswer(state, 'I want to ship a study copilot for myself soon.')
    ).state;
    expect(state.currentQuestion).toContain('experience');

    state = (
      await applyOnboardingAnswer(state, 'I have built small scripts and watched a few courses.')
    ).state;
    expect(state.currentQuestion).toContain('plain LLM call');
  });

  it('completes onboarding and produces compact rag seed entries', async () => {
    let state = await createInitialOnboardingState({
      goal: 'I want to learn agentic AI well enough to build tools',
      background: 'I have built small scripts before.',
      preferredDepth: 'intermediate',
    });

    state = (await applyOnboardingAnswer(state, 'I want to ship a study copilot for myself soon.')).state;
    state = (await applyOnboardingAnswer(state, 'I have built small scripts and watched a few courses.')).state;
    state = (
      await applyOnboardingAnswer(
        state,
        'A plain LLM call gives one response, while RAG adds retrieval. I am still fuzzy on agent state.',
      )
    ).state;
    const result = await applyOnboardingAnswer(
      state,
      'I tried a prototype already, got stuck, and can give 1 hour daily.',
    );

    expect(result.completed).toBe(true);
    expect(result.state.topicBlueprint?.topicSlug).toBeTruthy();
    expect(result.state.detectedWeakAreas.length).toBeGreaterThan(0);

    const ragPlan = buildOnboardingRagSeedPlan(result.state);

    expect(ragPlan.length).toBeGreaterThan(3);
    expect(ragPlan.some((entry) => entry.eventType === 'gap_detected')).toBe(true);
  });

  it('drives an adaptive interview and blueprint through the injected model', async () => {
    const generate = vi
      .fn()
      // Opening question.
      .mockResolvedValueOnce({ question: 'What will you build first?', kind: 'motivation' })
      // Turn 1: keep probing.
      .mockResolvedValueOnce({
        inferredBackground: [],
        strengths: ['Ships small projects'],
        weakAreas: [],
        misconceptions: [],
        tags: ['project-experience'],
        complete: false,
        nextQuestion: { question: 'How do agents keep state between steps?', kind: 'probe' },
        blueprint: null,
        motivation: 'Ship a study copilot',
        priorAttempts: null,
        dailyConstraint: null,
      })
      // Turn 2: complete with a real blueprint.
      .mockResolvedValueOnce({
        inferredBackground: [],
        strengths: [],
        weakAreas: ['Fuzzy on agent state'],
        misconceptions: [],
        tags: [],
        complete: true,
        nextQuestion: null,
        blueprint: {
          title: 'Agentic AI Foundations',
          requiredDepth: 'intermediate',
          prerequisiteMap: ['llm basics'],
          conceptOutline: ['tool use', 'agent state'],
        },
        motivation: null,
        priorAttempts: 'Tried a prototype',
        dailyConstraint: '1 hour daily',
      });

    const state = await createInitialOnboardingState(
      { goal: 'learn agentic ai', preferredDepth: 'intermediate' },
      generate as unknown as ArchitectGenerator,
    );
    expect(state.currentQuestion).toBe('What will you build first?');

    let progress = await applyOnboardingAnswer(
      state,
      'A study copilot for myself.',
      generate as unknown as ArchitectGenerator,
    );
    expect(progress.completed).toBe(false);
    expect(progress.state.currentQuestion).toBe('How do agents keep state between steps?');
    expect(progress.state.detectedStrengths).toContain('Ships small projects');

    progress = await applyOnboardingAnswer(
      progress.state,
      'They carry state forward between steps, I think.',
      generate as unknown as ArchitectGenerator,
    );
    expect(progress.completed).toBe(true);
    expect(progress.state.topicBlueprint?.conceptOutline).toContain('agent state');
    expect(progress.completionSummary?.dailyConstraint).toBe('1 hour daily');
    // Slug comes from the model's clean title, not the raw goal sentence.
    expect(progress.state.topicBlueprint?.topicSlug).toBe(
      'agentic-ai-foundations',
    );
  });

  it('requests a blueprint explicitly when the turn completes without one', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ question: 'Where are you starting from?', kind: 'motivation' })
      // Completes, but supplies no blueprint - previously this silently fell
      // back to the generic deterministic template and lost the interview.
      .mockResolvedValueOnce({
        inferredBackground: [],
        strengths: [],
        weakAreas: ['Lifetimes in structs'],
        misconceptions: [],
        tags: [],
        complete: true,
        nextQuestion: null,
        blueprint: null,
        motivation: null,
        priorAttempts: null,
        dailyConstraint: null,
      })
      // The dedicated blueprint pass then grounds it in the conversation.
      .mockResolvedValueOnce({
        title: 'Rust Ownership and Borrowing',
        requiredDepth: 'intermediate',
        prerequisiteMap: ['rust syntax basics'],
        conceptOutline: ['ownership', 'borrowing', 'lifetimes'],
        recommendedSources: ['https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html'],
      });

    const state = await createInitialOnboardingState(
      { goal: 'I want to learn rust ownership', preferredDepth: 'intermediate' },
      generate as unknown as ArchitectGenerator,
    );
    const progress = await applyOnboardingAnswer(
      state,
      'I keep fighting the borrow checker.',
      generate as unknown as ArchitectGenerator,
    );

    expect(progress.completed).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(progress.state.topicBlueprint?.title).toBe('Rust Ownership and Borrowing');
    expect(progress.state.topicBlueprint?.topicSlug).toBe('rust-ownership-and-borrowing');
    expect(progress.state.topicBlueprint?.conceptOutline).toContain('lifetimes');
    // Architect-proposed sources reach the Cartographer for real research.
    expect(progress.completionSummary?.recommendedSources).toContain(
      'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
    );
  });

  it('falls back to the deterministic blueprint when the blueprint pass fails', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ question: 'Where are you starting from?', kind: 'motivation' })
      .mockResolvedValueOnce({
        inferredBackground: [], strengths: [], weakAreas: [], misconceptions: [], tags: [],
        complete: true, nextQuestion: null, blueprint: null,
        motivation: null, priorAttempts: null, dailyConstraint: null,
      })
      .mockRejectedValueOnce(new Error('model unavailable'));

    const state = await createInitialOnboardingState(
      { goal: 'I want to learn agentic ai', preferredDepth: 'intermediate' },
      generate as unknown as ArchitectGenerator,
    );
    const progress = await applyOnboardingAnswer(
      state,
      'Some answer.',
      generate as unknown as ArchitectGenerator,
    );

    expect(progress.completed).toBe(true);
    expect(progress.state.topicBlueprint).not.toBeNull();
    expect(progress.completionSummary?.recommendedSources).toEqual([]);
  });
});
