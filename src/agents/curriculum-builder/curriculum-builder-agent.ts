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
  sourceRefs: string[];
}

export interface InitialCurriculumPlan {
  roadmap: Layer1Roadmap;
  sessions: CurriculumSession[];
  currentSessionId: string;
  currentSessionIndex: number;
  nextEvaluationDueAt: Date;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readConceptSeeds(knowledgeBase: TopicKnowledgeBaseRecord): ConceptSeed[] {
  const concepts = knowledgeBase.conceptMap
    .map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const slug = typeof record.slug === 'string' ? record.slug : null;
      const title = typeof record.title === 'string' ? record.title : slug;

      if (slug === null || title === null) {
        return null;
      }

      const provenance = Array.isArray(record.provenance)
        ? record.provenance
            .map((entry) =>
              entry !== null &&
              typeof entry === 'object' &&
              !Array.isArray(entry) &&
              typeof (entry as Record<string, unknown>).sourceUrl === 'string'
                ? String((entry as Record<string, unknown>).sourceUrl)
                : null,
            )
            .filter((url): url is string => url !== null)
        : [];

      return {
        slug,
        title,
        orderingHint:
          typeof record.orderingHint === 'number' ? record.orderingHint : 999,
        sourceRefs: provenance,
      };
    })
    .filter((concept): concept is ConceptSeed => concept !== null)
    .sort((left, right) => left.orderingHint - right.orderingHint);

  return concepts;
}

function fallbackConceptSeeds(topicBrief: TopicBriefRecord): ConceptSeed[] {
  return readStringArray(topicBrief.conceptOutline).map((concept, index) => ({
    slug: concept.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: concept,
    orderingHint: index,
    sourceRefs: [`lrnr://topic-briefs/${topicBrief.id}`],
  }));
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

function buildSessions(concepts: ConceptSeed[]): CurriculumSession[] {
  return concepts.map((concept, index) => {
    const nextConcept = concepts[index + 1] ?? null;

    return curriculumSessionSchema.parse({
      id: randomUUID(),
      dayNumber: index + 1,
      title: `Day ${index + 1}: ${concept.title}`,
      status: index === 0 ? 'ready' : 'planned',
      phase: choosePhase(index, concepts.length),
      conceptsToCover: [concept.slug],
      masteryObjective: `Explain ${concept.title} clearly and connect it to the overall topic goal.`,
      sourceRefs: concept.sourceRefs,
      connectionToPrior:
        index === 0
          ? null
          : `Builds on ${concepts[index - 1]?.title ?? 'the previous concept'}.`,
      tomorrowPreview:
        nextConcept === null ? null : `Next session introduces ${nextConcept.title}.`,
      evaluationDue: (index + 1) % 3 === 0,
    });
  });
}

export function buildInitialCurriculumPlan({
  topicBrief,
  knowledgeBase,
}: InitialCurriculumInput): InitialCurriculumPlan {
  const conceptSeeds = readConceptSeeds(knowledgeBase);
  const usableConcepts =
    conceptSeeds.length > 0 ? conceptSeeds : fallbackConceptSeeds(topicBrief);
  const sessions = buildSessions(usableConcepts);
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
    nextEvaluationDueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
  };
}
