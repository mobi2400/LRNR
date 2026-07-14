import { z } from 'zod';

export const phase1EvalSnapshotSchema = z.object({
  onboardingQuestionCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  conceptCount: z.number().int().nonnegative(),
  curriculumSessionCount: z.number().int().nonnegative(),
  lessonHasGrounding: z.boolean(),
  deliveryOutboxHasUniqueKey: z.boolean(),
});

export const phase1EvalResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      name: z.string().trim().min(1),
      passed: z.boolean(),
      message: z.string().trim().min(1),
    }),
  ),
});

export type Phase1EvalSnapshot = z.infer<typeof phase1EvalSnapshotSchema>;
export type Phase1EvalResult = z.infer<typeof phase1EvalResultSchema>;

export function runPhase1Eval(snapshot: Phase1EvalSnapshot): Phase1EvalResult {
  const validated = phase1EvalSnapshotSchema.parse(snapshot);
  const checks = [
    {
      name: 'architect_onboarding',
      passed: validated.onboardingQuestionCount > 0,
      message: 'Architect onboarding produced at least one owner question.',
    },
    {
      name: 'cartographer_grounding',
      passed: validated.sourceCount > 0 && validated.conceptCount > 0,
      message: 'Cartographer output includes sources and concepts.',
    },
    {
      name: 'curriculum_sessions',
      passed: validated.curriculumSessionCount > 0,
      message: 'Curriculum builder produced usable learning sessions.',
    },
    {
      name: 'teaching_grounding',
      passed: validated.lessonHasGrounding,
      message: 'Teaching lesson is grounded in persisted topic knowledge.',
    },
    {
      name: 'duplicate_delivery_guard',
      passed: validated.deliveryOutboxHasUniqueKey,
      message: 'Delivery outbox has a stable unique key for idempotent alerts.',
    },
  ];

  return phase1EvalResultSchema.parse({
    passed: checks.every((check) => check.passed),
    checks,
  });
}
