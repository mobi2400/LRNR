import type { CurriculumSession } from '@/schemas/curriculum.schema';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';
import { lessonPayloadSchema, type LessonPayload } from '@/schemas/lesson.schema';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readSourceRefs(
  knowledgeBase: TopicKnowledgeBaseRecord,
  session: CurriculumSession,
): Array<{
  label: string;
  url: string;
}> {
  const inventorySources = knowledgeBase.sourceInventory
    .map((item) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = readString(record.name) ?? readString(record.label);
      const url = readString(record.url);

      return label !== null && url !== null ? { label, url } : null;
    })
    .filter((source): source is { label: string; url: string } => source !== null);

  if (inventorySources.length > 0) {
    return inventorySources.slice(0, 4);
  }

  return session.sourceRefs.slice(0, 4).map((url, index) => ({
    label: `Session source ${index + 1}`,
    url,
  }));
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

function buildCodeExamples(session: CurriculumSession, primaryConcept: string) {
  return session.examplesPlan.map((plan, index) => ({
    title:
      index === 0
        ? `${primaryConcept} practice scaffold`
        : `Practice scaffold ${index + 1}`,
    language: 'ts',
    code: `type LearningCheckpoint = {\n  concept: string;\n  canExplainTradeoff: boolean;\n};`,
    explanation: plan,
  }));
}

function buildReviewQuestions(session: CurriculumSession) {
  return session.reviewQuestions.map((question, index) => ({
    id: `${session.id}:review-${index + 1}`,
    question,
    expectedPoints: [
      'Names the core purpose',
      'Connects it to the larger workflow',
      'Mentions one failure mode or tradeoff',
    ],
    hint: 'Answer as if you were teaching someone one day behind you.',
  }));
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
  const sourceReferences = readSourceRefs(input.knowledgeBase, input.session);

  return lessonPayloadSchema.parse({
    sessionId: input.session.id,
    topicSlug: input.topicSlug,
    title: input.session.title,
    objective: input.session.masteryObjective,
    mentalModel: input.session.mentalModel,
    explanation: input.session.explanationPlan.map((body, index) => ({
      heading: index === 0 ? 'Core idea' : `Plan step ${index + 1}`,
      body,
    })),
    diagram: {
      type: 'mermaid',
      content: `flowchart LR\n  A[Goal] --> B[${primaryConcept}]\n  B --> C[Practice]\n  C --> D[Review]`,
    },
    codeExamples: buildCodeExamples(input.session, primaryConcept),
    commonMistakes: [
      `Treating ${primaryConcept} as a memorized term instead of a decision point.`,
      'Skipping the review question before the mental model feels usable.',
    ],
    reviewQuestions: buildReviewQuestions(input.session),
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
