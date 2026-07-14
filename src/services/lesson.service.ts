import { apiIdempotencyRepository } from '@/db/api-idempotency.repo';
import { curriculumRepository } from '@/db/curriculum.repo';
import { knowledgeRepository } from '@/db/knowledge.repo';
import { profileRepository } from '@/db/profile.repo';
import { ragRepository } from '@/db/rag.repo';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import {
  createCompactSessionSummary,
  createLessonPayload,
} from '@/agents/teaching/teaching-agent';
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
import { curriculumSessionSchema, type CurriculumSession } from '@/schemas/curriculum.schema';
import { AppError } from '@/server/errors';
import { assertIdempotencyReplay, type AnyApiEnvelope } from '@/server/idempotency';

const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;

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

  return parsedSessions.find((session) => session.id === currentSessionId) ?? null;
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

  if (profile === null || profile.currentTopicSlug === null || curriculum === null) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'No active topic is ready for lesson generation.',
      status: 404,
    });
  }

  const currentSession = requireRow(
    getCurrentSession(curriculum.layer2Sessions, curriculum.currentSessionId),
    'Current curriculum session was not found.',
  );

  if (currentSession.lesson !== undefined) {
    return lessonPayloadSchema.parse(currentSession.lesson);
  }

  const knowledgeBase = requireRow(
    await knowledgeRepository.getByTopicSlug(actor, profile.currentTopicSlug),
    'Topic knowledge base not found for lesson generation.',
    { topicSlug: profile.currentTopicSlug },
  );
  const lesson = createLessonPayload({
    topicSlug: profile.currentTopicSlug,
    session: currentSession,
    knowledgeBase,
  });

  await curriculumRepository.saveGeneratedLesson(actor, profile.currentTopicSlug, {
    sessionId: currentSession.id,
    lesson,
  });
  await curriculumRepository.updateSessionStatus(actor, profile.currentTopicSlug, {
    sessionId: currentSession.id,
    status: 'delivered',
    deliveredAt: new Date(),
  });

  return lesson;
}

export async function getCurrentLesson(
  actor: DbActor,
): Promise<CurrentLessonResponse> {
  const { profile, curriculum } = await loadCurrentCurriculum(actor);

  if (profile === null || profile.currentTopicSlug === null) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'no_active_topic',
    });
  }

  if (curriculum === null) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'not_ready',
    });
  }

  const currentSession = getCurrentSession(
    curriculum.layer2Sessions,
    curriculum.currentSessionId,
  );

  if (currentSession === null) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'completed',
    });
  }

  if (currentSession.lesson === undefined) {
    return currentLessonResponseSchema.parse({
      lesson: null,
      reasonIfEmpty: 'not_ready',
    });
  }

  return currentLessonResponseSchema.parse({
    lesson: lessonPayloadSchema.parse(currentSession.lesson),
  });
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

  if (profile === null || profile.currentTopicSlug === null || curriculum === null) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'No active lesson is available to complete.',
      status: 404,
    });
  }

  const currentSession = requireRow(
    getCurrentSession(curriculum.layer2Sessions, input.sessionId),
    'Lesson session was not found.',
    { sessionId: input.sessionId },
  );
  const lesson = lessonPayloadSchema.parse(currentSession.lesson);
  const nextSessionId = getNextSessionId(curriculum.layer2Sessions, input.sessionId);
  const summary = createCompactSessionSummary({
    lesson,
    status: 'completed',
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  });

  await curriculumRepository.updateSessionStatus(actor, profile.currentTopicSlug, {
    sessionId: input.sessionId,
    status: 'completed',
  });

  await ragRepository.writeSessionSummary(actor, {
    topicSlug: profile.currentTopicSlug,
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

  if (nextSessionId !== null) {
    const nextIndex = curriculum.layer2Sessions.findIndex((session) => {
      const parsed = curriculumSessionSchema.parse(session);

      return parsed.id === nextSessionId;
    });

    await curriculumRepository.updateCurrentSessionPointer(
      actor,
      profile.currentTopicSlug,
      {
        sessionId: nextSessionId,
        sessionIndex: Math.max(nextIndex, 0),
      },
    );
  }

  const response = markLessonCompleteResponseSchema.parse({
    sessionId: input.sessionId,
    status: 'completed',
    nextSessionId,
  });

  await apiIdempotencyRepository.completeResponse(actor, {
    key: input.idempotencyKey,
    response: {
      ok: true,
      requestId: actor.requestId ?? 'request',
      data: response,
    },
    responseStatusCode: 200,
  });

  return response;
}

export async function answerLessonFollowUp(
  actor: DbActor,
  input: {
    sessionId: string;
    question: string;
  },
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

  const groundedIn = lesson.sourceReferences.map((source) => source.url);
  const answer = [
    `Use the lesson objective as the anchor: ${lesson.objective}`,
    `For your question, "${input.question}", start from the mental model: ${lesson.mentalModel}`,
    'Then answer with one concrete example and one tradeoff before moving on.',
  ].join(' ');

  return followUpResponseSchema.parse({
    answer,
    groundedIn,
  });
}
