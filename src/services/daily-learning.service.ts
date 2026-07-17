import { generateAndPersistCurrentLesson } from '@/services/lesson.service';
import { curriculumRepository } from '@/db/curriculum.repo';
import { jobsRepository } from '@/db/jobs.repo';
import { profileRepository } from '@/db/profile.repo';
import { ragRepository } from '@/db/rag.repo';
import type { DbActor } from '@/db/repository-helpers';
import { deliveryService } from '@/services/delivery.service';
import { curriculumSessionSchema } from '@/schemas/curriculum.schema';
import {
  dailyLearningResultSchema,
  type DailyLearningResult,
} from '@/schemas/daily-learning.schema';
import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { acquireLock, buildWorkflowLockKey, releaseLock } from '@/server/locks';
import {
  executePostLessonSideEffects,
  planPostLessonSideEffects,
} from '@/workflows/phase1/post-lesson-side-effects';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/daily-learning.service.ts');

const DAILY_LOCK_TTL_MS = 10 * 60 * 1000;

interface DailyLearningDependencies {
  profileRepository: Pick<typeof profileRepository, 'getCurrentProfile'>;
  curriculumRepository: Pick<
    typeof curriculumRepository,
    'getActiveCurriculum'
  >;
  jobsRepository: Pick<
    typeof jobsRepository,
    'createJobRun' | 'updateStatus' | 'recordError'
  >;
  generateCurrentLesson: typeof generateAndPersistCurrentLesson;
  queueLessonReadyAlert: typeof deliveryService.queueLessonReadyAlert;
  writeMemory: typeof ragRepository.writeMemory;
}

const defaultDependencies: DailyLearningDependencies = {
  profileRepository,
  curriculumRepository,
  jobsRepository,
  generateCurrentLesson: generateAndPersistCurrentLesson,
  queueLessonReadyAlert: deliveryService.queueLessonReadyAlert,
  writeMemory: ragRepository.writeMemory.bind(ragRepository),
};

function istDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${read('year')}-${read('month')}-${read('day')}`;
}

function noWork(input: {
  route: 'evaluation_due' | 'waiting_for_onboarding' | 'no_op';
  status: 'waiting' | 'no_op';
  reason: string;
  topicSlug?: string | null;
  sessionId?: string | null;
  lessonReady?: boolean;
}): DailyLearningResult {
  return dailyLearningResultSchema.parse({
    ...input,
    topicSlug: input.topicSlug ?? null,
    sessionId: input.sessionId ?? null,
    lessonReady: input.lessonReady ?? false,
    repairableFailures: [],
  });
}

export function createDailyLearningService(
  dependencies: DailyLearningDependencies = defaultDependencies,
) {
  return {
    async run(actor: DbActor, now = new Date()): Promise<DailyLearningResult> {
      const profile =
        await dependencies.profileRepository.getCurrentProfile(actor);

      if (profile === null || profile.currentTopicSlug === null) {
        return noWork({
          route: 'waiting_for_onboarding',
          status: 'waiting',
          reason: 'onboarding_or_active_topic_required',
        });
      }

      const topicSlug = profile.currentTopicSlug;
      const curriculum =
        await dependencies.curriculumRepository.getActiveCurriculum(
          actor,
          topicSlug,
        );

      if (curriculum === null || curriculum.currentSessionId === null) {
        return noWork({
          route: 'no_op',
          status: 'no_op',
          reason: 'no_pending_session',
          topicSlug,
        });
      }

      const sessions = curriculum.layer2Sessions.map((item) =>
        curriculumSessionSchema.parse(item),
      );
      const currentSession = sessions.find(
        (session) => session.id === curriculum.currentSessionId,
      );

      if (currentSession === undefined) {
        throw new Error('Curriculum current-session pointer is invalid.');
      }

      const completedCount = sessions.filter(
        (session) => session.status === 'completed',
      ).length;
      const evaluationDue =
        completedCount >= 2 &&
        profile.nextEvaluationDueAt !== null &&
        profile.nextEvaluationDueAt.getTime() <= now.getTime();

      if (evaluationDue) {
        return noWork({
          route: 'evaluation_due',
          status: 'waiting',
          reason: 'evaluation_must_complete_before_next_lesson',
          topicSlug,
          sessionId: currentSession.id,
        });
      }

      if (currentSession.lesson !== undefined) {
        return noWork({
          route: 'no_op',
          status: 'no_op',
          reason: 'current_lesson_already_ready',
          topicSlug,
          sessionId: currentSession.id,
          lessonReady: true,
        });
      }

      const job = await dependencies.jobsRepository.createJobRun(actor, {
        jobType: 'daily_learning',
        status: 'running',
        input: {
          route: 'continue_teaching',
          topicSlug,
          sessionId: currentSession.id,
          istDate: istDateKey(now),
        },
        idempotencyKey: `daily-learning:${actor.userId}:${istDateKey(now)}`,
        startedAt: now,
      });

      try {
        const lesson = await dependencies.generateCurrentLesson(actor);
        const persisted =
          await dependencies.curriculumRepository.getActiveCurriculum(
            actor,
            topicSlug,
          );

        if (persisted === null) {
          throw new Error('Curriculum disappeared after lesson persistence.');
        }

        const sideEffects = await executePostLessonSideEffects({
          actor,
          plan: planPostLessonSideEffects({
            userId: actor.userId,
            topicSlug,
            sessionId: currentSession.id,
            lessonStatus: 'ready',
            lessonRevision: persisted.revision,
            lesson,
          }),
          dependencies: {
            queueLessonReadyAlert: dependencies.queueLessonReadyAlert,
            writeLessonReadySummary: (nextActor, input) =>
              dependencies.writeMemory(nextActor, {
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
        const result = dailyLearningResultSchema.parse({
          route: 'continue_teaching',
          status: 'prepared',
          reason: 'current_planned_session_generated',
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
          code: 'DAILY_LEARNING_FAILED',
          message:
            error instanceof Error ? error.message : 'Daily learning failed.',
        });
        throw error;
      }
    },
  };
}

export const dailyLearningService = createDailyLearningService();

export async function runDailyLearningWithLock(
  actor: DbActor,
  options: { store?: KeyValueStore; now?: Date } = {},
): Promise<DailyLearningResult> {
  const store = options.store ?? new RedisKeyValueStore();
  const key = buildWorkflowLockKey(actor.userId, 'daily-learning');
  const lock = await acquireLock(store, key, DAILY_LOCK_TTL_MS);

  if (lock === null) {
    return noWork({
      route: 'no_op',
      status: 'no_op',
      reason: 'daily_learning_already_running',
    });
  }

  try {
    return await dailyLearningService.run(actor, options.now);
  } finally {
    await releaseLock(store, lock);
  }
}
