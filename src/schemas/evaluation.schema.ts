import { z } from 'zod';

export const masteryLevelSchema = z.enum(['can_solve', 'can_explain', 'can_decide']);
export type MasteryLevel = z.infer<typeof masteryLevelSchema>;

export const interviewStatusSchema = z.enum([
  'awaiting_answer',
  'judging',
  'completed',
  'abandoned',
]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const gapFindingSchema = z.object({
  claim: z.string().min(1),
  evidence: z.string().min(1),
  sourceUri: z.string().url(),
  masteryLevel: masteryLevelSchema,
});
export type GapFinding = z.infer<typeof gapFindingSchema>;

export const interviewTurnSchema = z.object({
  turnIndex: z.number().int().nonnegative(),
  probe: z.string().min(1),
  answer: z.string(),
  startedAt: z.string().datetime(),
  answeredAt: z.string().datetime().nullable(),
  verdict: z.string().nullable(),
  gapFindings: z.array(gapFindingSchema),
  unscored: z.boolean().default(false),
  skipped: z.boolean().default(false),
});
export type InterviewTurn = z.infer<typeof interviewTurnSchema>;

export const interviewVerdictSchema = z.object({
  headline: z.string().min(1),
  gaps: z.array(gapFindingSchema),
  masteryGrid: z.object({
    canSolve: z.boolean(),
    canExplain: z.boolean(),
    canDecide: z.boolean(),
  }),
  partialCoverage: z.string().nullable(),
});
export type InterviewVerdict = z.infer<typeof interviewVerdictSchema>;

// ── API request contracts ─────────────────────────────────────────────────────

export const redeemGuestLinkRequestSchema = z.object({
  token: z.string().uuid(),
});
export type RedeemGuestLinkRequest = z.infer<typeof redeemGuestLinkRequestSchema>;

export const startInterviewRequestSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255),
  turnCap: z.number().int().positive().max(20).optional(),
});
export type StartInterviewRequest = z.infer<typeof startInterviewRequestSchema>;

export const answerInterviewRequestSchema = z.object({
  sessionId: z.string().uuid(),
  // Empty string is allowed: it records a deliberate skip.
  answer: z.string().max(20_000),
});
export type AnswerInterviewRequest = z.infer<typeof answerInterviewRequestSchema>;

export const interviewReactionRequestSchema = z.object({
  // The one question the verdict screen asks: "was any of this wrong?"
  wasAnythingWrong: z.boolean(),
  note: z.string().trim().max(4000).optional(),
  // Optional way to reach an unattended interviewee for follow-up.
  contact: z.string().trim().max(320).optional(),
});
export type InterviewReactionRequest = z.infer<
  typeof interviewReactionRequestSchema
>;

export const interviewReactionSchema = z.object({
  sessionId: z.string().uuid(),
  principalUserId: z.string().min(1),
  wasAnythingWrong: z.boolean(),
  note: z.string().nullable(),
  contact: z.string().nullable(),
  recordedAt: z.string().datetime(),
});
export type InterviewReaction = z.infer<typeof interviewReactionSchema>;

export const interviewSessionStateSchema = z.object({
  sessionId: z.string().uuid(),
  topicSlug: z.string().min(1),
  status: interviewStatusSchema,
  turns: z.array(interviewTurnSchema),
  turnCap: z.number().int().positive(),
  currentProbe: z.string().nullable(),
  detectedGaps: z.array(gapFindingSchema),
  verdictSummary: interviewVerdictSchema.nullable(),
});
export type InterviewSessionState = z.infer<typeof interviewSessionStateSchema>;
