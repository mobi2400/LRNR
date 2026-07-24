import {
  apiIdempotencyRepository,
  createApiIdempotencyRepository,
} from '@/db/api-idempotency.repo';
import { db, type DbClient } from '@/db/client';
import {
  createCurriculumRepository,
  curriculumRepository,
} from '@/db/curriculum.repo';
import { knowledgeRepository } from '@/db/knowledge.repo';
import { profileRepository } from '@/db/profile.repo';
import { createRagRepository, ragRepository } from '@/db/rag.repo';
import { RedisKeyValueStore } from '@/lib/redis';
import { appLogger } from '@/lib/logger';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import { z } from 'zod';

import {
  createCompactSessionSummary,
  generateGroundedLessonPayload,
} from '@/agents/teaching/teaching-agent';
import {
  createRagSearchExecutor,
  ragSearchToolDefinition,
} from '@/agents/tools/rag-search.tool';
import { runToolAgent, type LlmToolExecutor } from '@/lib/llm';
import { serverConfig } from '@/server/config';
import {
  curriculumSessionSchema,
  type CurriculumSession,
} from '@/schemas/curriculum.schema';
import {
  currentLessonResponseSchema,
  followUpResponseSchema,
  lessonPayloadSchema,
  markLessonCompleteResponseSchema,
  type CurrentLessonResponse,
  type FollowUpResponse,
  type LessonPayload,
  type MarkLessonCompleteResponse,
} from '@/schemas/lesson.schema';
import { AppError } from '@/server/errors';
import {
  buildCurrentLessonCacheKey,
  CACHE_TTL_MS,
  getCachedJson,
  setCachedJson,
} from '@/server/cache';
import {
  assertIdempotencyReplay,
  type AnyApiEnvelope,
} from '@/server/idempotency';

const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;
const lessonCacheStore = new RedisKeyValueStore();

export function buildLessonGenerationKey(input: {
  userId: string;
  sessionId: string;
  curriculumRevision: number;
}): string {
  return [
    'lesson-generate',
    input.userId,
    input.sessionId,
    String(input.curriculumRevision),
  ].join(':');
}

function getCurrentSession(
  sessions: unknown[],
  currentSessionId: string | null,
): CurriculumSession | null {
  if (currentSessionId === null) {
    return null;
  }

  const parsedSessions = sessions.map((session) =>
    curriculumSessionSchema.parse(session),
  );

  return (
    parsedSessions.find((session) => session.id === currentSessionId) ?? null
  );
}

async function loadCurrentCurriculum(actor: DbActor) {
  const profile = await profileRepository.getCurrentProfile(actor);

  if (profile === null || profile.currentTopicSlug === null) {
    return {
      profile,
      curriculum: null,
    };
  }

  return {
    profile,
    curriculum: await curriculumRepository.getActiveCurriculum(
      actor,
      profile.currentTopicSlug,
    ),
  };
}

function getNextSessionId(
  sessions: unknown[],
  completedSessionId: string,
): string | null {
  const parsedSessions = sessions.map((session) =>
    curriculumSessionSchema.parse(session),
  );
  const currentIndex = parsedSessions.findIndex(
    (session) => session.id === completedSessionId,
  );

  if (currentIndex < 0) {
    return null;
  }

  return parsedSessions[currentIndex + 1]?.id ?? null;
}

export async function generateAndPersistCurrentLesson(
  actor: DbActor,
): Promise<LessonPayload> {
  const { profile, curriculum } = await loadCurrentCurriculum(actor);

  if (
    profile === null ||
    profile.currentTopicSlug === null ||
    curriculum === null
  ) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'No active topic is ready for lesson generation.',
      status: 404,
    });
  }

  const topicSlug = profile.currentTopicSlug;
  const currentSession = requireRow(
    getCurrentSession(curriculum.layer2Sessions, curriculum.currentSessionId),
    'Current curriculum session was not found.',
  );

  if (currentSession.lesson !== undefined) {
    return lessonPayloadSchema.parse(currentSession.lesson);
  }

  const knowledgeBase = requireRow(
    await knowledgeRepository.getByTopicSlug(actor, topicSlug),
    'Topic knowledge base not found for lesson generation.',
    { topicSlug },
  );
  const lesson = await generateGroundedLessonPayload({
    topicSlug,
    session: currentSession,
    knowledgeBase,
    profile,
  });

  try {
    await curriculumRepository.saveGeneratedLesson(actor, topicSlug, {
      sessionId: currentSession.id,
      lesson,
      expectedRevision: curriculum.revision,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONFLICT') {
      const replay = await loadCurrentCurriculum(actor);
      const replaySession =
        replay.curriculum === null
          ? null
          : getCurrentSession(
              replay.curriculum.layer2Sessions,
              currentSession.id,
            );

      if (replaySession?.lesson !== undefined) {
        return lessonPayloadSchema.parse(replaySession.lesson);
      }
    }

    throw error;
  }

  return lesson;
}

