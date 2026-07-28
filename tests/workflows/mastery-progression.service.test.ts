import { describe, expect, it, vi } from 'vitest';

import { createMasteryProgressionService } from '@/services/mastery-progression.service';
import { curriculumSessionSchema } from '@/schemas/curriculum.schema';
import type { InterviewVerdict } from '@/schemas/evaluation.schema';

const actor = { userId: '11111111-1111-1111-1111-111111111111', requestId: 'test' };

function roadmap(depth = 'intermediate') {
  return {
    topicSlug: 'apache-kafka',
    title: 'Apache Kafka',
    goal: 'Run Kafka reliably',
    milestones: ['Topics'],
    requiredDepth: depth,
    generatedBy: 'curriculum_builder_initial_node',
    grounding: 'model',
  };
}

function session(day: number) {
  return curriculumSessionSchema.parse({
    id: `session-${day}`,
    dayNumber: day,
    title: `Day ${day}`,
    status: 'completed',
    phase: 'core',
    conceptsToCover: ['concept'],
    masteryObjective: 'Objective.',
    connectionToPrior: null,
    tomorrowPreview: null,
  });
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    userId: actor.userId,
    currentTopicSlug: 'apache-kafka',
    stableMasterySummary: {},
    ...overrides,
  } as never;
}

function curriculum(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    userId: actor.userId,
    topicSlug: 'apache-kafka',
    layer1Roadmap: roadmap(),
    layer2Sessions: [session(1), session(2)],
    currentSessionId: 'session-2',
    currentSessionIndex: 1,
    revision: 3,
    ...overrides,
  } as never;
}

const passingVerdict: InterviewVerdict = {
  headline: 'Strong.',
  gaps: [],
  masteryGrid: { canSolve: true, canExplain: true, canDecide: false },
  partialCoverage: null,
};

const failingVerdict: InterviewVerdict = {
  headline: 'Gaps remain.',
  gaps: [
    {
      claim: 'Offset commit strategy misunderstood',
      evidence: 'evidence',
      sourceUri: 'https://kafka.apache.org/documentation/',
      masteryLevel: 'can_explain',
    },
  ],
  masteryGrid: { canSolve: false, canExplain: true, canDecide: false },
  partialCoverage: null,
};

function buildDeps(over: {
  profile?: unknown;
  curriculum?: unknown;
}) {
  const upsertProfile = vi.fn().mockResolvedValue(profile());
  const appendSessionsAndSetPointer = vi.fn().mockResolvedValue(curriculum());

  return {
    upsertProfile,
    appendSessionsAndSetPointer,
    deps: {
      profileRepository: {
        getCurrentProfile: vi.fn().mockResolvedValue(over.profile ?? profile()),
        upsertProfile,
      },
      curriculumRepository: {
        getActiveCurriculum: vi
          .fn()
          .mockResolvedValue(over.curriculum ?? curriculum()),
        appendSessionsAndSetPointer,
      },
    },
  };
}

describe('mastery progression service', () => {
  it('marks the goal mastered and clears the evaluation gate when the bar is met', async () => {
    const { deps, upsertProfile, appendSessionsAndSetPointer } = buildDeps({});
    const service = createMasteryProgressionService(deps as never);

    const result = await service.applyEvaluationVerdict(actor, {
      topicSlug: 'apache-kafka',
      verdict: passingVerdict,
    });

    expect(result).toEqual({ status: 'mastered' });
    expect(appendSessionsAndSetPointer).not.toHaveBeenCalled();
    const written = upsertProfile.mock.calls[0]![1];
    expect(written.stableMasterySummary.progression.goalMastered).toBe(true);
    expect(written.nextEvaluationDueAt).toBeNull();
  });

  it('appends reinforcement sessions and moves the pointer when below the bar', async () => {
    const { deps, appendSessionsAndSetPointer } = buildDeps({});
    const service = createMasteryProgressionService(deps as never);

    const result = await service.applyEvaluationVerdict(actor, {
      topicSlug: 'apache-kafka',
      verdict: failingVerdict,
    });

    expect(result.status).toBe('extended');
    if (result.status === 'extended') {
      expect(result.added).toBe(1);
    }
    expect(appendSessionsAndSetPointer).toHaveBeenCalledTimes(1);
    const append = appendSessionsAndSetPointer.mock.calls[0]![2];
    // New session lands right after the two existing ones, under the loaded revision.
    expect(append.currentSessionIndex).toBe(2);
    expect(append.expectedRevision).toBe(3);
    expect(append.newSessions).toHaveLength(1);
  });

  it('stops (capped) instead of appending when the concept is already at its cap', async () => {
    const cappedProfile = profile({
      stableMasterySummary: {
        progression: {
          goalMastered: false,
          concepts: {
            'offset-commit-strategy-misunderstood': {
              level: 'developing',
              reinforcementRounds: 2,
              lastAssessedAt: null,
            },
          },
        },
      },
    });
    const { deps, appendSessionsAndSetPointer } = buildDeps({ profile: cappedProfile });
    const service = createMasteryProgressionService(deps as never);

    const result = await service.applyEvaluationVerdict(actor, {
      topicSlug: 'apache-kafka',
      verdict: failingVerdict,
    });

    expect(result).toEqual({ status: 'capped' });
    expect(appendSessionsAndSetPointer).not.toHaveBeenCalled();
  });

  it('does not touch a curriculum for a different topic than the learner is on', async () => {
    const { deps, appendSessionsAndSetPointer } = buildDeps({});
    const service = createMasteryProgressionService(deps as never);

    const result = await service.applyEvaluationVerdict(actor, {
      topicSlug: 'some-other-topic',
      verdict: failingVerdict,
    });

    expect(result).toEqual({ status: 'topic_mismatch' });
    expect(appendSessionsAndSetPointer).not.toHaveBeenCalled();
  });
});
