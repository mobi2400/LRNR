import { z } from 'zod';

import type { InterviewVerdict } from '@/schemas/evaluation.schema';

/**
 * Mastery gating for the "learn to mastery, not to 100%" loop.
 *
 * A learning path is not a fixed syllabus that ends at day N — it ends when the
 * learner demonstrates mastery of the goal. This module owns the two decisions
 * that make that real: what the mastery bar *is* at a given depth, and the
 * safety limits that stop the loop from extending forever.
 */

export const MASTERY_DEPTHS = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;
export type MasteryDepth = (typeof MASTERY_DEPTHS)[number];

/** The three demonstrated capabilities an evaluation verdict grades. */
export interface MasteryGrid {
  canSolve: boolean;
  canExplain: boolean;
  canDecide: boolean;
}

/**
 * Safety caps so extension is bounded. A learner who keeps missing the bar on
 * one concept should not be reinforced indefinitely, and no path should grow
 * without limit.
 */
export const MAX_TOTAL_SESSIONS = 20;
export const MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT = 2;

function normalizeDepth(depth: string): MasteryDepth {
  const found = MASTERY_DEPTHS.find((value) => value === depth.trim().toLowerCase());

  return found ?? 'intermediate';
}

/**
 * The bar rises with the goal's required depth: a beginner must be able to
 * explain; an intermediate learner must also be able to solve; advanced and
 * expert goals additionally require being able to decide (judge tradeoffs).
 */
export function masteryBarFor(depth: string): MasteryGrid {
  switch (normalizeDepth(depth)) {
    case 'beginner':
      return { canSolve: false, canExplain: true, canDecide: false };
    case 'intermediate':
      return { canSolve: true, canExplain: true, canDecide: false };
    case 'advanced':
    case 'expert':
      return { canSolve: true, canExplain: true, canDecide: true };
  }
}

/**
 * A verdict clears the bar when it meets every required capability for the depth
 * AND leaves no open, cited gap. Any gap the interview could cite is treated as
 * "not yet mastered" — the loop's whole point is to close those.
 */
export function meetsMasteryBar(
  verdict: Pick<InterviewVerdict, 'masteryGrid' | 'gaps'>,
  depth: string,
): boolean {
  const bar = masteryBarFor(depth);
  const grid = verdict.masteryGrid;
  const gridMet =
    (!bar.canSolve || grid.canSolve) &&
    (!bar.canExplain || grid.canExplain) &&
    (!bar.canDecide || grid.canDecide);

  return gridMet && verdict.gaps.length === 0;
}

// ---------------------------------------------------------------------------
// Per-concept mastery state (persisted in profile.stableMasterySummary)
// ---------------------------------------------------------------------------

export const conceptMasteryLevelSchema = z.enum([
  'unassessed',
  'developing',
  'mastered',
]);
export type ConceptMasteryLevel = z.infer<typeof conceptMasteryLevelSchema>;

export const conceptMasterySchema = z.object({
  level: conceptMasteryLevelSchema.default('unassessed'),
  reinforcementRounds: z.number().int().nonnegative().default(0),
  lastAssessedAt: z.string().datetime().nullable().default(null),
});
export type ConceptMastery = z.infer<typeof conceptMasterySchema>;

export const masterySummarySchema = z.object({
  concepts: z.record(z.string(), conceptMasterySchema).default({}),
  goalMastered: z.boolean().default(false),
});
export type MasterySummary = z.infer<typeof masterySummarySchema>;

/** Tolerant parse of the profile's free-form jsonb into a mastery summary. */
export function readMasterySummary(value: unknown): MasterySummary {
  const parsed = masterySummarySchema.safeParse(value);

  return parsed.success ? parsed.data : { concepts: {}, goalMastered: false };
}

export function reinforcementRoundsFor(
  summary: MasterySummary,
  conceptSlug: string,
): number {
  return summary.concepts[conceptSlug]?.reinforcementRounds ?? 0;
}

/**
 * Whether a concept may be reinforced again, or has hit the per-concept round
 * cap. At the cap the loop stops reinforcing it and reports it as still open
 * rather than looping forever.
 */
export function canReinforce(
  summary: MasterySummary,
  conceptSlug: string,
): boolean {
  return (
    reinforcementRoundsFor(summary, conceptSlug) <
    MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT
  );
}