export async function getCurrentLesson(
  actor: DbActor,
): Promise<CurrentLessonResponse> {
  const readModel = await curriculumRepository.getCurrentLessonReadModel(actor);

  if (readModel.topicSlug === null) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'no_active_topic',
    });
  }

  if (
    readModel.revision === null ||
    readModel.currentSessionId === null ||
    readModel.currentSession === null
  ) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'completed',
    });
  }

  const cacheKey = buildCurrentLessonCacheKey(
    actor.userId,
    readModel.currentSessionId,
    readModel.revision,
  );

  try {
    const cached = await getCachedJson(
      lessonCacheStore,
      cacheKey,
      currentLessonResponseSchema,
    );

    if (cached !== null) {
      return cached;
    }
  } catch (error) {
    appLogger.warn('current_lesson.cache_read_failed', {
      requestId: actor.requestId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  const currentSession = curriculumSessionSchema.parse(
    readModel.currentSession,
  );

  if (currentSession.id !== readModel.currentSessionId) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'not_ready',
    });
  }

  const response =
    currentSession.lesson === undefined
      ? currentLessonResponseSchema.parse({
          lesson: null,
          reasonIfEmpty: 'not_ready',
        })
      : currentLessonResponseSchema.parse({
          lesson: lessonPayloadSchema.parse(currentSession.lesson),
        });

  try {
    await setCachedJson(
      lessonCacheStore,
      cacheKey,
      response,
      CACHE_TTL_MS.currentLesson,
    );
  } catch (error) {
    appLogger.warn('current_lesson.cache_write_failed', {
      requestId: actor.requestId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return response;
}
export async function markLessonComplete(
  actor: DbActor,
  input: {
    sessionId: string;
    understood: boolean;
    notes?: string;
    idempotencyKey: string;
    route: string;
    requestHash: string;
  },
): Promise<MarkLessonCompleteResponse> {
  const reservation = await apiIdempotencyRepository.reserveProcessing(actor, {
    key: input.idempotencyKey,
    route: input.route,
    requestHash: input.requestHash,
    expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
  });

  if (!reservation.reserved) {
    const replay = assertIdempotencyReplay<AnyApiEnvelope>(
      {
        key: reservation.record.key,
        route: reservation.record.route,
        requestHash: reservation.record.requestHash,
        response: reservation.record.response as AnyApiEnvelope | null,
        statusCode: reservation.record.responseStatusCode,
        status: reservation.record.status,
      },
      input.route,
      input.requestHash,
    );

    if (!replay.ok) {
      throw new Error(replay.error.message);
    }

    return markLessonCompleteResponseSchema.parse(replay.data);
  }

  const { profile, curriculum } = await loadCurrentCurriculum(actor);

  if (
    profile === null ||
    profile.currentTopicSlug === null ||
    curriculum === null
  ) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'No active lesson is available to complete.',
      status: 404,
    });
  }

  const topicSlug = profile.currentTopicSlug;
  const currentSession = requireRow(
    getCurrentSession(curriculum.layer2Sessions, input.sessionId),
    'Lesson session was not found.',
    { sessionId: input.sessionId },
  );
  const lesson = lessonPayloadSchema.parse(currentSession.lesson);
  const nextSessionId = getNextSessionId(
    curriculum.layer2Sessions,
    input.sessionId,
  );
  const summary = createCompactSessionSummary({
    lesson,
    status: 'completed',
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  });
  const nextIndex =
    nextSessionId === null
      ? curriculum.currentSessionIndex
      : Math.max(
          curriculum.layer2Sessions.findIndex((session) => {
            const parsed = curriculumSessionSchema.parse(session);

            return parsed.id === nextSessionId;
          }),
          0,
        );
  const response = markLessonCompleteResponseSchema.parse({
    sessionId: input.sessionId,
    status: 'completed',
    nextSessionId,
  });

  await db.transaction(async (transaction) => {
    const tx = transaction as DbClient;
    const transactionalCurriculumRepository = createCurriculumRepository(tx);
    const transactionalRagRepository = createRagRepository(tx);
    const transactionalIdempotencyRepository =
      createApiIdempotencyRepository(tx);

    await transactionalCurriculumRepository.completeSessionAndAdvancePointer(
      actor,
      topicSlug,
      {
        sessionId: input.sessionId,
        expectedRevision: curriculum.revision,
        nextSessionId,
        nextSessionIndex: nextIndex,
      },
    );

    await transactionalRagRepository.writeSessionSummary(actor, {
      topicSlug,
      content: summary,
      retrievalText: summary,
      lexicalSearchText: summary,
      sourceAgent: 'teaching_node',
      metadata: {
        sessionId: input.sessionId,
        understood: input.understood,
        summaryKind: 'lesson_completion',
      },
      idempotencyKey: `rag-session-summary:${actor.userId}:${input.sessionId}`,
      confidence: 0.8,
      isResolved: false,
    });

    await transactionalIdempotencyRepository.completeResponse(actor, {
      key: input.idempotencyKey,
      response: {
        ok: true,
        requestId: actor.requestId ?? 'request',
        data: response,
      },
      responseStatusCode: 200,
    });
  });

  return response;
}

