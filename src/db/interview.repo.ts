import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { db, type DbClient } from '@/db/client';
import {
  interviewReactions,
  interviewSessions,
  interviewVerdictLog,
} from '@/db/schema';
import {
  interviewReactionSchema,
  interviewSessionStateSchema,
  interviewVerdictSchema,
  type InterviewReaction,
  type InterviewSessionState,
  type InterviewVerdict,
} from '@/schemas/evaluation.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/db/interview.repo.ts');

/**
 * Interview persistence. The service depends on the InterviewRepository
 * interface, not on a concrete store, so production uses Postgres (Drizzle) and
 * tests use the in-memory implementation — the same seam philosophy as the
 * LLM generator. Row<->domain mapping is done through pure functions so the
 * mapping can be unit-tested without a database.
 */

export interface StoredSession {
  state: InterviewSessionState;
  principalUserId: string;
}

export interface VerdictLogEntry {
  id: string;
  sessionId: string;
  principalUserId: string;
  topicSlug: string;
  totalTurns: number;
  scoredTurns: number;
  unscoredTurns: number;
  verdict: InterviewVerdict | null;
  loggedAt: string;
}

export type AppendVerdictLogInput = Omit<VerdictLogEntry, 'id' | 'loggedAt'>;
export type SaveReactionInput = Omit<InterviewReaction, 'recordedAt'>;

export interface InterviewRepository {
  createSession(state: InterviewSessionState, principalUserId: string): Promise<void>;
  updateSession(state: InterviewSessionState): Promise<void>;
  getSession(sessionId: string): Promise<StoredSession | null>;
  deleteSession(sessionId: string): Promise<void>;
  appendVerdictLog(input: AppendVerdictLogInput): Promise<VerdictLogEntry>;
  listVerdictLog(): Promise<VerdictLogEntry[]>;
  saveReaction(input: SaveReactionInput): Promise<InterviewReaction>;
  getReaction(sessionId: string): Promise<InterviewReaction | null>;
}

// ── Pure row <-> domain mapping (unit-testable without a DB) ───────────────────

interface SessionRowShape {
  sessionId: string;
  principalUserId: string;
  topicSlug: string;
  status: string;
  turnCap: number;
  currentProbe: string | null;
  turns: unknown;
  detectedGaps: unknown;
  verdictSummary: unknown;
}

export function sessionToRow(
  state: InterviewSessionState,
  principalUserId: string,
): SessionRowShape {
  const validated = interviewSessionStateSchema.parse(state);

  return {
    sessionId: validated.sessionId,
    principalUserId,
    topicSlug: validated.topicSlug,
    status: validated.status,
    turnCap: validated.turnCap,
    currentProbe: validated.currentProbe,
    turns: validated.turns,
    detectedGaps: validated.detectedGaps,
    verdictSummary: validated.verdictSummary,
  };
}

export function rowToStoredSession(row: SessionRowShape): StoredSession {
  return {
    principalUserId: row.principalUserId,
    state: interviewSessionStateSchema.parse({
      sessionId: row.sessionId,
      topicSlug: row.topicSlug,
      status: row.status,
      turnCap: row.turnCap,
      currentProbe: row.currentProbe,
      turns: row.turns,
      detectedGaps: row.detectedGaps,
      verdictSummary: row.verdictSummary,
    }),
  };
}

function rowToVerdictLogEntry(row: {
  id: string;
  sessionId: string;
  principalUserId: string;
  topicSlug: string;
  totalTurns: number;
  scoredTurns: number;
  unscoredTurns: number;
  verdict: unknown;
  loggedAt: Date;
}): VerdictLogEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    principalUserId: row.principalUserId,
    topicSlug: row.topicSlug,
    totalTurns: row.totalTurns,
    scoredTurns: row.scoredTurns,
    unscoredTurns: row.unscoredTurns,
    verdict:
      row.verdict === null ? null : interviewVerdictSchema.parse(row.verdict),
    loggedAt: row.loggedAt.toISOString(),
  };
}

// ── Postgres implementation ───────────────────────────────────────────────────

