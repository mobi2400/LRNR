import '../setup-env';

import { describe, expect, it, vi } from 'vitest';

import type { CurriculumStateRecord } from '@/db/curriculum.repo';
import { curriculumSessionDocumentSchema } from '@/db/repository-helpers';
import type { JobRunRecord } from '@/db/jobs.repo';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import type { ProfileRecord } from '@/db/profile.repo';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import { createPhase1PreparationService } from '@/services/phase1-preparation.service';

const now = new Date('2026-01-01T00:00:00.000Z');
const actor = {
  userId: '22222222-2222-4222-8222-222222222222',
  requestId: 'request-prepare',
};
const topicBrief: TopicBriefRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: actor.userId,
  topicSlug: 'system-design',
  title: 'System Design',
  goal: 'Learn system design deeply.',
  requiredDepth: 'beginner',
  learnerContext: {},
  prerequisiteMap: [],
  conceptOutline: ['scalability', 'caching'],
  masteryIntent: {},
  sourceAgent: 'architect_node',
  createdAt: now,
  updatedAt: now,
};
const profile: ProfileRecord = {
  id: '44444444-4444-4444-4444-444444444444',
  userId: actor.userId,
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
const knowledgeBase: TopicKnowledgeBaseRecord = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: actor.userId,
  topicBriefId: topicBrief.id,
  topicSlug: topicBrief.topicSlug,
  sourceInventory: [
    {
      name: 'System Design brief',
      url: `lrnr://topic-briefs/${topicBrief.id}`,
    },
  ],
  conceptMap: [
    {
      slug: 'scalability',
      title: 'Scalability',
      orderingHint: 0,
      provenance: [
        {
          sourceName: 'System Design brief',
          sourceUrl: `lrnr://topic-briefs/${topicBrief.id}`,
          credibilityTier: 'tier_1',
        },
      ],
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
const job: JobRunRecord = {
  id: '55555555-5555-5555-5555-555555555555',
  userId: actor.userId,
  jobType: 'curriculum_build',
  status: 'running',
  input: {},
  output: null,
  error: null,
  idempotencyKey: `phase1-initial:${actor.userId}:${topicBrief.topicSlug}`,
  startedAt: now,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

function createDependencies() {
  let curriculum: CurriculumStateRecord | null = null;

  return {
    profileRepository: {
      getCurrentProfile: vi.fn().mockResolvedValue(profile),
      updateCurrentTopicMetadata: vi.fn().mockResolvedValue(profile),
    },
    topicBriefsRepository: {
      getByTopicSlug: vi.fn().mockResolvedValue(topicBrief),
    },
    knowledgeRepository: {
      getByTopicSlug: vi.fn().mockResolvedValue(knowledgeBase),
      upsertTopicKnowledgeBase: vi.fn().mockResolvedValue(knowledgeBase),
    },
    curriculumRepository: {
      getActiveCurriculum: vi.fn(async () => curriculum),
      createCurriculum: vi.fn(async (_actor, input) => {
        curriculum = {
          id: '66666666-6666-6666-6666-666666666666',
          userId: actor.userId,
          topicBriefId: topicBrief.id,
          topicSlug: input.topicSlug,
          status: input.status,
          layer1Roadmap: input.layer1Roadmap,
          layer2Sessions: input.layer2Sessions,
          layer3LiveQueue: [],
          currentSessionId: input.currentSessionId ?? null,
          currentSessionIndex: input.currentSessionIndex,
          revision: input.revision,
          lastDeliveredAt: null,
          createdAt: now,
          updatedAt: now,
        };
        return curriculum;
      }),
      saveGeneratedLesson: vi.fn(async (_actor, _topicSlug, input) => {
        if (curriculum === null) {
          throw new Error('test curriculum missing');
        }
        curriculum = {
          ...curriculum,
          revision: curriculum.revision + 1,
          layer2Sessions: curriculum.layer2Sessions.map((item) => {
            const session = curriculumSessionDocumentSchema.parse(item);

            return session.id === input.sessionId
              ? { ...session, status: 'ready', lesson: input.lesson }
              : session;
          }),
        };
        return curriculum;
      }),
    },
    jobsRepository: {
      createJobRun: vi.fn().mockResolvedValue(job),
      updateStatus: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
      recordError: vi.fn().mockResolvedValue({ ...job, status: 'failed' }),
    },
    ragRepository: {
      writeMemory: vi.fn().mockResolvedValue({}),
    },
    queueLessonReadyAlert: vi.fn().mockResolvedValue({}),
    fetchSources: vi.fn(),
  };
}

describe('Phase 1 preparation service', () => {
  it('builds curriculum, persists the first lesson, and records side effects', async () => {
    const dependencies = createDependencies();
    const result =
      await createPhase1PreparationService(dependencies).prepareFirstLesson(
        actor,
      );

    expect(result.status).toBe('prepared');
    expect(result.lessonReady).toBe(true);
    expect(
      dependencies.curriculumRepository.createCurriculum,
    ).toHaveBeenCalledTimes(1);
    expect(
      dependencies.curriculumRepository.saveGeneratedLesson,
    ).toHaveBeenCalledTimes(1);
    expect(dependencies.queueLessonReadyAlert).toHaveBeenCalledTimes(1);
    expect(dependencies.ragRepository.writeMemory).toHaveBeenCalledTimes(1);
    expect(dependencies.jobsRepository.updateStatus).toHaveBeenCalledWith(
      actor,
      job.id,
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('returns the persisted lesson without regenerating on retry', async () => {
    const dependencies = createDependencies();
    const service = createPhase1PreparationService(dependencies);

    await service.prepareFirstLesson(actor);
    const retried = await service.prepareFirstLesson(actor);

    expect(retried.status).toBe('already_prepared');
    expect(
      dependencies.curriculumRepository.createCurriculum,
    ).toHaveBeenCalledTimes(1);
    expect(
      dependencies.curriculumRepository.saveGeneratedLesson,
    ).toHaveBeenCalledTimes(1);
    expect(dependencies.queueLessonReadyAlert).toHaveBeenCalledTimes(1);
  });
});
