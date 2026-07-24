import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { generateStructured, type StructuredGenerationInput } from '@/lib/llm';
import { serverConfig } from '@/server/config';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import type { ProfileRecord } from '@/db/profile.repo';
import {
  curriculumSessionSchema,
  layer1RoadmapSchema,
  type CurriculumSession,
  type Layer1Roadmap,
} from '@/schemas/curriculum.schema';

/**
 * Structured generator seam. `undefined` -> real LLM in production and
 * deterministic in test/offline; `null` forces deterministic; a function
 * overrides it (tests). Session design never hard-fails: any model error falls
 * back to the deterministic plan.
 */
export type CurriculumGenerator =
  | (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>)
  | null;

function resolveGenerator(
  generate: CurriculumGenerator | undefined,
): (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>) | null {
  if (generate === null) {
    return null;
  }

  if (generate === undefined) {
    return serverConfig.nodeEnv === 'test' ? null : generateStructured;
  }

  return generate;
}

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();

  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

interface InitialCurriculumInput {
  topicBrief: TopicBriefRecord;
  knowledgeBase: TopicKnowledgeBaseRecord;
  profile: ProfileRecord;
}

interface ConceptSeed {
  slug: string;
  title: string;
  orderingHint: number;
  prerequisites: string[];
  sourceRefs: string[];
}

export interface InitialCurriculumPlan {
  roadmap: Layer1Roadmap;
  sessions: CurriculumSession[];
  currentSessionId: string;
  currentSessionIndex: number;
  nextEvaluationDueAt: Date;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return slug.length > 0 ? slug : 'concept';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readPrerequisites(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;

        return readString(record.slug) ?? readString(record.concept) ?? readString(record.title);
      }

      return null;
    })
    .filter((item): item is string => item !== null);
}

function readSourceRefs(record: Record<string, unknown>): string[] {
  const provenance = Array.isArray(record.provenance) ? record.provenance : [];

  return provenance
    .map((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      return readString((entry as Record<string, unknown>).sourceUrl);
    })
    .filter((url): url is string => url !== null);
}

function readConceptSeeds(knowledgeBase: TopicKnowledgeBaseRecord): ConceptSeed[] {
  return knowledgeBase.conceptMap
    .map((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const title = readString(record.title) ?? readString(record.name);
      const slug = readString(record.slug) ?? (title === null ? null : slugify(title));

      if (slug === null || title === null) {
        return null;
      }

      return {
        slug,
        title,
        orderingHint: typeof record.orderingHint === 'number' ? record.orderingHint : index,
        prerequisites: readPrerequisites(record.prerequisites),
        sourceRefs: readSourceRefs(record),
      };
    })
    .filter((concept): concept is ConceptSeed => concept !== null)
    .sort((left, right) => left.orderingHint - right.orderingHint || left.title.localeCompare(right.title));
}

function fallbackConceptSeeds(topicBrief: TopicBriefRecord): ConceptSeed[] {
  return topicBrief.conceptOutline
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          slug: slugify(item),
          title: item,
          orderingHint: index,
          prerequisites: [],
          sourceRefs: [`lrnr://topic-briefs/${topicBrief.id}`],
        };
      }

      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const title = readString(record.title) ?? readString(record.name) ?? readString(record.concept);
        const slug = readString(record.slug) ?? (title === null ? null : slugify(title));

        if (title !== null && slug !== null) {
          return {
            slug,
            title,
            orderingHint: typeof record.orderingHint === 'number' ? record.orderingHint : index,
            prerequisites: readPrerequisites(record.prerequisites),
            sourceRefs: [`lrnr://topic-briefs/${topicBrief.id}`],
          };
        }
      }

      return null;
    })
    .filter((concept): concept is ConceptSeed => concept !== null)
    .sort((left, right) => left.orderingHint - right.orderingHint || left.title.localeCompare(right.title));
}

function choosePhase(index: number, total: number): CurriculumSession['phase'] {
  if (index === 0) {
    return 'foundation';
  }

  if (index === total - 1) {
    return 'review';
  }

  if (index < Math.ceil(total * 0.45)) {
    return 'core';
  }

  if (index < Math.ceil(total * 0.75)) {
    return 'practice';
  }

  return 'production';
}

function buildMentalModel(concept: ConceptSeed, topicBrief: TopicBriefRecord): string {
  return `${concept.title} is one moving part in the path toward ${topicBrief.goal}. Learn what it controls, what it depends on, and what breaks when it is misunderstood.`;
}

