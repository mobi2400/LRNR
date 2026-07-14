import {
  applyOnboardingAnswer,
  buildOnboardingRagSeedPlan,
  createInitialOnboardingState,
} from '@/agents/architect/architect-agent';
import { apiIdempotencyRepository } from '@/db/api-idempotency.repo';
import { jobsRepository } from '@/db/jobs.repo';
import { profileRepository } from '@/db/profile.repo';
import { ragRepository } from '@/db/rag.repo';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import { topicBriefsRepository } from '@/db/topic-briefs.repo';
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

const ONBOARDING_JOB_TYPE = 'architect_onboarding';
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;

async function getReplay<TResponse extends AnyApiEnvelope>(
  actor: DbActor,
  route: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<TResponse | null> {
  const existing = await apiIdempotencyRepository.getByKey(actor, idempotencyKey);

  if (existing === null || existing.response === null) {
    return null;
  }

  return assertIdempotencyReplay(
    {
      key: existing.key,
      route: existing.route,
      requestHash: existing.requestHash,
      response: existing.response as TResponse,
      statusCode: 200,
    },
    route,
    requestHash,
  );
}

async function saveReplay(
  actor: DbActor,
  route: string,
  idempotencyKey: string,
  requestHash: string,
  response: AnyApiEnvelope,
): Promise<void> {
  await apiIdempotencyRepository.saveResponse(actor, {
    key: idempotencyKey,
    route,
    requestHash,
    response: response as unknown as Record<string, unknown>,
    status: 'completed',
    expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
  });
}

function parseStateFromJob(jobOutput: unknown) {
  return architectOnboardingStateSchema.parse(jobOutput);
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
      const replay = await getReplay<AnyApiEnvelope>(
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

        await saveReplay(actor, route, idempotencyKey, requestHash, existingEnvelope);

        return existingEnvelope;
      }

      const jobRun = await jobsRepository.createJobRun(actor, {
        jobType: ONBOARDING_JOB_TYPE,
        status: 'running',
        input: validatedInput as Record<string, unknown>,
        idempotencyKey: `job:${ONBOARDING_JOB_TYPE}:${idempotencyKey}`,
        startedAt: new Date(),
      });
      const state = createInitialOnboardingState({
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

      await saveReplay(actor, route, idempotencyKey, requestHash, envelope);

      return envelope;
    },

    async submitReply(
      actor: DbActor,
      input: OnboardingReplyRequest,
      route: string,
      idempotencyKey: string,
      requestHash: string,
    ): Promise<AnyApiEnvelope> {
      const replay = await getReplay<AnyApiEnvelope>(
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

      const progress = applyOnboardingAnswer(
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

        await saveReplay(actor, route, idempotencyKey, requestHash, envelope);

        return envelope;
      }

      const profile = await profileRepository.upsertProfile(actor, {
        currentGoal: progress.state.goal,
        currentTopicSlug: progress.completionSummary.topicBlueprint.topicSlug,
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
      });

      const topicBrief = await topicBriefsRepository.createTopicBrief(actor, {
        topicSlug: progress.completionSummary.topicBlueprint.topicSlug,
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
          profileId: profile.id,
        },
        prerequisiteMap: progress.completionSummary.topicBlueprint.prerequisiteMap,
        conceptOutline: progress.completionSummary.topicBlueprint.conceptOutline,
        masteryIntent: {
          preferredDepth: progress.state.preferredDepth,
          dailyConstraint: progress.completionSummary.dailyConstraint,
        },
        sourceAgent: 'architect_node',
      });

      const ragPlan = buildOnboardingRagSeedPlan(progress.state);

      for (const entry of ragPlan) {
        if (entry.eventType === 'onboarding_response') {
          await ragRepository.writeOnboardingSeed(actor, {
            topicSlug: topicBrief.topicSlug,
            content: entry.content,
            retrievalText: entry.content,
            lexicalSearchText: entry.content,
            sourceAgent: 'architect_node',
            sourceId: topicBrief.id,
            metadata: entry.metadata,
            idempotencyKey: `rag-onboarding:${actor.userId}:${progress.state.onboardingId}:${entry.idempotencySuffix}`,
            confidence: 0.8,
            isResolved: false,
          });

          continue;
        }

        await ragRepository.writeMemory(actor, {
          topicSlug: topicBrief.topicSlug,
          eventType: entry.eventType,
          content: entry.content,
          retrievalText: entry.content,
          lexicalSearchText: entry.content,
          sourceAgent: 'architect_node',
          sourceId: topicBrief.id,
          metadata: entry.metadata,
          idempotencyKey: `rag-onboarding:${actor.userId}:${progress.state.onboardingId}:${entry.idempotencySuffix}`,
          confidence: 0.8,
          isResolved: false,
        });
      }

      await jobsRepository.updateStatus(actor, validatedInput.onboardingId, {
        status: 'succeeded',
        output: progress.state as Record<string, unknown>,
        finishedAt: new Date(),
      });

      const envelope = {
        ok: true as const,
        requestId: actor.requestId ?? 'request',
        data: onboardingReplyResponseSchema.parse({
          status: 'completed',
          topicBriefId: topicBrief.id,
        }),
      };

      await saveReplay(actor, route, idempotencyKey, requestHash, envelope);

      return envelope;
    },
  };
}

export const onboardingService = createOnboardingService();
