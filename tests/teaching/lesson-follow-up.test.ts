import '../setup-env';

import { describe, expect, it, vi } from 'vitest';

import {
  generateGroundedFollowUp,
  type FollowUpDependencies,
} from '@/services/lesson.service';
import type { DbActor } from '@/db/repository-helpers';
import type { LessonPayload } from '@/schemas/lesson.schema';

const actor: DbActor = {
  userId: '22222222-2222-2222-2222-222222222222',
  requestId: 'req-1',
};

// generateGroundedFollowUp only reads these fields, so a focused partial is
// sufficient and keeps the test readable.
const lesson = {
  objective: 'Explain why agents need state.',
  mentalModel: 'State is the memory carried between steps.',
  topicSlug: 'agentic-ai-foundations',
  sourceReferences: [
    { label: 'Lesson source', url: 'https://lesson.example/a', kind: 'external' },
  ],
} as unknown as LessonPayload;

describe('grounded lesson follow-up', () => {
  it('binds the rag_search tool and unions cited + lesson sources', async () => {
    const runAgent = vi.fn().mockResolvedValue({
      answer: 'Because state carries context between steps.',
      groundedIn: ['https://retrieved.example/evidence'],
    });
    const createSearchExecutor = vi.fn().mockReturnValue(async () => ({
      evidence: [],
    }));
    const dependencies: FollowUpDependencies = {
      runAgent: runAgent as unknown as FollowUpDependencies['runAgent'],
      createSearchExecutor,
    };

    const result = await generateGroundedFollowUp(
      actor,
      lesson,
      'Why do agents need state?',
      dependencies,
    );

    expect(runAgent).toHaveBeenCalledTimes(1);
    const callArg = runAgent.mock.calls[0]?.[0] as {
      tools: Array<{ name: string }>;
    };
    expect(callArg.tools[0]?.name).toBe('rag_search');
    // The search executor is bound to the lesson's topic scope.
    expect(createSearchExecutor).toHaveBeenCalledWith(
      actor,
      'agentic-ai-foundations',
    );
    // Model-cited evidence plus the validated lesson source both survive.
    expect(result.groundedIn).toEqual(
      expect.arrayContaining([
        'https://retrieved.example/evidence',
        'https://lesson.example/a',
      ]),
    );
    expect(result.answer).toContain('state carries context');
  });
});
