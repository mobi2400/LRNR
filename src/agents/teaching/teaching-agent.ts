import type { CurriculumSession } from '@/schemas/curriculum.schema';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import { lessonPayloadSchema, type LessonPayload } from '@/schemas/lesson.schema';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readSourceRefs(knowledgeBase: TopicKnowledgeBaseRecord): Array<{
  label: string;
  url: string;
}> {
  return knowledgeBase.sourceInventory
    .map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = readString(record.name) ?? readString(record.label);
      const url = readString(record.url);

      return label !== null && url !== null ? { label, url } : null;
    })
    .filter((source): source is { label: string; url: string } => source !== null)
    .slice(0, 4);
}

function findConceptTitle(
  knowledgeBase: TopicKnowledgeBaseRecord,
  conceptSlug: string,
): string {
  const match = knowledgeBase.conceptMap.find((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }

    return (item as Record<string, unknown>).slug === conceptSlug;
  });

  if (match !== undefined && match !== null && typeof match === 'object') {
    const title = readString((match as Record<string, unknown>).title);

    if (title !== null) {
      return title;
    }
  }

  return conceptSlug.replace(/-/g, ' ');
}

export function createLessonPayload(input: {
  topicSlug: string;
  session: CurriculumSession;
  knowledgeBase: TopicKnowledgeBaseRecord;
}): LessonPayload {
  const conceptTitles = input.session.conceptsToCover.map((conceptSlug) =>
    findConceptTitle(input.knowledgeBase, conceptSlug),
  );
  const primaryConcept = conceptTitles[0] ?? input.session.title;
  const sourceReferences = readSourceRefs(input.knowledgeBase);

  return lessonPayloadSchema.parse({
    sessionId: input.session.id,
    topicSlug: input.topicSlug,
    title: input.session.title,
    objective: input.session.masteryObjective,
    mentalModel: `${primaryConcept} is easiest to learn as a moving part in the full ${input.topicSlug} workflow, not as an isolated definition.`,
    explanation: [
      {
        heading: 'Core idea',
        body: `Today focuses on ${conceptTitles.join(', ')}. Start by naming what the concept controls, what inputs it needs, and what can go wrong when it is missing.`,
      },
      {
        heading: 'How to reason about it',
        body: input.session.connectionToPrior ?? 'This is the first session, so use it to build the vocabulary for later tradeoffs.',
      },
    ],
    diagram: {
      type: 'mermaid',
      content: `flowchart LR\n  A[Goal] --> B[${primaryConcept}]\n  B --> C[Practice]\n  C --> D[Review]`,
    },
    codeExamples: [
      {
        title: `${primaryConcept} practice scaffold`,
        language: 'ts',
        code: `type LearningCheckpoint = {\n  concept: string;\n  canExplainTradeoff: boolean;\n};`,
        explanation:
          'Use a small typed checkpoint to force the idea into a concrete, testable shape.',
      },
    ],
    commonMistakes: [
      `Treating ${primaryConcept} as a memorized term instead of a decision point.`,
      'Skipping the review question before the mental model feels usable.',
    ],
    reviewQuestions: [
      {
        id: `${input.session.id}:explain`,
        question: `Explain ${primaryConcept} in your own words without using the lesson text.`,
        expectedPoints: [
          'Names the core purpose',
          'Connects it to the larger workflow',
          'Mentions one failure mode or tradeoff',
        ],
        hint: 'Answer as if you were teaching someone one day behind you.',
      },
      {
        id: `${input.session.id}:apply`,
        question: `Where would ${primaryConcept} show up in a real project?`,
        expectedPoints: [
          'Gives a concrete scenario',
          'Explains why the concept matters there',
        ],
        hint: 'Use a small system or feature you can picture clearly.',
      },
    ],
    sourceReferences,
    nextAction:
      input.session.tomorrowPreview ??
      'Move to review and check whether the concept is explainable without notes.',
    generatedBy: 'teaching_node',
  });
}

export function createCompactSessionSummary(input: {
  lesson: LessonPayload;
  status: 'delivered' | 'completed';
  notes?: string;
}): string {
  const reviewQuestions = input.lesson.reviewQuestions
    .map((question) => question.question)
    .join(' | ');

  return [
    `Session ${input.lesson.sessionId} ${input.status}.`,
    `Taught: ${input.lesson.title}.`,
    `Concepts: ${input.lesson.objective}`,
    `Likely weak points: ${input.lesson.commonMistakes.join('; ')}`,
    `Review questions: ${reviewQuestions}`,
    input.notes === undefined ? null : `Owner notes: ${input.notes}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
}