export function createPostgresInterviewRepository(
  database: DbClient = db,
): InterviewRepository {
  return {
    async createSession(state, principalUserId) {
      await database
        .insert(interviewSessions)
        .values(sessionToRow(state, principalUserId));
    },

    async updateSession(state) {
      const row = sessionToRow(state, '');

      await database
        .update(interviewSessions)
        .set({
          status: row.status,
          currentProbe: row.currentProbe,
          turns: row.turns,
          detectedGaps: row.detectedGaps,
          verdictSummary: row.verdictSummary,
          updatedAt: new Date(),
        })
        .where(eq(interviewSessions.sessionId, row.sessionId));
    },

    async getSession(sessionId) {
      const rows = await database
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.sessionId, sessionId))
        .limit(1);

      const row = rows[0];

      return row === undefined ? null : rowToStoredSession(row);
    },

    async deleteSession(sessionId) {
      await database
        .delete(interviewSessions)
        .where(eq(interviewSessions.sessionId, sessionId));
    },

    async appendVerdictLog(input) {
      const [row] = await database
        .insert(interviewVerdictLog)
        .values({ ...input, verdict: input.verdict })
        .returning();

      if (row === undefined) {
        throw new Error('Verdict log insert did not return a row.');
      }

      return rowToVerdictLogEntry(row);
    },

    async listVerdictLog() {
      const rows = await database
        .select()
        .from(interviewVerdictLog)
        .orderBy(desc(interviewVerdictLog.loggedAt), desc(interviewVerdictLog.id));

      return rows.map(rowToVerdictLogEntry);
    },

    async saveReaction(input) {
      const [row] = await database
        .insert(interviewReactions)
        .values(input)
        .onConflictDoUpdate({
          target: interviewReactions.sessionId,
          set: {
            wasAnythingWrong: input.wasAnythingWrong,
            note: input.note,
            contact: input.contact,
            recordedAt: new Date(),
          },
        })
        .returning();

      if (row === undefined) {
        throw new Error('Reaction upsert did not return a row.');
      }

      return interviewReactionSchema.parse({
        ...row,
        recordedAt: row.recordedAt.toISOString(),
      });
    },

    async getReaction(sessionId) {
      const rows = await database
        .select()
        .from(interviewReactions)
        .where(eq(interviewReactions.sessionId, sessionId))
        .limit(1);

      const row = rows[0];

      return row === undefined
        ? null
        : interviewReactionSchema.parse({
            ...row,
            recordedAt: row.recordedAt.toISOString(),
          });
    },
  };
}

// ── In-memory implementation (tests / offline) ────────────────────────────────

export function createInMemoryInterviewRepository(): InterviewRepository {
  const sessions = new Map<string, StoredSession>();
  const verdictLog: VerdictLogEntry[] = [];
  const reactions = new Map<string, InterviewReaction>();

  return {
    async createSession(state, principalUserId) {
      sessions.set(state.sessionId, {
        state: interviewSessionStateSchema.parse(state),
        principalUserId,
      });
    },

    async updateSession(state) {
      const existing = sessions.get(state.sessionId);

      if (existing === undefined) {
        return;
      }

      sessions.set(state.sessionId, {
        principalUserId: existing.principalUserId,
        state: interviewSessionStateSchema.parse(state),
      });
    },

    async getSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    async deleteSession(sessionId) {
      sessions.delete(sessionId);
    },

    async appendVerdictLog(input) {
      const entry: VerdictLogEntry = {
        ...input,
        id: randomUUID(),
        loggedAt: new Date().toISOString(),
      };
      verdictLog.push(entry);

      return entry;
    },

    async listVerdictLog() {
      // Newest-first, matching the Postgres ordering.
      return [...verdictLog].reverse();
    },

    async saveReaction(input) {
      const reaction = interviewReactionSchema.parse({
        ...input,
        recordedAt: new Date().toISOString(),
      });
      reactions.set(input.sessionId, reaction);

      return reaction;
    },

    async getReaction(sessionId) {
      return reactions.get(sessionId) ?? null;
    },
  };
}

export const interviewRepository: InterviewRepository =
  createPostgresInterviewRepository();
