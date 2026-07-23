import { describe, expect, it, vi } from 'vitest';

import {
  buildTopicKnowledgeDocument,
  discoverCartographerSources,
} from '@/agents/cartographer/cartographer-agent';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import type { FetchedSource, FailedSource } from '@/schemas/knowledge.schema';

const topicBrief: TopicBriefRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  topicSlug: 'agentic-ai-foundations',
  title: 'Agentic AI Foundations',
  goal: 'Build grounded agent workflows.',
  requiredDepth: 'intermediate',
  learnerContext: {
    recommendedSources: ['https://example.com/agent-guide'],
  },
  prerequisiteMap: ['llm basics', 'apis'],
  conceptOutline: ['tool use', 'agent state', 'evaluation'],
  masteryIntent: {},
  sourceAgent: 'architect_node',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('cartographer agent', () => {
  it('discovers the topic brief as a critical provenance source', () => {
    const candidates = discoverCartographerSources(topicBrief);

    expect(candidates[0]?.sourceType).toBe('topic_brief');
    expect(candidates[0]?.isCritical).toBe(true);
    expect(candidates[1]?.url).toBe('https://example.com/agent-guide');
  });

  it('builds a validated topic knowledge document with provenance', async () => {
    const source: FetchedSource = {
      name: 'Agentic AI Foundations topic brief',
      url: `lrnr://topic-briefs/${topicBrief.id}`,
      sourceType: 'topic_brief',
      credibilityTier: 'tier_1',
      isCritical: true,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      content: 'Goal and concept outline for grounded agent workflows.',
      relevantSections: ['Goal and concept outline for grounded agent workflows.'],
    };
    const failed: FailedSource[] = [
      {
        name: 'Weak external source',
        url: 'https://example.com/weak',
        sourceType: 'tutorial',
        credibilityTier: 'tier_3',
        isCritical: false,
        failedAt: '2026-01-01T00:00:00.000Z',
        errorMessage: 'Timeout',
      },
    ];

    const document = await buildTopicKnowledgeDocument(topicBrief, [source], failed);

    expect(document.conceptMap).toHaveLength(3);
    expect(document.conceptMap[0]?.provenance[0]?.sourceUrl).toContain(
      'lrnr://topic-briefs',
    );
    expect(document.metadata.researchQuality).toBe('minimal');
    expect(document.metadata.failedSources).toHaveLength(1);
  });

  it('synthesizes grounded knowledge and constrains citations to fetched sources', async () => {
    const realUrl = 'https://example.com/agent-guide';
    const source: FetchedSource = {
      name: 'Agent guide',
      url: realUrl,
      sourceType: 'tutorial',
      credibilityTier: 'tier_2',
      isCritical: true,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      content:
        'Agents combine an LLM with tools and a control loop. State carries between steps and evaluation guards output quality across the whole workflow.',
      relevantSections: [
        'Agents combine an LLM with tools and a control loop.',
        'State carries between steps and evaluation guards output.',
      ],
    };

    // The synthesizer cites one real URL and one hallucinated URL; only the
    // real one may survive as provenance.
    const synthesize = vi.fn().mockResolvedValue({
      conceptMap: [
        {
          slug: 'control-loop',
          title: 'Agent control loop',
          summary: 'The loop that lets an LLM call tools and act on results.',
          prerequisiteSlugs: ['llm-basics'],
          sourceUrls: [realUrl, 'https://hallucinated.example/fake'],
        },
      ],
      claims: [
        {
          claim: 'Evaluation guards output quality across the workflow.',
          conceptSlug: 'control-loop',
          sourceUrls: ['https://hallucinated.example/only-fake'],
        },
      ],
      limitations: [],
      codePatterns: [],
      interviewPatterns: [],
      versionNotes: [],
    });

    const document = await buildTopicKnowledgeDocument(topicBrief, [source], [], {
      synthesize,
    });

    expect(synthesize).toHaveBeenCalledTimes(1);
    // Hallucinated URL dropped, real URL kept.
    expect(document.conceptMap[0]?.provenance.map((p) => p.sourceUrl)).toEqual([
      realUrl,
    ]);
    // A claim citing only a fake URL falls back to the primary fetched source
    // rather than dropping provenance below the schema minimum.
    expect(document.claims[0]?.provenance[0]?.sourceUrl).toBe(realUrl);
    expect(document.metadata.generatedBy).toBe('cartographer_node');
  });

  it('falls back to the deterministic scaffold when synthesis throws', async () => {
    const source: FetchedSource = {
      name: 'Agent guide',
      url: 'https://example.com/agent-guide',
      sourceType: 'tutorial',
      credibilityTier: 'tier_2',
      isCritical: true,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      content:
        'Agents combine an LLM with tools and a control loop across multiple steps of work. State carries between steps, and evaluation guards output quality across the whole workflow so mistakes are caught early.',
      relevantSections: ['Agents combine an LLM with tools and a control loop.'],
    };
    const synthesize = vi.fn().mockRejectedValue(new Error('model unavailable'));

    const document = await buildTopicKnowledgeDocument(topicBrief, [source], [], {
      synthesize,
    });

    // Deterministic scaffold uses the brief's concept outline (3 concepts).
    expect(document.conceptMap).toHaveLength(3);
    expect(document.metadata.generatedBy).toBe('cartographer_node');
  });
});
