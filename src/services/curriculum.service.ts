import { curriculumRepository } from '@/db/curriculum.repo';
import { knowledgeRepository } from '@/db/knowledge.repo';
import { profileRepository } from '@/db/profile.repo';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import { topicBriefsRepository } from '@/db/topic-briefs.repo';
import { buildInitialCurriculumPlan } from '@/agents/curriculum-builder/curriculum-builder-agent';
import {
  curriculumMapResponseSchema,
  curriculumSessionSchema,
  layer1RoadmapSchema,
  type CurriculumMapResponse,
} from '@/schemas/curriculum.schema';
import type { CurriculumStateRecord } from '@/db/curriculum.repo';

export async function runInitialCurriculumBuilder(
  actor: DbActor,
  topicSlug: string,
): Promise<CurriculumStateRecord> {
  const profile = requireRow(
    await profileRepository.getCurrentProfile(actor),
    'Profile not found for initial curriculum planning.',
  );
  const topicBrief = requireRow(
    await topicBriefsRepository.getByTopicSlug(actor, topicSlug),
    'Topic brief not found for initial curriculum planning.',
    { topicSlug },
  );
  const knowledgeBase = requireRow(
    await knowledgeRepository.getByTopicSlug(actor, topicSlug),
    'Topic knowledge base not found for initial curriculum planning.',
    { topicSlug },
  );
  const plan = buildInitialCurriculumPlan({
    topicBrief,
    knowledgeBase,
    profile,
  });
  const curriculum = await curriculumRepository.createCurriculum(actor, {
    topicBriefId: topicBrief.id,
    topicSlug: topicBrief.topicSlug,
    status: 'active',
    layer1Roadmap: plan.roadmap,
    layer2Sessions: plan.sessions,
    layer3LiveQueue: [],
    currentSessionId: plan.currentSessionId,
    currentSessionIndex: plan.currentSessionIndex,
    revision: 1,
  });

  await profileRepository.updateCurrentTopicMetadata(actor, {
    currentTopicId: topicBrief.id,
    currentTopicSlug: topicBrief.topicSlug,
    curriculumPosition: {
      currentSessionId: plan.currentSessionId,
      currentSessionIndex: plan.currentSessionIndex,
    },
    nextEvaluationDueAt: plan.nextEvaluationDueAt,
    lastActiveAt: new Date(),
  });

  return curriculum;
}

export async function getCurriculumMap(
  actor: DbActor,
): Promise<CurriculumMapResponse> {
  const profile = await profileRepository.getCurrentProfile(actor);

  if (profile?.currentTopicSlug === null || profile?.currentTopicSlug === undefined) {
    return curriculumMapResponseSchema.parse({
      topicSlug: null,
      roadmap: null,
      sessions: [],
      currentSessionId: null,
    });
  }

  const curriculum = await curriculumRepository.getActiveCurriculum(
    actor,
    profile.currentTopicSlug,
  );

  if (curriculum === null) {
    return curriculumMapResponseSchema.parse({
      topicSlug: profile.currentTopicSlug,
      roadmap: null,
      sessions: [],
      currentSessionId: null,
    });
  }

  const roadmap = layer1RoadmapSchema.parse(curriculum.layer1Roadmap);
  const sessions = curriculum.layer2Sessions.map((session) => {
    const parsed = curriculumSessionSchema.parse(session);

    return {
      sessionId: parsed.id,
      title: parsed.title,
      status: parsed.status,
      concepts: parsed.conceptsToCover,
    };
  });

  return curriculumMapResponseSchema.parse({
    topicSlug: curriculum.topicSlug,
    roadmap,
    sessions,
    currentSessionId: curriculum.currentSessionId,
  });
}
