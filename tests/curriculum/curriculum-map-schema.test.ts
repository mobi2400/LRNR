import { describe, expect, it } from 'vitest';

import { curriculumMapResponseSchema } from '@/schemas/curriculum.schema';

describe('curriculum map contract', () => {
  it('validates a simple Phase 1 curriculum map payload', () => {
    const parsed = curriculumMapResponseSchema.parse({
      topicSlug: 'agentic-ai-foundations',
      roadmap: {
        topicSlug: 'agentic-ai-foundations',
        title: 'Agentic AI Foundations',
        goal: 'Build grounded agent workflows.',
        milestones: ['Tool use'],
        requiredDepth: 'intermediate',
        generatedBy: 'curriculum_builder_initial_node',
      },
      sessions: [
        {
          sessionId: 'session-1',
          title: 'Day 1: Tool use',
          status: 'ready',
          phase: 'foundation',
          concepts: ['tool-use'],
        },
      ],
      currentSessionId: 'session-1',
    });

    expect(parsed.sessions[0]?.concepts).toEqual(['tool-use']);
    // The Path page groups sessions into phase bands, so the map projection
    // must carry the phase through.
    expect(parsed.sessions[0]?.phase).toBe('foundation');
  });
});
