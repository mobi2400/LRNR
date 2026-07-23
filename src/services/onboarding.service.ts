import {
  applyOnboardingAnswer,
  buildOnboardingRagSeedPlan,
  createInitialOnboardingState,
} from '@/agents/architect/architect-agent';
import {
  apiIdempotencyRepository,
  createApiIdempotencyRepository,
} from '@/db/api-idempotency.repo';
import { db, type DbClient } from '@/db/client';
import { createJobsRepository, jobsRepository } from '@/db/jobs.repo';
import { createProfileRepository, profileRepository } from '@/db/profile.repo';
import { createRagRepository } from '@/db/rag.repo';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import {
  createTopicBriefsRepository,
  topicBriefsRepository,
} from '@/db/topic-briefs.repo';
import {
  assertIdempotencyReplay,
  type AnyApiEnvelope,
} from '@/server/idempotency';
import { AppError } from '@/server/errors';
import {
  architectOnboardingStateSchema,
  onboardingCurrentResponseSchema,
  onboardingReplyRequestSchema,
  onboardingReplyResponseSchema,
  startGoalRequestSchema,
  startGoalResponseSchema,
  type OnboardingCurrentResponse,
  type OnboardingReplyRequest,
  type StartGoalRequest,
} from '@/schemas/onboarding.schema';
import type { RagMemoryWriteInput } from '@/db/rag.repo';
import type { UpsertProfileInput } from '@/db/profile.repo';
import type { UpsertTopicBriefInput } from '@/db/topic-briefs.repo';
import { appLogger } from '@/lib/logger';
import { phase1PreparationService } from '@/services/phase1-preparation.service';

const ONBOARDING_JOB_TYPE = 'architect_onboarding';
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;

