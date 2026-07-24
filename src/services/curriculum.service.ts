import { curriculumRepository } from '@/db/curriculum.repo';
import { RedisKeyValueStore } from '@/lib/redis';
import { appLogger } from '@/lib/logger';
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
import {
  buildCurriculumMapCacheKey,
  CACHE_TTL_MS,
  getCachedJson,
  setCachedJson,
} from '@/server/cache';

const curriculumMapCacheStore = new RedisKeyValueStore();

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
  const plan = await buildInitialCurriculumPlan({
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

/**
 * The curriculum-map read model deliberately projects each session down to the
 * four fields the map renders, so it must be validated against exactly those
 * fields. Validating the projection against the full session schema always
 * failed on the omitted fields (dayNumber, phase, masteryObjective, ...) and
 * broke the whole page.
 */
export const curriculumMapSessionProjectionSchema = curriculumSessionSchema.pick({
  id: true,
  title: true,
  status: true,
  phase: true,
  conceptsToCover: true,
});

export async function getCurriculumMap(
  actor: DbActor,
): Promise<CurriculumMapResponse> {
  const readModel = await curriculumRepository.getCurriculumMapReadModel(actor);

  if (readModel.topicSlug === null) {
    return curriculumMapResponseSchema.parse({
      topicSlug: null,
      roadmap: null,
      sessions: [],
      currentSessionId: null,
      revision: null,
    });
  }

  if (readModel.revision !== null) {
    const cacheKey = buildCurriculumMapCacheKey(
      actor.userId,
      readModel.topicSlug,
      readModel.revision,
    );

    try {
      const cached = await getCachedJson(
        curriculumMapCacheStore,
        cacheKey,
        curriculumMapResponseSchema,
      );

      if (cached !== null) {
        return cached;
      }
    } catch (error) {
      appLogger.warn('curriculum_map.cache_read_failed', {
        requestId: actor.requestId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    const response = curriculumMapResponseSchema.parse({
      topicSlug: readModel.topicSlug,
      roadmap:
        readModel.layer1Roadmap === null
          ? null
          : layer1RoadmapSchema.parse(readModel.layer1Roadmap),
      sessions: readModel.sessions.map((session) => {
        const parsed = curriculumMapSessionProjectionSchema.parse(session);

        return {
          sessionId: parsed.id,
          title: parsed.title,
          status: parsed.status,
          phase: parsed.phase,
          concepts: parsed.conceptsToCover,
        };
      }),
      currentSessionId: readModel.currentSessionId,
      revision: readModel.revision,
    });

    try {
      await setCachedJson(
        curriculumMapCacheStore,
        cacheKey,
        response,
        CACHE_TTL_MS.curriculumMap,
      );
    } catch (error) {
      appLogger.warn('curriculum_map.cache_write_failed', {
        requestId: actor.requestId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    return response;
  }

  return curriculumMapResponseSchema.parse({
    topicSlug: readModel.topicSlug,
    roadmap: null,
    sessions: [],
    currentSessionId: null,
    revision: null,
  });
}