function buildSessions(
  concepts: ConceptSeed[],
  topicBrief: TopicBriefRecord,
  profile: ProfileRecord,
): CurriculumSession[] {
  const timePreference = readString(
    (profile.learnerPreferences as Record<string, unknown>).timePerSession,
  );

  return concepts.map((concept, index) => {
    const nextConcept = concepts[index + 1] ?? null;
    const priorConcept = concepts[index - 1] ?? null;

    return curriculumSessionSchema.parse({
      id: randomUUID(),
      dayNumber: index + 1,
      title: `Day ${index + 1}: ${concept.title}`,
      status: index === 0 ? 'ready' : 'planned',
      phase: choosePhase(index, concepts.length),
      conceptsToCover: [concept.slug],
      prerequisites: concept.prerequisites,
      masteryObjective: `Explain ${concept.title} clearly and connect it to ${topicBrief.title}.`,
      mentalModel: buildMentalModel(concept, topicBrief),
      explanationPlan: [
        `Define ${concept.title} using the learner goal as context.`,
        priorConcept === null
          ? 'Establish the foundation vocabulary for later sessions.'
          : `Connect it back to ${priorConcept.title}.`,
        timePreference === null
          ? 'Close with one self-check question.'
          : `Keep the lesson paced for the learner preference: ${timePreference}.`,
      ],
      examplesPlan: [
        `Use one concrete ${topicBrief.topicSlug} scenario.`,
        'Include a small typed or visual checkpoint when relevant.',
      ],
      reviewQuestions: [
        `What problem does ${concept.title} solve?`,
        `What is one failure mode or misconception around ${concept.title}?`,
      ],
      sourceRefs: concept.sourceRefs,
      connectionToPrior:
        priorConcept === null ? null : `Builds on ${priorConcept.title}.`,
      tomorrowPreview:
        nextConcept === null ? null : `Next session introduces ${nextConcept.title}.`,
      evaluationDue: (index + 1) % 3 === 0,
    });
  });
}

function calculateFirstEvaluationDueAt(now = new Date()): Date {
  return new Date(now.getTime() + 1000 * 60 * 60 * 24 * 2);
}

// ---------------------------------------------------------------------------
// LLM-designed session plan
// ---------------------------------------------------------------------------

const sessionDesignSchema = z.object({
  sessions: z
    .array(
      z.object({
        conceptSlug: z.string().trim().min(1),
        title: z.string().trim().min(1),
        masteryObjective: z.string().trim().min(1),
        mentalModel: z.string().trim().min(1),
        explanationPlan: z.array(z.string().trim().min(1)).min(1),
        examplesPlan: z.array(z.string().trim().min(1)).min(1),
        reviewQuestions: z.array(z.string().trim().min(1)).min(2),
        connectionToPrior: z.string().trim().min(1).nullable().default(null),
        tomorrowPreview: z.string().trim().min(1).nullable().default(null),
      }),
    )
    .min(1),
});

const curriculumSystemPrompt = `You are LRNR's Curriculum Builder.
Design a personalized, ordered learning path for one learner from a validated concept map.

Rules:
- Teach in the order: fundamentals -> architecture -> under the hood -> production reality -> tradeoffs.
- Each session covers exactly one concept from the supplied concept map (reuse its slug).
- Write a concrete mastery objective, a memorable mental model, an explanation plan (2-4 steps), an examples plan, and 2-3 reasoning review questions.
- The explanation plan must be teaching direction, never lesson prose, and never generic ("define X").
- Connect each session to the prior one and preview the next.
- Adapt to the learner's stated preferences and background.
- Return one JSON object, no markdown fence.`;

function buildCurriculumPrompt(
  concepts: ConceptSeed[],
  topicBrief: TopicBriefRecord,
  knowledgeBase: TopicKnowledgeBaseRecord,
  profile: ProfileRecord,
): string {
  const claims = knowledgeBase.claims
    .map((item) => (item as Record<string, unknown>).claim)
    .filter((claim): claim is string => typeof claim === 'string')
    .slice(0, 12);

  return `Goal: ${topicBrief.goal}
Topic: ${topicBrief.title}
Required depth: ${topicBrief.requiredDepth}
Learner preferences: ${JSON.stringify(profile.learnerPreferences)}
Learner weak areas: ${JSON.stringify(profile.activeMisconceptions ?? [])}

Concepts to sequence (use these exact slugs, one session each, in a sound learning order):
${concepts.map((concept) => `- ${concept.slug}: ${concept.title}`).join('\n')}

Grounded claims from research (context, do not quote verbatim):
${claims.map((claim) => `- ${claim}`).join('\n')}

Return JSON: { "sessions": [{ "conceptSlug": "exact slug", "title": "...", "masteryObjective": "...", "mentalModel": "...", "explanationPlan": ["..."], "examplesPlan": ["..."], "reviewQuestions": ["...","..."], "connectionToPrior": "... or null", "tomorrowPreview": "... or null" }] }`;
}