async function reserveIdempotentRequest<TResponse extends AnyApiEnvelope>(
  actor: DbActor,
  route: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<TResponse | null> {
  const reservation = await apiIdempotencyRepository.reserveProcessing(actor, {
    key: idempotencyKey,
    route,
    requestHash,
    expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
  });

  if (reservation.reserved) {
    return null;
  }

  return assertIdempotencyReplay(
    {
      key: reservation.record.key,
      route: reservation.record.route,
      requestHash: reservation.record.requestHash,
      response: reservation.record.response as TResponse | null,
      statusCode: reservation.record.responseStatusCode,
      status: reservation.record.status,
    },
    route,
    requestHash,
  );
}

async function completeIdempotentRequest(
  actor: DbActor,
  idempotencyKey: string,
  response: AnyApiEnvelope,
  statusCode = 200,
): Promise<void> {
  await apiIdempotencyRepository.completeResponse(actor, {
    key: idempotencyKey,
    response: response as unknown as Record<string, unknown>,
    responseStatusCode: statusCode,
  });
}

function parseStateFromJob(jobOutput: unknown) {
  return architectOnboardingStateSchema.parse(jobOutput);
}
interface OnboardingCompletionPlan {
  profileInput: UpsertProfileInput;
  topicBriefInput: UpsertTopicBriefInput;
  ragEntries: Array<Omit<RagMemoryWriteInput, 'sourceId'>>;
  jobOutput: Record<string, unknown>;
}

type OnboardingProgress = Awaited<ReturnType<typeof applyOnboardingAnswer>>;

export function buildOnboardingCompletionPlan(
  actor: DbActor,
  progress: OnboardingProgress & {
    completed: true;
    completionSummary: NonNullable<OnboardingProgress['completionSummary']>;
  },
): OnboardingCompletionPlan {
  const topicSlug = progress.completionSummary.topicBlueprint.topicSlug;
  const ragPlan = buildOnboardingRagSeedPlan(progress.state);

  return {
    profileInput: {
      currentGoal: progress.state.goal,
      currentTopicSlug: topicSlug,
      learnerPreferences: {
        preferredDepth: progress.state.preferredDepth,
      },
      stableMasterySummary: {
        inferredBackground: progress.state.inferredBackground,
        strengths: progress.state.detectedStrengths,
        weakAreas: progress.state.detectedWeakAreas,
      },
      activeMisconceptions: progress.state.detectedMisconceptions,
      lastActiveAt: new Date(),
    },
    topicBriefInput: {
      topicSlug,
      title: progress.completionSummary.topicBlueprint.title,
      goal: progress.state.goal,
      requiredDepth: progress.completionSummary.topicBlueprint.requiredDepth,
      learnerContext: {
        background: progress.state.background,
        inferredBackground: progress.state.inferredBackground,
        strengths: progress.state.detectedStrengths,
        weakAreas: progress.state.detectedWeakAreas,
        motivation: progress.completionSummary.motivation,
        priorAttempts: progress.completionSummary.priorAttempts,
      },
      prerequisiteMap: progress.completionSummary.topicBlueprint.prerequisiteMap,
      conceptOutline: progress.completionSummary.topicBlueprint.conceptOutline,
      masteryIntent: {
        preferredDepth: progress.state.preferredDepth,
        dailyConstraint: progress.completionSummary.dailyConstraint,
      },
      sourceAgent: 'architect_node',
    },
    ragEntries: ragPlan.map((entry) => ({
      topicSlug,
      eventType: entry.eventType,
      content: entry.content,
      retrievalText: entry.content,
      lexicalSearchText: entry.content,
      sourceAgent: 'architect_node',
      metadata: entry.metadata,
      idempotencyKey: `rag-onboarding:${actor.userId}:${progress.state.onboardingId}:${entry.idempotencySuffix}`,
      confidence: 0.8,
      isResolved: false,
    })),
    jobOutput: progress.state as Record<string, unknown>,
  };
}

export function createOnboardingService() {
  return {
    async getCurrent(actor: DbActor): Promise<OnboardingCurrentResponse> {
      const jobs = await jobsRepository.listByType(actor, {
        jobType: ONBOARDING_JOB_TYPE,
        limit: 5,
      });
      const activeJob =
        jobs.find((job) => job.status === 'running') ?? jobs[0] ?? null;

      if (activeJob === null || activeJob.output === null) {
        return onboardingCurrentResponseSchema.parse({
          onboardingId: null,
          status: 'not_started',
          turnsCompleted: 0,
        });
      }

      const state = parseStateFromJob(activeJob.output);

      return onboardingCurrentResponseSchema.parse({
        onboardingId: state.onboardingId,
        status: state.status,
        currentQuestion: state.currentQuestion ?? undefined,
        turnsCompleted: state.turns.length,
      });
    },

    async startGoal(
      actor: DbActor,
      input: StartGoalRequest,
      route: string,
      idempotencyKey: string,
      requestHash: string,
    ): Promise<AnyApiEnvelope> {
      const replay = await reserveIdempotentRequest<AnyApiEnvelope>(
        actor,
        route,
        idempotencyKey,
        requestHash,
      );

      if (replay !== null) {
        return replay;
      }

      const validatedInput = startGoalRequestSchema.parse(input);
      const current = await jobsRepository.listByType(actor, {
        jobType: ONBOARDING_JOB_TYPE,
        statuses: ['running'],
        limit: 1,
      });

      if (current[0]?.output !== null && current[0]?.output !== undefined) {
        const existingState = parseStateFromJob(current[0].output);
        const existingEnvelope = {
          ok: true as const,
          requestId: actor.requestId ?? 'replayed-request',
          data: startGoalResponseSchema.parse({
            onboardingId: existingState.onboardingId,
            firstQuestion:
              existingState.currentQuestion ??
              existingState.questions[0]?.question ??
              'Continue onboarding.',
            status: 'awaiting_reply',
          }),
        };

        await completeIdempotentRequest(actor, idempotencyKey, existingEnvelope);

        return existingEnvelope;
      }

      const jobRun = await jobsRepository.createJobRun(actor, {
        jobType: ONBOARDING_JOB_TYPE,
        status: 'running',
        input: validatedInput as Record<string, unknown>,
        idempotencyKey: `job:${ONBOARDING_JOB_TYPE}:${idempotencyKey}`,
        startedAt: new Date(),
      });
      const state = await createInitialOnboardingState({
        goal: validatedInput.goal,
        onboardingId: jobRun.id,
        ...(validatedInput.background === undefined
          ? {}
          : { background: validatedInput.background }),
        ...(validatedInput.preferredDepth === undefined
          ? {}
          : { preferredDepth: validatedInput.preferredDepth }),
      });

      await jobsRepository.updateStatus(actor, jobRun.id, {
        status: 'running',
        output: state as Record<string, unknown>,
        startedAt: jobRun.startedAt ?? new Date(),
      });

      const envelope = {
        ok: true as const,
        requestId: actor.requestId ?? 'request',
        data: startGoalResponseSchema.parse({
          onboardingId: state.onboardingId,
          firstQuestion: requireRow(
            state.currentQuestion,
            'Initial onboarding question is missing.',
          ),
          status: 'awaiting_reply',
        }),
      };

      await completeIdempotentRequest(actor, idempotencyKey, envelope);

      return envelope;
    },

    async submitReply(
      actor: DbActor,
      input: OnboardingReplyRequest,
      route: string,
      idempotencyKey: string,
      requestHash: string,
    ): Promise<AnyApiEnvelope> {
      const replay = await reserveIdempotentRequest<AnyApiEnvelope>(
        actor,
        route,
        idempotencyKey,
        requestHash,
      );

      if (replay !== null) {
        return replay;
      }

      const validatedInput = onboardingReplyRequestSchema.parse(input);
      const job = await jobsRepository.getById(actor, validatedInput.onboardingId);

      if (job === null || job.output === null) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'Onboarding session was not found.',
          status: 404,
        });
      }

      const progress = await applyOnboardingAnswer(
        parseStateFromJob(job.output),
        validatedInput.answer,
      );

      if (!progress.completed || progress.completionSummary === null) {
        await jobsRepository.updateStatus(actor, validatedInput.onboardingId, {
          status: 'running',
          output: progress.state as Record<string, unknown>,
        });

        const envelope = {
          ok: true as const,
          requestId: actor.requestId ?? 'request',
          data: onboardingReplyResponseSchema.parse({
            status: 'awaiting_reply',
            nextQuestion: progress.state.currentQuestion ?? undefined,
          }),
        };

        await completeIdempotentRequest(actor, idempotencyKey, envelope);

        return envelope;
      }

      const completionPlan = buildOnboardingCompletionPlan(actor, {
        ...progress,
        completed: true,
        completionSummary: progress.completionSummary,
      });
      let topicBriefId: string | null = null;

      await db.transaction(async (transaction) => {
        const tx = transaction as DbClient;
        const transactionalProfileRepository = createProfileRepository(tx);
        const transactionalTopicBriefsRepository =
          createTopicBriefsRepository(tx);
        const transactionalRagRepository = createRagRepository(tx);
        const transactionalJobsRepository = createJobsRepository(tx);
        const transactionalIdempotencyRepository =
          createApiIdempotencyRepository(tx);
        const profile = await transactionalProfileRepository.upsertProfile(
          actor,
          completionPlan.profileInput,
        );
        const topicBrief =
          await transactionalTopicBriefsRepository.createTopicBrief(actor, {
            ...completionPlan.topicBriefInput,
            learnerContext: {
              ...completionPlan.topicBriefInput.learnerContext,
              profileId: profile.id,
            },
          });

        topicBriefId = topicBrief.id;

        await transactionalRagRepository.writeMemories(
          actor,
          completionPlan.ragEntries.map((entry) => ({
            ...entry,
            sourceId: topicBrief.id,
          })),
        );

        await transactionalJobsRepository.updateStatus(
          actor,
          validatedInput.onboardingId,
          {
            status: 'succeeded',
            output: completionPlan.jobOutput,
            finishedAt: new Date(),
          },
        );

        const envelope = {
          ok: true as const,
          requestId: actor.requestId ?? 'request',
          data: onboardingReplyResponseSchema.parse({
            status: 'completed',
            topicBriefId: topicBrief.id,
          }),
        };

        await transactionalIdempotencyRepository.completeResponse(actor, {
          key: idempotencyKey,
          response: envelope as unknown as Record<string, unknown>,
          responseStatusCode: 200,
        });
      });

      if (topicBriefId === null) {
        throw new Error('Onboarding completion transaction did not return a topic brief id.');
      }

      // Onboarding remains durable even if downstream preparation fails. The
      // failed curriculum_build job is visible and the owner can retry safely.
      try {
        await phase1PreparationService.prepareFirstLesson(actor);
      } catch (error) {
        appLogger.error('phase1.initial_preparation_failed', {
          requestId: actor.requestId,
          userId: actor.userId,
          topicBriefId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }

      return {
        ok: true as const,
        requestId: actor.requestId ?? 'request',
        data: onboardingReplyResponseSchema.parse({
          status: 'completed',
          topicBriefId,
        }),
      };
    },
  };
}

export const onboardingService = createOnboardingService();
