import { randomUUID } from 'node:crypto';

import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import type { ProfileRecord } from '@/db/profile.repo';
import {
  curriculumSessionSchema,
  layer1RoadmapSchema,
  type CurriculumSession,
  type Layer1Roadmap,
} from '@/schemas/curriculum.schema';

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

export function buildInitialCurriculumPlan({
  topicBrief,
  knowledgeBase,
  profile,
}: InitialCurriculumInput): InitialCurriculumPlan {
  const conceptSeeds = readConceptSeeds(knowledgeBase);
  const usableConcepts =
    conceptSeeds.length > 0 ? conceptSeeds : fallbackConceptSeeds(topicBrief);
  const sessions = buildSessions(usableConcepts, topicBrief, profile);
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
