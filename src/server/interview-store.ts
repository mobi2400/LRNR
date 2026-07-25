import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { assertServerOnly } from '@/utils/server-only';
import {
  interviewSessionStateSchema,
  type InterviewSessionState,
} from '@/schemas/evaluation.schema';

assertServerOnly('src/server/interview-store.ts');

/**
 * Durable home for in-flight and completed interview sessions. Backed by the
 * KeyValueStore abstraction so it uses Redis in production and an in-memory
 * store under test — the same seam guest links use. The evaluation agent owns
 * turn logic; this module only persists and reloads the authoritative state
 * between HTTP requests, and it is where the completed verdict is logged
 * server-side.
 */

// Sessions outlive a single request but are not permanent: an abandoned
// interview should not linger forever. Long enough to finish a real session.
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'interview-session:';

function storageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

function defaultStore(): KeyValueStore {
  return new RedisKeyValueStore();
}

export interface InterviewStoreOptions {
  store?: KeyValueStore;
  ttlMs?: number;
}

/**
 * Persists the authoritative session state. Re-validates before writing so a
 * corrupt in-memory object can never be committed — the store only ever holds
 * schema-valid state.
 */
export async function saveInterviewSession(
  state: InterviewSessionState,
  options: InterviewStoreOptions = {},
): Promise<void> {
  const store = options.store ?? defaultStore();
  const validated = interviewSessionStateSchema.parse(state);

  await store.set(storageKey(validated.sessionId), JSON.stringify(validated), {
    ttlMs: options.ttlMs ?? DEFAULT_SESSION_TTL_MS,
  });
}

/**
 * Loads a session by id. Returns null for an unknown, expired, or unparseable
 * session — the caller treats all three as "no such session" and never trusts
 * partially-decoded state.
 */
export async function loadInterviewSession(
  sessionId: string,
  store: KeyValueStore = defaultStore(),
): Promise<InterviewSessionState | null> {
  const raw = await store.get(storageKey(sessionId));

  if (raw === null) {
    return null;
  }

  try {
    return interviewSessionStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Removes a session from the store. Idempotent: deleting twice is harmless. */
export async function deleteInterviewSession(
  sessionId: string,
  store: KeyValueStore = defaultStore(),
): Promise<void> {
  await store.delete(storageKey(sessionId));
}
