import { describe, expect, it } from 'vitest';

import {
  assertNodeDependenciesSatisfied,
  buildPhase1NodePlan,
  findReadyFanOutNodes,
  validatePhase1NodeOutput,
} from '@/workflows/phase1/node-orchestration';

const topicBlueprint = {
  topicSlug: 'agentic-ai',
  title: 'Agentic AI',
  requiredDepth: 'beginner',
  prerequisiteMap: ['TypeScript'],
  conceptOutline: ['RAG'],
};

const lesson = {
  sessionId: 'session-1',
  topicSlug: 'agentic-ai',
  title: 'Day 1: RAG',
  objective: 'Explain RAG clearly.',
  mentalModel: 'RAG joins retrieval with generation.',
  explanation: [{ heading: 'Core idea', body: 'Retrieve evidence before answering.' }],
  diagram: { type: 'description', content: 'query -> retrieve -> answer' },
  codeExamples: [],
  commonMistakes: ['Treating citations as decoration.'],
  reviewQuestions: [{ id: 'q1', question: 'What does retrieval add?', expectedPoints: ['Evidence'], hint: 'Start with sources.' }],
  sourceReferences: [{ label: 'Topic brief', url: 'lrnr://topic-briefs/1' }],
  nextAction: 'Review the source.',
  generatedBy: 'teaching_node',
};

describe('phase 1 node orchestration', () => {
  it('builds the sequential new-goal plan with post-persist fan-out nodes', () => {
    expect(buildPhase1NodePlan('new_goal').map((entry) => entry.nodeName)).toEqual([
      'route',
      'architect',
      'cartographer',
      'curriculum_builder',
      'teaching',
      'lesson_persist',
      'delivery_side_effects',
      'rag_side_effects',
    ]);
  });

  it('uses a shorter continue-teaching plan without onboarding research nodes', () => {
    expect(buildPhase1NodePlan('continue_teaching').map((entry) => entry.nodeName)).toEqual([
      'route',
      'teaching',
      'lesson_persist',
      'delivery_side_effects',
      'rag_side_effects',
    ]);
  });

  it('blocks a node until its dependency checkpoint succeeded', () => {
    expect(() =>
      assertNodeDependenciesSatisfied({
        nodeName: 'cartographer',
        checkpoints: [{ nodeName: 'architect', status: 'ready' }],
      }),
    ).toThrow(/architect/);

    expect(() =>
      assertNodeDependenciesSatisfied({
        nodeName: 'cartographer',
        checkpoints: [{ nodeName: 'architect', status: 'succeeded' }],
      }),
    ).not.toThrow();
  });

  it('allows delivery and RAG fan-out only after lesson persistence succeeds', () => {
    expect(
      findReadyFanOutNodes([
        { nodeName: 'lesson_persist', status: 'succeeded' },
        { nodeName: 'delivery_side_effects', status: 'ready' },
        { nodeName: 'rag_side_effects', status: 'ready' },
      ]),
    ).toEqual(['delivery_side_effects', 'rag_side_effects']);

    expect(
      findReadyFanOutNodes([
        { nodeName: 'lesson_persist', status: 'running' },
        { nodeName: 'delivery_side_effects', status: 'ready' },
      ]),
    ).toEqual([]);
  });

  it('validates node outputs against their owned contracts', () => {
    expect(
      validatePhase1NodeOutput('architect', {
        topicBlueprint,
        learnerSignals: { strengths: [], weakAreas: ['needs source grounding'], misconceptions: [] },
      }),
    ).toMatchObject({ topicBlueprint });

    expect(validatePhase1NodeOutput('teaching', { lesson })).toMatchObject({ lesson });
    expect(() => validatePhase1NodeOutput('lesson_persist', { sessionId: 'session-1', status: 'delivered', revision: 1 })).toThrow();
  });
});
