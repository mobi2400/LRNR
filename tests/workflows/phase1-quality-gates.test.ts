import { describe, expect, it } from 'vitest';

import {
  gateArchitectOutput,
  gateCartographerOutput,
  gateCurriculumOutput,
  gateTeachingOutput,
} from '@/workflows/phase1/quality-gates';
import type { LessonPayload } from '@/schemas/lesson.schema';

const provenance = [{ sourceName: 'Topic brief', sourceUrl: 'lrnr://topic-briefs/1', credibilityTier: 'tier_1' as const }];

const lesson: LessonPayload = {
  sessionId: 'session-1',
  topicSlug: 'agentic-ai',
  title: 'Day 1: RAG',
  objective: 'Explain RAG clearly.',
  mentalModel: 'RAG uses retrieval to bring source evidence into generation before the answer is produced.',
  explanation: [{ heading: 'Core idea', body: 'A RAG flow retrieves relevant evidence first, then uses that evidence to constrain the generated answer.' }],
  diagram: { type: 'description', content: 'query -> retrieve -> answer' },
  codeExamples: [],
  commonMistakes: ['Treating citations as decoration.'],
  reviewQuestions: [{ id: 'q1', question: 'What does retrieval add?', expectedPoints: ['Evidence'], hint: 'Start with sources.' }],
  sourceReferences: [{ label: 'Topic brief', url: 'lrnr://topic-briefs/1' }],
  nextAction: 'Review the source.',
  generatedBy: 'teaching_node',
};

describe('phase 1 quality gates', () => {
  it('blocks thin architect plans that pass schema but cannot drive learning', () => {
    const result = gateArchitectOutput({
      topicBlueprint: {
        topicSlug: 'rag',
        title: 'RAG',
        requiredDepth: 'beginner',
        prerequisiteMap: [],
        conceptOutline: ['retrieval'],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['architect_concepts_too_thin', 'architect_missing_prerequisites']);
  });

  it('blocks cartographer minimal research without limitations', () => {
    const result = gateCartographerOutput({
      knowledgeDocument: {
        sourceInventory: [{ name: 'Topic brief', url: 'lrnr://topic-briefs/1', retrievedAt: new Date().toISOString(), sourceType: 'topic_brief', credibilityTier: 'tier_1', credibilitySignal: 'Internal owner topic brief.', relevantSections: [] }],
        conceptMap: [{ slug: 'retrieval', title: 'Retrieval', summary: 'Find source evidence.', prerequisiteSlugs: [], orderingHint: 0, provenance }],
        claims: [],
        limitations: [],
        codePatterns: [],
        versionNotes: [],
        interviewPatterns: [],
        metadata: { researchQuality: 'minimal', failedSources: [], generatedBy: 'cartographer_node' },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe('cartographer_missing_limitations');
  });

  it('blocks curriculum plans with multiple ready sessions or poor coverage', () => {
    const session = {
      id: 'session-1',
      dayNumber: 1,
      title: 'Day 1',
      status: 'ready' as const,
      phase: 'foundation' as const,
      conceptsToCover: ['retrieval'],
      prerequisites: [],
      masteryObjective: 'Explain retrieval.',
      mentalModel: 'Retrieval finds evidence.',
      explanationPlan: ['Explain retrieval.'],
      examplesPlan: [],
      reviewQuestions: ['What does retrieval add?'],
      sourceRefs: ['lrnr://topic-briefs/1'],
      connectionToPrior: null,
      tomorrowPreview: null,
      evaluationDue: false,
    };

    const result = gateCurriculumOutput({
      roadmap: {
        topicSlug: 'agentic-ai',
        title: 'Agentic AI',
        goal: 'Learn RAG',
        milestones: ['Retrieval', 'Generation'],
        requiredDepth: 'beginner',
        generatedBy: 'curriculum_builder_initial_node',
      },
      sessions: [session, { ...session, id: 'session-2', dayNumber: 2 }],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('curriculum_ready_session_count');
  });

  it('blocks generic teaching lessons without sources', () => {
    const result = gateTeachingOutput({
      lesson: {
        ...lesson,
        mentalModel: 'placeholder text for later',
        explanation: [{ heading: 'Core idea', body: 'todo placeholder text for later' }],
        sourceReferences: [],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['teaching_explanation_too_generic', 'teaching_missing_sources']);
  });

  it('passes a grounded teaching lesson', () => {
    expect(gateTeachingOutput({ lesson }).passed).toBe(true);
  });
});
