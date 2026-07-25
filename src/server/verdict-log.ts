import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { interviewVerdictSchema } from '@/schemas/evaluation.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/verdict-log.ts');

/**
 * Append-only record of every completed interview verdict, kept server-side so
 * the golden set (calibration) can be assembled from real sessions later. It
 * deliberately logs "no verdict produced" completions too: a session where the
 * judge degraded on every turn is the single most useful calibration signal,
 * and it is exactly the case a success-only log would silently drop.
 *
 * Storage note: this is a single-user learning OS, so the index is a plain
 * read-modify-write JSON array. That is not safe under concurrent writers; if
 * this ever becomes multi-writer it should move to a real append structure
 * (Redis list / a table).
 */

const ENTRY_PREFIX = 'verdict-log:entry:';
const INDEX_KEY = 'verdict-log:index';

const verdictLogEntrySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  topicSlug: z.string().min(1),
  principalUserId: z.string().min(1),
  loggedAt: z.string().datetime(),
  totalTurns: z.number().int().nonnegative(),
  scoredTurns: z.number().int().nonnegative(),
  unscoredTurns: z.number().int().nonnegative(),
  // null captures a completion that produced no verdict — kept on purpose.
  verdict: interviewVerdictSchema.nullable(),
});

export type VerdictLogEntry = z.infer<typeof verdictLogEntrySchema>;

const indexSchema = z.array(z.string().uuid());

export type AppendVerdictLogInput = Omit<VerdictLogEntry, 'id' | 'loggedAt'>;

function defaultStore(): KeyValueStore {
  return new RedisKeyValueStore();
}

async function readIndex(store: KeyValueStore): Promise<string[]> {
  const raw = await store.get(INDEX_KEY);

  if (raw === null) {
    return [];
  }

  try {
    return indexSchema.parse(JSON.parse(raw));
  } catch {
    // A corrupt index must not wedge future writes; start a fresh one.
    return [];
  }
}

export async function appendVerdictLog(
  input: AppendVerdictLogInput,
  store: KeyValueStore = defaultStore(),
): Promise<VerdictLogEntry> {
  const entry = verdictLogEntrySchema.parse({
    ...input,
    id: randomUUID(),
    loggedAt: new Date().toISOString(),
  });

  await store.set(`${ENTRY_PREFIX}${entry.id}`, JSON.stringify(entry));

  const index = await readIndex(store);
  index.push(entry.id);
  await store.set(INDEX_KEY, JSON.stringify(index));

  return entry;
}

/**
 * Reads the log newest-first. Entries whose payload is missing or corrupt are
 * skipped rather than throwing, so one bad row cannot hide the rest.
 */
export async function listVerdictLog(
  store: KeyValueStore = defaultStore(),
): Promise<VerdictLogEntry[]> {
  const index = await readIndex(store);
  const entries: VerdictLogEntry[] = [];

  for (const id of [...index].reverse()) {
    const raw = await store.get(`${ENTRY_PREFIX}${id}`);

    if (raw === null) {
      continue;
    }

    try {
      entries.push(verdictLogEntrySchema.parse(JSON.parse(raw)));
    } catch {
      continue;
    }
  }

  return entries;
}
