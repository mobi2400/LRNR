import {
  buildTopicKnowledgeDocument,
  discoverCartographerSources,
} from '@/agents/cartographer/cartographer-agent';
import { buildInitialCurriculumPlan } from '@/agents/curriculum-builder/curriculum-builder-agent';
import { generateGroundedLessonPayload } from '@/agents/teaching/teaching-agent';
import { curriculumRepository } from '@/db/curriculum.repo';
import { jobsRepository } from '@/db/jobs.repo';
import { knowledgeRepository } from '@/db/knowledge.repo';
import { profileRepository } from '@/db/profile.repo';
import type { DbActor } from '@/db/repository-helpers';
import { ragRepository } from '@/db/rag.repo';
import { topicBriefsRepository } from '@/db/topic-briefs.repo';
import { fetchSources } from '@/lib/scraper';
import { curriculumSessionSchema } from '@/schemas/curriculum.schema';
import { lessonPayloadSchema } from '@/schemas/lesson.schema';
import {
  phase1PreparationResultSchema,
  type Phase1PreparationResult,
} from '@/schemas/phase1-preparation.schema';
import { deliveryService } from '@/services/delivery.service';
import { assertServerOnly } from '@/utils/server-only';
import {
  executePostLessonSideEffects,
  planPostLessonSideEffects,
} from '@/workflows/phase1/post-lesson-side-effects';

assertServerOnly('src/services/phase1-preparation.service.ts');

const PREPARATION_JOB_TYPE = 'curriculum_build';

type PreparationDependencies = {
  profileRepository: Pick<
    typeof profileRepository,
    'getCurrentProfile' | 'updateCurrentTopicMetadata'
  >;
  topicBriefsRepository: Pick<typeof topicBriefsRepository, 'getByTopicSlug'>;
  knowledgeRepository: Pick<
    typeof knowledgeRepository,
    'getByTopicSlug' | 'upsertTopicKnowledgeBase'
  >;
  curriculumRepository: Pick<
    typeof curriculumRepository,
    'getActiveCurriculum' | 'createCurriculum' | 'saveGeneratedLesson'
  >;
  jobsRepository: Pick<
    typeof jobsRepository,
    'createJobRun' | 'updateStatus' | 'recordError'
  >;
  ragRepository: Pick<typeof ragRepository, 'writeMemory'>;
  queueLessonReadyAlert: typeof deliveryService.queueLessonReadyAlert;
  fetchSources: typeof fetchSources;
  generateLesson: typeof generateGroundedLessonPayload;
};

const defaultDependencies: PreparationDependencies = {
  profileRepository,
  topicBriefsRepository,
  knowledgeRepository,
  curriculumRepository,
  jobsRepository,
  ragRepository,
  queueLessonReadyAlert: deliveryService.queueLessonReadyAlert,
  fetchSources,
  generateLesson: generateGroundedLessonPayload,
};

function getPersistedLesson(curriculum: {
  currentSessionId: string | null;
  layer2Sessions: unknown[];
}) {
  if (curriculum.currentSessionId === null) {
    return null;
  }

  const session = curriculum.layer2Sessions
    .map((item) => curriculumSessionSchema.parse(item))
    .find((item) => item.id === curriculum.currentSessionId);

  if (session?.lesson === undefined) {
    return null;
  }

  return {
    session,
    lesson: lessonPayloadSchema.parse(session.lesson),
  };
}

/**
 * Completes the persisted Phase 1 spine after Architect onboarding. Knowledge
 * and curriculum are owner/topic scoped, and a persisted lesson short-circuits
 * retries before any duplicate generation or delivery work can occur.
 */
