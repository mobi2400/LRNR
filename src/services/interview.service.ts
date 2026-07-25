import {
  applyInterviewAnswer,
  createInterviewSession,
  type EvaluationGenerator,
  type InterviewProgress,
} from '@/agents/evaluation/evaluation-agent';
import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { AppError } from '@/server/errors';
import { redeemGuestLink, type GuestSession } from '@/server/guest-link';
import {
  deleteInterviewSession,
  loadInterviewSession,
  saveInterviewSession,
} from '@/server/interview-store';
import { assertServerOnly } from '@/utils/server-only';
import type {
  AnswerInterviewRequest,
  InterviewSessionState,
  StartInterviewRequest,
} from '@/schemas/evaluation.schema';

assertServerOnly('src/services/interview.service.ts');

/**
 * Orchestrates the interview across HTTP requests: redeem a guest link, start a
 * session, answer a turn. All persistence and turn logic is delegated (the
 * evaluation agent owns turns; the interview store owns durability). The service
 * adds the one thing neither can: binding each session to the principal who
 * started it, so a guest can never drive another principal's interview.
 */

const OWNER_KEY_PREFIX = 'interview-owner:';
const DEFAULT_OWNER_TTL_MS = 24 * 60 * 60 * 1000;

function ownerKey(sessionId: string): string {
  return `${OWNER_KEY_PREFIX}${sessionId}`;
}

export interface InterviewServiceDeps {
  store?: KeyValueStore;
  generate?: EvaluationGenerator;
}

export class InterviewNotFoundError extends AppError {
  constructor() {
    super({
      code: 'NOT_FOUND',
      message: 'No such interview session.',
      status: 404,
    });
    this.name = 'InterviewNotFoundError';
  }
}

export class InterviewForbiddenError extends AppError {
  constructor() {
    super({
      code: 'FORBIDDEN',
      message: 'This interview session belongs to another principal.',
      status: 403,
    });
    this.name = 'InterviewForbiddenError';
  }
}

export function createInterviewService(deps: InterviewServiceDeps = {}) {
  const store = deps.store ?? new RedisKeyValueStore();
  // undefined lets the agent pick real-vs-deterministic; null forces
  // deterministic; a function overrides. We forward whatever we were given.
  const generate = deps.generate;

  async function bindOwner(sessionId: string, userId: string): Promise<void> {
    await store.set(ownerKey(sessionId), userId, {
      ttlMs: DEFAULT_OWNER_TTL_MS,
    });
  }

  async function assertOwner(sessionId: string, userId: string): Promise<void> {
    const bound = await store.get(ownerKey(sessionId));

    // An unbound session (owner record expired but state survives, or never
    // bound) is treated as not found rather than silently accessible.
    if (bound === null) {
      throw new InterviewNotFoundError();
    }

    if (bound !== userId) {
      throw new InterviewForbiddenError();
    }
  }

  return {
    /**
     * Redeems a guest link. Returns the guest session on success or null when
     * the token is unknown, used, expired, or malformed — the route turns null
     * into a 404 rather than leaking which of those it was.
     */
    async redeem(token: string): Promise<GuestSession | null> {
      return redeemGuestLink(token, store);
    },

    async start(
      userId: string,
      input: StartInterviewRequest,
    ): Promise<InterviewSessionState> {
      const state = await createInterviewSession(
        {
          topicSlug: input.topicSlug,
          ...(input.turnCap === undefined ? {} : { turnCap: input.turnCap }),
        },
        generate,
      );

      await saveInterviewSession(state, { store });
      await bindOwner(state.sessionId, userId);

      return state;
    },

    /**
     * Loads a session for its owner — the read behind the verdict screen.
     * Enforces the same per-principal ownership as answering, so one guest can
     * never read another's transcript or verdict.
     */
    async get(
      userId: string,
      sessionId: string,
    ): Promise<InterviewSessionState> {
      await assertOwner(sessionId, userId);

      const state = await loadInterviewSession(sessionId, store);

      if (state === null) {
        throw new InterviewNotFoundError();
      }

      return state;
    },

    async answer(
      userId: string,
      input: AnswerInterviewRequest,
    ): Promise<InterviewProgress> {
      await assertOwner(input.sessionId, userId);

      const state = await loadInterviewSession(input.sessionId, store);

      if (state === null) {
        throw new InterviewNotFoundError();
      }

      const progress = await applyInterviewAnswer(state, input.answer, generate);

      await saveInterviewSession(progress.state, { store });

      // Once completed, the owner binding is no longer needed; let it expire
      // naturally with the session rather than deleting eagerly, so a repeated
      // answer on a completed session still resolves to a frozen result.
      return progress;
    },

    async discard(userId: string, sessionId: string): Promise<void> {
      await assertOwner(sessionId, userId);
      await deleteInterviewSession(sessionId, store);
      await store.delete(ownerKey(sessionId));
    },
  };
}

export const interviewService = createInterviewService();
