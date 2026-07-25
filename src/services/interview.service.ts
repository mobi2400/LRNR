import {
  applyInterviewAnswer,
  createInterviewSession,
  type EvaluationGenerator,
  type InterviewProgress,
} from '@/agents/evaluation/evaluation-agent';
import {
  interviewRepository,
  type InterviewRepository,
} from '@/db/interview.repo';
import { appLogger } from '@/lib/logger';
import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { AppError } from '@/server/errors';
import { redeemGuestLink, type GuestSession } from '@/server/guest-link';
import { assertServerOnly } from '@/utils/server-only';
import type {
  AnswerInterviewRequest,
  InterviewReactionRequest,
  InterviewSessionState,
  StartInterviewRequest,
} from '@/schemas/evaluation.schema';

assertServerOnly('src/services/interview.service.ts');

/**
 * Orchestrates the interview across HTTP requests: redeem a guest link, start a
 * session, answer a turn, read the verdict, capture a reaction. Turn logic is
 * the evaluation agent's; durability is the interview repository's (Postgres in
 * production, in-memory under test). Single-use guest link *tokens* remain in
 * Redis — transient credentials, not records — so the redeem path still needs a
 * KeyValueStore.
 */

export interface InterviewServiceDeps {
  repository?: InterviewRepository;
  tokenStore?: KeyValueStore;
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
  const repository = deps.repository ?? interviewRepository;
  const tokenStore = deps.tokenStore ?? new RedisKeyValueStore();
  // undefined lets the agent pick real-vs-deterministic; null forces
  // deterministic; a function overrides. We forward whatever we were given.
  const generate = deps.generate;

  /**
   * Loads a session and enforces per-principal ownership. Unknown sessions and
   * sessions owned by another principal are surfaced as not-found / forbidden
   * respectively — a guest can never touch another's interview.
   */
  async function loadOwned(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSessionState> {
    const stored = await repository.getSession(sessionId);

    if (stored === null) {
      throw new InterviewNotFoundError();
    }

    if (stored.principalUserId !== userId) {
      throw new InterviewForbiddenError();
    }

    return stored.state;
  }

  return {
    /**
     * Redeems a guest link. Returns the guest session on success or null when
     * the token is unknown, used, expired, or malformed — the route turns null
     * into a 404 rather than leaking which of those it was.
     */
    async redeem(token: string): Promise<GuestSession | null> {
      return redeemGuestLink(token, tokenStore);
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

      await repository.createSession(state, userId);

      return state;
    },

    async get(
      userId: string,
      sessionId: string,
    ): Promise<InterviewSessionState> {
      return loadOwned(sessionId, userId);
    },

    async answer(
      userId: string,
      input: AnswerInterviewRequest,
    ): Promise<InterviewProgress> {
      const state = await loadOwned(input.sessionId, userId);
      const progress = await applyInterviewAnswer(state, input.answer, generate);

      await repository.updateSession(progress.state);

      // Log every completion — including no-verdict ones — for calibration.
      // A logging failure must never fail the interview turn itself.
      if (progress.completed) {
        const turns = progress.state.turns;
        const unscoredTurns = turns.filter((turn) => turn.unscored).length;

        try {
          await repository.appendVerdictLog({
            sessionId: progress.state.sessionId,
            topicSlug: progress.state.topicSlug,
            principalUserId: userId,
            totalTurns: turns.length,
            scoredTurns: turns.length - unscoredTurns,
            unscoredTurns,
            verdict: progress.verdict,
          });
        } catch (error) {
          appLogger.warn('interview.verdict_log_failed', {
            sessionId: progress.state.sessionId,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      }

      return progress;
    },

    /**
     * Records the interviewee's reaction to the verdict. Only valid once the
     * session has completed — there is no verdict to react to before then.
     */
    async recordReaction(
      userId: string,
      sessionId: string,
      input: InterviewReactionRequest,
    ) {
      const state = await loadOwned(sessionId, userId);

      if (state.status !== 'completed') {
        throw new AppError({
          code: 'CONFLICT',
          message: 'A reaction can only be recorded after the verdict.',
          status: 409,
        });
      }

      return repository.saveReaction({
        sessionId,
        principalUserId: userId,
        wasAnythingWrong: input.wasAnythingWrong,
        note: input.note ?? null,
        contact: input.contact ?? null,
      });
    },

    async discard(userId: string, sessionId: string): Promise<void> {
      await loadOwned(sessionId, userId);
      await repository.deleteSession(sessionId);
    },
  };
}

export const interviewService = createInterviewService();
