import { describe, expect, it } from 'vitest';

import {
  createCompactSessionSummary,
  createLessonPayload,
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
  mentalModel: 'Tool use is a typed boundary between reasoning and side effects.',
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
    expect(lesson.reviewQuestions[0]?.question).toBe(session.reviewQuestions[0]);
    expect(lesson.sourceReferences[0]).toEqual({
      label: 'Session source 1',
      url: 'lrnr://source',
    });
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