async function designSessionsWithModel(
  concepts: ConceptSeed[],
  topicBrief: TopicBriefRecord,
  knowledgeBase: TopicKnowledgeBaseRecord,
  profile: ProfileRecord,
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<CurriculumSession[]> {
  const design = await generate({
    label: 'curriculum_builder_sessions',
    system: curriculumSystemPrompt,
    prompt: buildCurriculumPrompt(concepts, topicBrief, knowledgeBase, profile),
    schema: sessionDesignSchema,
    temperature: 0.3,
    maxTokens: 10_000,
  });
  const bySlug = new Map(
    design.sessions.map((session) => [slugify(session.conceptSlug), session]),
  );

  // Every concept must be designed; a partial plan falls back to deterministic.
  return concepts.map((concept, index) => {
    const designed = bySlug.get(concept.slug);

    if (designed === undefined) {
      throw new Error('Curriculum design did not cover every concept.');
    }

    const nextConcept = concepts[index + 1] ?? null;
    const priorConcept = concepts[index - 1] ?? null;

    return curriculumSessionSchema.parse({
      id: randomUUID(),
      dayNumber: index + 1,
      title: truncate(designed.title, 255),
      status: index === 0 ? 'ready' : 'planned',
      phase: choosePhase(index, concepts.length),
      conceptsToCover: [concept.slug],
      prerequisites: concept.prerequisites,
      masteryObjective: truncate(designed.masteryObjective, 1000),
      mentalModel: truncate(designed.mentalModel, 1200),
      explanationPlan: designed.explanationPlan
        .map((step) => truncate(step, 1000))
        .slice(0, 6),
      examplesPlan: designed.examplesPlan
        .map((step) => truncate(step, 1000))
        .slice(0, 6),
      reviewQuestions: designed.reviewQuestions
        .map((question) => truncate(question, 1000))
        .slice(0, 6),
      sourceRefs: concept.sourceRefs,
      connectionToPrior:
        designed.connectionToPrior !== null
          ? truncate(designed.connectionToPrior, 1000)
          : priorConcept === null
            ? null
            : `Builds on ${priorConcept.title}.`,
      tomorrowPreview:
        designed.tomorrowPreview !== null
          ? truncate(designed.tomorrowPreview, 1000)
          : nextConcept === null
            ? null
            : `Next session introduces ${nextConcept.title}.`,
      evaluationDue: (index + 1) % 3 === 0,
    });
  });
}

export async function buildInitialCurriculumPlan(
  { topicBrief, knowledgeBase, profile }: InitialCurriculumInput,
  generate?: CurriculumGenerator,
): Promise<InitialCurriculumPlan> {
  const conceptSeeds = readConceptSeeds(knowledgeBase);
  const usableConcepts =
    conceptSeeds.length > 0 ? conceptSeeds : fallbackConceptSeeds(topicBrief);
  const resolved = resolveGenerator(generate);
  let sessions: CurriculumSession[];

  if (resolved === null) {
    sessions = buildSessions(usableConcepts, topicBrief, profile);
  } else {
    try {
      sessions = await designSessionsWithModel(
        usableConcepts,
        topicBrief,
        knowledgeBase,
        profile,
        resolved,
      );
    } catch {
      sessions = buildSessions(usableConcepts, topicBrief, profile);
    }
  }

  const firstSession = sessions[0];

  if (firstSession === undefined) {
    throw new Error('Curriculum Builder cannot create sessions without concepts.');
  }

  const roadmap = layer1RoadmapSchema.parse({
    topicSlug: topicBrief.topicSlug,
    title: topicBrief.title,
    goal: topicBrief.goal,
    milestones: usableConcepts.map((concept) => concept.title),
    requiredDepth: topicBrief.requiredDepth,
    generatedBy: 'curriculum_builder_initial_node',
  });

  return {
    roadmap,
    sessions,
    currentSessionId: firstSession.id,
    currentSessionIndex: 0,
    nextEvaluationDueAt: calculateFirstEvaluationDueAt(),
  };
}