const followUpAnswerSchema = z.object({
  answer: z.string().trim().min(1),
  groundedIn: z.array(z.string().trim().min(1)).default([]),
});

const followUpSystemPrompt = `You are LRNR's Teaching Agent answering a learner's follow-up question about the current lesson.

Rules:
- Ground your answer in the lesson and in evidence you retrieve with rag_search. Do not invent facts or sources.
- If the evidence is thin, say what is uncertain rather than guessing.
- Answer directly and concretely: one clear explanation, one example or tradeoff.
- Cite in "groundedIn" only source URLs you actually used (lesson sources or rag_search results).
- Return one JSON object, no markdown fence.`;

export interface FollowUpDependencies {
  runAgent: typeof runToolAgent;
  createSearchExecutor: (actor: DbActor, topicSlug?: string) => LlmToolExecutor;
}

const defaultFollowUpDependencies: FollowUpDependencies = {
  runAgent: runToolAgent,
  createSearchExecutor: (actor, topicSlug) =>
    createRagSearchExecutor(actor, topicSlug === undefined ? {} : { topicSlug }),
};

/** The lesson-anchored deterministic answer: test/offline path and fallback. */
function templateFollowUp(
  lesson: LessonPayload,
  question: string,
): FollowUpResponse {
  return followUpResponseSchema.parse({
    answer: [
      `Use the lesson objective as the anchor: ${lesson.objective}`,
      `For your question, "${question}", start from the mental model: ${lesson.mentalModel}`,
      'Then answer with one concrete example and one tradeoff before moving on.',
    ].join(' '),
    groundedIn: lesson.sourceReferences.map((source) => source.url),
  });
}

export async function generateGroundedFollowUp(
  actor: DbActor,
  lesson: LessonPayload,
  question: string,
  dependencies: FollowUpDependencies,
): Promise<FollowUpResponse> {
  const lessonUrls = lesson.sourceReferences.map((source) => source.url);
  const result = await dependencies.runAgent({
    label: 'lesson_follow_up',
    system: followUpSystemPrompt,
    prompt: `LESSON
Objective: ${lesson.objective}
Mental model: ${lesson.mentalModel}
Lesson sources: ${lessonUrls.join(', ') || '(none)'}

LEARNER QUESTION
${question}

Use rag_search to gather grounded evidence when helpful, then answer.
Return { "answer": "...", "groundedIn": ["exact source url", ...] }.`,
    schema: followUpAnswerSchema,
    tools: [ragSearchToolDefinition],
    executeTool: dependencies.createSearchExecutor(
      actor,
      lesson.topicSlug,
    ),
    temperature: 0.3,
    maxTokens: 4_000,
  });
  // Always keep the validated lesson sources; add any extra URLs the model
  // actually cited from retrieved evidence.
  const groundedIn = [...new Set([...result.groundedIn, ...lessonUrls])];

  return followUpResponseSchema.parse({ answer: result.answer, groundedIn });
}

export async function answerLessonFollowUp(
  actor: DbActor,
  input: {
    sessionId: string;
    question: string;
  },
  dependencies: FollowUpDependencies = defaultFollowUpDependencies,
): Promise<FollowUpResponse> {
  const current = await getCurrentLesson(actor);
  const lesson = current.lesson;

  if (lesson === null || lesson.sessionId !== input.sessionId) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'Current lesson was not found for this follow-up.',
      status: 404,
    });
  }

  const useDefaults = dependencies === defaultFollowUpDependencies;

  // Deterministic in test/offline; real tool-grounded answer in production.
  if (useDefaults && serverConfig.nodeEnv === 'test') {
    return templateFollowUp(lesson, input.question);
  }

  try {
    return await generateGroundedFollowUp(
      actor,
      lesson,
      input.question,
      dependencies,
    );
  } catch {
    return templateFollowUp(lesson, input.question);
  }
}
