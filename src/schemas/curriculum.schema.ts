import { z } from 'zod';

export const curriculumPhaseSchema = z.enum([
  'foundation',
  'core',
  'practice',
  'production',
  'review',
]);

export const curriculumSessionSchema = z.object({
  id: z.string().trim().min(1),
  dayNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  status: z.enum(['planned', 'ready', 'delivered', 'completed', 'skipped', 'rescheduled']),
  phase: curriculumPhaseSchema,
  conceptsToCover: z.array(z.string().trim().min(1).max(255)).min(1).max(3),
  prerequisites: z.array(z.string().trim().min(1).max(255)).default([]),
  masteryObjective: z.string().trim().min(1).max(1000),
  mentalModel: z
    .string()
    .trim()
    .min(1)
    .max(1200)
    .default('Build a usable mental model before moving to examples.'),
  explanationPlan: z
    .array(z.string().trim().min(1).max(1000))
    .min(1)
    .default(['Explain the core idea, then connect it to one concrete scenario.']),
  examplesPlan: z.array(z.string().trim().min(1).max(1000)).default([]),
  reviewQuestions: z
    .array(z.string().trim().min(1).max(1000))
    .min(1)
    .default(['Explain the concept in your own words and name one tradeoff.']),
  sourceRefs: z.array(z.string().trim().min(1).max(2048)).default([]),
  connectionToPrior: z.string().trim().min(1).max(1000).nullable(),
  tomorrowPreview: z.string().trim().min(1).max(1000).nullable(),
  evaluationDue: z.boolean().default(false),
  lesson: z.unknown().optional(),
});

export const layer1RoadmapSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  goal: z.string().trim().min(1).max(4000),
  milestones: z.array(z.string().trim().min(1).max(255)).min(1),
  requiredDepth: z.string().trim().min(1).max(255),
  generatedBy: z.literal('curriculum_builder_initial_node'),
});

export const curriculumMapResponseSchema = z.object({
  topicSlug: z.string().trim().min(1).max(255).nullable(),
  roadmap: layer1RoadmapSchema.nullable(),
  sessions: z.array(
    z.object({
      sessionId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      status: z.string().trim().min(1),
      phase: curriculumPhaseSchema,
      concepts: z.array(z.string().trim().min(1)),
    }),
  ),
  currentSessionId: z.string().trim().min(1).nullable(),
  revision: z.number().int().positive().nullable().optional(),
});

export type CurriculumSession = z.infer<typeof curriculumSessionSchema>;
export type Layer1Roadmap = z.infer<typeof layer1RoadmapSchema>;
export type CurriculumMapResponse = z.infer<typeof curriculumMapResponseSchema>;