export function createPhase1PreparationService(
  dependencies: PreparationDependencies = defaultDependencies,
) {
  return {
    async prepareFirstLesson(
      actor: DbActor,
      options: { forceRegenerate?: boolean; refreshKnowledge?: boolean } = {},
    ): Promise<Phase1PreparationResult> {
      const profile =
        await dependencies.profileRepository.getCurrentProfile(actor);

      if (profile === null || profile.currentTopicSlug === null) {
        throw new Error(
          'Complete Architect onboarding before preparing a lesson.',
        );
      }

      const topicSlug = profile.currentTopicSlug;
      const topicBrief =
        await dependencies.topicBriefsRepository.getByTopicSlug(
          actor,
          topicSlug,
        );

      if (topicBrief === null) {
        throw new Error(`Topic brief is missing for ${topicSlug}.`);
      }

      const existingCurriculum =
        await dependencies.curriculumRepository.getActiveCurriculum(
          actor,
          topicSlug,
        );
      const existingLesson =
        existingCurriculum === null
          ? null
          : getPersistedLesson(existingCurriculum);

      if (existingLesson !== null && options.forceRegenerate !== true) {
        return phase1PreparationResultSchema.parse({
          status: 'already_prepared',
          topicSlug,
          sessionId: existingLesson.session.id,
          lessonReady: true,
          repairableFailures: [],
        });
      }

      const job = await dependencies.jobsRepository.createJobRun(actor, {
        jobType: PREPARATION_JOB_TYPE,
        status: 'running',
        input: {
          topicSlug,
          topicBriefId: topicBrief.id,
          route: 'new_goal',
        },
        idempotencyKey: `phase1-initial:${actor.userId}:${topicSlug}`,
        startedAt: new Date(),
      });

      try {
        let knowledgeBase =
          await dependencies.knowledgeRepository.getByTopicSlug(
            actor,
            topicSlug,
          );

        if (knowledgeBase === null || options.refreshKnowledge === true) {
          const sourceResult = await dependencies.fetchSources(
            discoverCartographerSources(topicBrief),
          );
          const document = await buildTopicKnowledgeDocument(
            topicBrief,
            sourceResult.fetched,
            sourceResult.failed,
          );

          knowledgeBase =
            await dependencies.knowledgeRepository.upsertTopicKnowledgeBase(
              actor,
              {
                topicBriefId: topicBrief.id,
                topicSlug,
                ...document,
              },
            );
        }

        const curriculumPlan = await buildInitialCurriculumPlan({
          topicBrief,
          knowledgeBase,
          profile,
        });
        const curriculum =
          existingCurriculum ??
          (await dependencies.curriculumRepository.createCurriculum(actor, {
            topicBriefId: topicBrief.id,
            topicSlug,
            status: 'active',
            layer1Roadmap: curriculumPlan.roadmap,
            layer2Sessions: curriculumPlan.sessions,
            layer3LiveQueue: [],
            currentSessionId: curriculumPlan.currentSessionId,
            currentSessionIndex: curriculumPlan.currentSessionIndex,
            revision: 1,
          }));

        await dependencies.profileRepository.updateCurrentTopicMetadata(actor, {
          currentTopicSlug: topicSlug,
          curriculumPosition: {
            currentSessionId: curriculum.currentSessionId,
            currentSessionIndex: curriculum.currentSessionIndex,
          },
          nextEvaluationDueAt: curriculumPlan.nextEvaluationDueAt,
          lastActiveAt: new Date(),
        });

        const currentSession = curriculum.layer2Sessions
          .map((item) => curriculumSessionSchema.parse(item))
          .find((item) => item.id === curriculum.currentSessionId);

        if (currentSession === undefined) {
          throw new Error('Curriculum current-session pointer is invalid.');
        }

        const lesson = await dependencies.generateLesson({
          topicSlug,
          session: currentSession,
          knowledgeBase,
          profile,
        });
        const persistedCurriculum =
          await dependencies.curriculumRepository.saveGeneratedLesson(
            actor,
            topicSlug,
            {
              sessionId: currentSession.id,
              lesson,
              expectedRevision: curriculum.revision,
            },
          );
        const sideEffectPlan = planPostLessonSideEffects({
          userId: actor.userId,
          topicSlug,
          sessionId: currentSession.id,
          lessonStatus: 'ready',
          lessonRevision: persistedCurriculum.revision,
          lesson,
        });
        const sideEffects = await executePostLessonSideEffects({
          actor,
          plan: sideEffectPlan,
          dependencies: {
            queueLessonReadyAlert: dependencies.queueLessonReadyAlert,
            writeLessonReadySummary: (nextActor, input) =>
              dependencies.ragRepository.writeMemory(nextActor, {
                topicSlug: input.topicSlug,
                eventType: 'session_summary',
                content: input.content,
                sourceAgent: 'teaching_node',
                confidence: 0.9,
                isResolved: false,
                metadata: { sessionId: input.sessionId, status: 'ready' },
                idempotencyKey: input.idempotencyKey,
              }),
          },
        });
        const result = phase1PreparationResultSchema.parse({
          status: 'prepared',
          topicSlug,
          sessionId: currentSession.id,
          lessonReady: true,
          repairableFailures: sideEffects.repairableFailures,
        });

        await dependencies.jobsRepository.updateStatus(actor, job.id, {
          status: 'succeeded',
          output: result,
          finishedAt: new Date(),
        });

        return result;
      } catch (error) {
        await dependencies.jobsRepository.recordError(actor, job.id, {
          code: 'PHASE1_PREPARATION_FAILED',
          message:
            error instanceof Error
              ? error.message
              : 'Phase 1 preparation failed unexpectedly.',
        });
        throw error;
      }
    },
  };
}

export const phase1PreparationService = createPhase1PreparationService();
