import { describe, expect, it } from 'vitest';

import { buildInitialCurriculumPlan } from '@/agents/curriculum-builder/curriculum-builder-agent';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import type { ProfileRecord } from '@/db/profile.repo';

const now = new Date('2026-01-01T00:00:00.000Z');

const topicBrief: TopicBriefRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  topicSlug: 'agentic-ai-foundations',
  title: 'Agentic AI Foundations',
  goal: 'Build grounded agent workflows.',
  requiredDepth: 'intermediate',
  learnerContext: {},
  prerequisiteMap: ['llm basics'],
  conceptOutline: ['tool use', 'agent state', 'evaluation'],
  masteryIntent: {},
  sourceAgent: 'architect_node',
  createdAt: now,
  updatedAt: now,
};

const knowledgeBase: TopicKnowledgeBaseRecord = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: topicBrief.userId,
  topicBriefId: topicBrief.id,
  topicSlug: topicBrief.topicSlug,
  sourceInventory: [],
  conceptMap: [
    {
      slug: 'tool-use',
      title: 'Tool use',
      orderingHint: 0,
      provenance: [{ sourceUrl: 'lrnr://source', sourceName: 'Source', credibilityTier: 'tier_1' }],
    },
    {
      slug: 'agent-state',
      title: 'Agent state',
      orderingHint: 1,
      provenance: [{ sourceUrl: 'lrnr://source', sourceName: 'Source', credibilityTier: 'tier_1' }],
    },
    {
      slug: 'evaluation',
      title: 'Evaluation',
      orderingHint: 2,
      provenance: [{ sourceUrl: 'lrnr://source', sourceName: 'Source', credibilityTier: 'tier_1' }],
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

const profile: ProfileRecord = {
  id: '44444444-4444-4444-4444-444444444444',
  userId: topicBrief.userId,
  displayName: null,
  currentGoal: topicBrief.goal,
  currentTopicId: null,
  currentTopicSlug: topicBrief.topicSlug,
  curriculumPosition: {},
  learnerPreferences: {},
  stableMasterySummary: {},
  activeMisconceptions: [],
  nextEvaluationDueAt: null,
  lastActiveAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('initial curriculum builder', () => {
  it('creates ordered sessions and sets the first ready pointer', () => {
    const plan = buildInitialCurriculumPlan({
      topicBrief,
      knowledgeBase,
      profile,
    });

    expect(plan.roadmap.milestones).toEqual([
      'Tool use',
      'Agent state',
      'Evaluation',
    ]);
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions[0]?.status).toBe('ready');
    expect(plan.sessions[1]?.status).toBe('planned');
    expect(plan.currentSessionId).toBe(plan.sessions[0]?.id);
    expect(plan.sessions[0]?.prerequisites).toEqual([]);
    expect(plan.sessions[0]?.mentalModel).toContain('Build grounded agent workflows');
    expect(plan.sessions[0]?.explanationPlan.length).toBeGreaterThan(0);
    expect(plan.sessions[0]?.examplesPlan.length).toBeGreaterThan(0);
    expect(plan.sessions[0]?.reviewQuestions.length).toBeGreaterThan(0);
    expect(plan.sessions[2]?.evaluationDue).toBe(true);
  });
});
