import { describe, expect, it } from 'vitest';

import {
  createCompactSessionSummary,
  createLessonPayload,
  generateGroundedLessonPayload,
} from '@/agents/teaching/teaching-agent';
import type { CurriculumSession } from '@/schemas/curriculum.schema';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';

const now = new Date('2026-01-01T00:00:00.000Z');

const session: CurriculumSession = {
  id: 'session-1',
  dayNumber: 1,
  title: 'Day 1: Tool use',
  status: 'ready',
  phase: 'foundation',
  conceptsToCover: ['tool-use'],
  prerequisites: [],
  masteryObjective: 'Explain why tools need typed boundaries.',
  mentalModel:
    'Tool use is a typed boundary between reasoning and side effects.',
  explanationPlan: ['Explain tool calls as typed side-effect boundaries.'],
  examplesPlan: ['Show one small TypeScript tool contract.'],
  reviewQuestions: ['Why should tools validate inputs and outputs?'],
  sourceRefs: ['lrnr://source'],
  connectionToPrior: null,
  tomorrowPreview: 'Next session introduces agent state.',
  evaluationDue: false,
};

const knowledgeBase: TopicKnowledgeBaseRecord = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: '22222222-2222-2222-2222-222222222222',
  topicBriefId: '11111111-1111-1111-1111-111111111111',
  topicSlug: 'agentic-ai-foundations',
  sourceInventory: [
    {
      name: 'Topic brief',
      url: 'lrnr://topic-briefs/11111111-1111-1111-1111-111111111111',
      credibilityTier: 'tier_1',
    },
  ],
  conceptMap: [
    {
      slug: 'tool-use',
      title: 'Tool use',
      orderingHint: 0,
      provenance: [],
    },
  ],
  claims: [],
  limitations: [],
  codePatterns: [],
  versionNotes: [],
  interviewPatterns: [],
  metadata: {},
  createdAt: now,
  updatedAt: now,
};

describe('teaching agent', () => {
  it('creates a structured frontend lesson payload', () => {
    const lesson = createLessonPayload({
      topicSlug: 'agentic-ai-foundations',
      session,
      knowledgeBase,
    });

    expect(lesson.generatedBy).toBe('teaching_node');
    expect(lesson.reviewQuestions.length).toBeGreaterThan(0);
    expect(lesson.sourceReferences[0]?.url).toContain('lrnr://topic-briefs');
  });

  it('uses the persisted session plan and session source refs when building lessons', () => {
    const lesson = createLessonPayload({
      topicSlug: 'agentic-ai-foundations',
      session,
      knowledgeBase: {
        ...knowledgeBase,
        sourceInventory: [],
      },
    });

    expect(lesson.mentalModel).toBe(session.mentalModel);
    expect(lesson.explanation[0]?.body).toBe(session.explanationPlan[0]);
    expect(lesson.codeExamples[0]?.explanation).toBe(session.examplesPlan[0]);
    expect(lesson.reviewQuestions[0]?.question).toBe(
      session.reviewQuestions[0],
    );
    expect(lesson.sourceReferences[0]).toEqual({
      label: 'Session source 1',
      url: 'lrnr://source',
      kind: 'internal',
    });
  });
  it('generates substantive content and constrains citations to validated sources', async () => {
    const lesson = await generateGroundedLessonPayload(
      {
        topicSlug: 'agentic-ai-foundations',
        session,
        knowledgeBase,
        profile: {
          id: '44444444-4444-4444-4444-444444444444',
          userId: '22222222-2222-2222-2222-222222222222',
          displayName: null,
          currentGoal: 'Learn agentic AI',
          currentTopicId: null,
          currentTopicSlug: 'agentic-ai-foundations',
          curriculumPosition: {},
          learnerPreferences: {},
          stableMasterySummary: {},
          activeMisconceptions: [],
          nextEvaluationDueAt: null,
          lastActiveAt: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      async () => ({
        title: 'Tool boundaries that keep agents safe',
        objective:
          'Explain where agent reasoning ends and tool authority begins.',
        mentalModel:
          'A tool call is a controlled doorway from reasoning into side effects.',
        explanation: [
          {
            heading: 'Why the boundary exists',
            body: 'Models propose actions, while typed tools decide which actions are permitted.',
          },
          {
            heading: 'How validation works',
            body: 'Input and output schemas turn an uncertain proposal into a checked operation.',
          },
          {
            heading: 'The tradeoff',
            body: 'Stricter contracts reduce flexibility but make failures observable and recoverable.',
          },
        ],
        diagram: {
          type: 'mermaid',
          content:
            'flowchart LR\n  A[Reasoning] --> B[Validation]\n  B --> C[Side effect]',
        },
        codeExamples: [],
        commonMistakes: [
          'Letting the model call providers directly.',
          'Validating inputs but trusting outputs.',
        ],
        reviewQuestions: [
          {
            id: 'review-1',
            question: 'Why is a schema an authority boundary?',
            expectedPoints: ['It limits actions'],
            hint: 'Think permissions.',
          },
          {
            id: 'review-2',
            question: 'What should happen after invalid output?',
            expectedPoints: ['Fail safely'],
            hint: 'Think retries.',
          },
        ],
        sourceReferences: [
          {
            label: 'Invented',
            url: 'https://invented.example',
            kind: 'external',
          },
          {
            label: 'Topic brief',
            url: 'lrnr://topic-briefs/11111111-1111-1111-1111-111111111111',
            kind: 'internal',
          },
        ],
        nextAction: 'Apply the boundary to one real tool call.',
      }),
    );

    expect(lesson.explanation).toHaveLength(3);
    expect(lesson.sourceReferences).toEqual([
      {
        label: 'Topic brief',
        url: 'lrnr://topic-briefs/11111111-1111-1111-1111-111111111111',
        kind: 'internal',
      },
    ]);
  });
  it('creates a compact RAG summary instead of raw lesson text', () => {
    const lesson = createLessonPayload({
      topicSlug: 'agentic-ai-foundations',
      session,
      knowledgeBase,
    });
    const summary = createCompactSessionSummary({
      lesson,
      status: 'completed',
    });

    expect(summary).toContain('Session session-1 completed.');
    expect(summary).toContain('Review questions:');
    expect(summary).not.toContain(lesson.explanation[0]?.body ?? '');
  });
});
