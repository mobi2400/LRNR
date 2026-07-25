import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import {
  interviewReactionSchema,
  type InterviewReaction,
} from '@/schemas/evaluation.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/interview-reaction.ts');

/**
 * The interviewee's own reaction to the verdict — "was any of this wrong?" plus
 * an optional note and contact. For unattended (guest-link) sessions this is the
 * only signal about whether the judge got it right that no amount of
 * server-side logging can reconstruct, so it is stored alongside the verdict log
 * and keyed by session for later join into the golden set.
 */

const KEY_PREFIX = 'interview-reaction:';

function storageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

function defaultStore(): KeyValueStore {
  return new RedisKeyValueStore();
}

export type SaveReactionInput = Omit<InterviewReaction, 'recordedAt'>;

export async function saveInterviewReaction(
  input: SaveReactionInput,
  store: KeyValueStore = defaultStore(),
): Promise<InterviewReaction> {
  const reaction = interviewReactionSchema.parse({
    ...input,
    recordedAt: new Date().toISOString(),
  });

  await store.set(storageKey(reaction.sessionId), JSON.stringify(reaction));

  return reaction;
}

export async function getInterviewReaction(
  sessionId: string,
  store: KeyValueStore = defaultStore(),
): Promise<InterviewReaction | null> {
  const raw = await store.get(storageKey(sessionId));

  if (raw === null) {
    return null;
  }

  try {
    return interviewReactionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
