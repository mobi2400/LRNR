import { randomUUID } from 'node:crypto';

import {
  architectOnboardingStateSchema,
  type ArchitectOnboardingState,
  type OnboardingQuestion,
  type OnboardingTopicBlueprint,
  type OnboardingTurn,
  type PreferredDepth,
} from '@/schemas/onboarding.schema';

interface StartOnboardingInput {
  goal: string;
  background?: string;
  preferredDepth?: PreferredDepth;
  onboardingId?: string;
}

export interface CompletionSummary {
  state: ArchitectOnboardingState;
  topicBlueprint: OnboardingTopicBlueprint;
  motivation: string | null;
  priorAttempts: string | null;
  dailyConstraint: string | null;
}

export interface ProgressResult {
  state: ArchitectOnboardingState;
  completed: boolean;
  completionSummary: CompletionSummary | null;
}

export interface PlannedRagSeedEntry {
  eventType:
    | 'onboarding_response'
    | 'gap_detected'
    | 'misconception_detected';
  content: string;
  metadata: Record<string, unknown>;
  idempotencySuffix: string;
}

const topicProfiles: Array<{
  match: RegExp;
  title: string;
  prerequisites: string[];
  concepts: string[];
  probeQuestion: string;
}> = [
  {
    match: /\b(agent|rag|llm|langchain|langgraph|ai)\b/i,
    title: 'Agentic AI Foundations',
    prerequisites: ['python', 'apis', 'async programming', 'llm basics'],
    concepts: [
      'language models',
      'retrieval augmented generation',
      'tool use',
      'agent state',
      'evaluation and guardrails',
    ],
    probeQuestion:
      'Imagine you had to explain the difference between a plain LLM call and a RAG or agent workflow. What changes between them, and why?',
  },
  {
    match: /\breact|next|frontend|typescript|javascript\b/i,
    title: 'Modern TypeScript Frontend Engineering',
    prerequisites: ['html and css', 'javascript fundamentals', 'component state'],
    concepts: [
      'component architecture',
      'server and client boundaries',
      'async data flow',
      'typing and validation',
    ],
    probeQuestion:
      'If a page loads data slowly, how would you reason about what belongs on the server, what belongs on the client, and where bugs usually appear?',
  },
  {
    match: /\b(postgres|sql|database|drizzle|prisma)\b/i,
    title: 'Practical Database Engineering',
    prerequisites: ['data modeling', 'sql basics', 'transactions'],
    concepts: [
      'schema design',
      'query safety',
      'indexes',
      'ownership and authorization',
    ],
    probeQuestion:
      'Suppose two requests update related rows at the same time. What risks would you watch for, and how would you keep the write safe?',
  },
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return 'Learning Goal';
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function toSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'learning-goal'
  );
}

function findTopicProfile(goal: string) {
  return (
    topicProfiles.find((profile) => profile.match.test(goal)) ?? {
      title: toSentenceCase(goal).slice(0, 255),
      prerequisites: ['core vocabulary', 'working examples', 'practice routine'],
      concepts: ['mental model', 'core workflow', 'common mistakes', 'practice plan'],
      probeQuestion:
        'Walk me through how you currently think this topic works. Where does the process feel clear, and where does it still feel fuzzy?',
    }
  );
}

function buildQuestions(goal: string): OnboardingQuestion[] {
  const topicProfile = findTopicProfile(goal);

  return [
    {
      id: 'motivation',
      kind: 'motivation',
      question:
        'What outcome are you trying to reach with this goal, and why does it matter right now?',
    },
    {
      id: 'background',
      kind: 'background',
      question:
        'What experience, projects, or study have you already done that feels relevant here?',
    },
    {
      id: 'probe',
      kind: 'probe',
      question: topicProfile.probeQuestion,
    },
    {
      id: 'constraints',
      kind: 'constraints',
      question:
        'What have you already tried, what got stuck, and how much focused time can you realistically give this most days?',
    },
  ];
}

function extractSignals(answer: string): {
  inferredBackground: string[];
  strengths: string[];
  weakAreas: string[];
  misconceptions: string[];
  tags: string[];
} {
  const normalized = answer.toLowerCase();
  const strengths: string[] = [];
  const weakAreas: string[] = [];
  const misconceptions: string[] = [];
  const inferredBackground: string[] = [];
  const tags: string[] = [];

  if (/\b(build|built|shipped|used|implemented|worked on)\b/.test(normalized)) {
    strengths.push('Has hands-on project exposure');
    inferredBackground.push('Hands-on project work');
    tags.push('project-experience');
  }

  if (/\b(read|course|studied|watched)\b/.test(normalized)) {
    inferredBackground.push('Has prior study exposure');
    tags.push('prior-study');
  }

  if (/\b(not sure|confused|stuck|struggle|hard|weak|gap|fuzzy|don.t know|never)\b/.test(normalized)) {
    weakAreas.push('Needs structured clarification in at least one prerequisite area');
    tags.push('knowledge-gap');
  }

  if (/\b(thread|fine-tune gpt-4 on your data|just store chat history|same thing)\b/.test(normalized)) {
    misconceptions.push('May be carrying an oversimplified mental model that needs explicit correction');
    tags.push('possible-misconception');
  }

  if (/\b(30 min|45 min|1 hour|2 hour|daily|every day|weekend)\b/.test(normalized)) {
    inferredBackground.push('Shared a realistic time constraint');
    tags.push('time-constraint');
  }

  return {
    inferredBackground,
    strengths,
    weakAreas,
    misconceptions,
    tags,
  };
}

function getTurnAnswer(turns: OnboardingTurn[], questionId: string): string | null {
  return turns.find((turn) => turn.questionId === questionId)?.answer ?? null;
}

function buildTopicBlueprint(
  goal: string,
  preferredDepth: PreferredDepth,
): OnboardingTopicBlueprint {
  const topicProfile = findTopicProfile(goal);

  return {
    topicSlug: toSlug(goal),
    title: topicProfile.title.slice(0, 255),
    requiredDepth: preferredDepth,
    prerequisiteMap: uniqueStrings(topicProfile.prerequisites),
    conceptOutline: uniqueStrings(topicProfile.concepts),
  };
}

export function createInitialOnboardingState(
  input: StartOnboardingInput,
): ArchitectOnboardingState {
  const goal = input.goal.trim();
  const questions = buildQuestions(goal);

  return architectOnboardingStateSchema.parse({
    onboardingId: input.onboardingId ?? randomUUID(),
    status: 'awaiting_reply',
    goal,
    background: input.background?.trim() || null,
    preferredDepth: input.preferredDepth ?? 'beginner',
    questions,
    currentQuestionIndex: 0,
    currentQuestion: questions[0]?.question ?? null,
    turns: [],
    inferredBackground:
      input.background === undefined ? [] : [input.background.trim()].filter(Boolean),
    detectedStrengths: [],
    detectedWeakAreas: [],
    detectedMisconceptions: [],
    topicBlueprint: null,
    completedAt: null,
  });
}

export function applyOnboardingAnswer(
  state: ArchitectOnboardingState,
  rawAnswer: string,
): ProgressResult {
  const answer = rawAnswer.trim();
  const question = state.questions[state.currentQuestionIndex];

  if (question === undefined || state.status === 'completed') {
    return {
      state,
      completed: state.status === 'completed',
      completionSummary:
        state.status === 'completed'
          ? {
              state,
              topicBlueprint:
                state.topicBlueprint ??
                buildTopicBlueprint(state.goal, state.preferredDepth),
              motivation: getTurnAnswer(state.turns, 'motivation'),
              priorAttempts: getTurnAnswer(state.turns, 'constraints'),
              dailyConstraint: getTurnAnswer(state.turns, 'constraints'),
            }
          : null,
    };
  }

  const signals = extractSignals(answer);
  const nextTurns = [
    ...state.turns,
    {
      questionId: question.id,
      questionKind: question.kind,
      question: question.question,
      answer,
      tags: signals.tags,
    },
  ];
  const nextIndex = state.currentQuestionIndex + 1;
  const isComplete = nextIndex >= state.questions.length;
  const topicBlueprint = isComplete
    ? buildTopicBlueprint(state.goal, state.preferredDepth)
    : null;

  const nextState = architectOnboardingStateSchema.parse({
    ...state,
    status: isComplete ? 'completed' : 'awaiting_reply',
    currentQuestionIndex: nextIndex,
    currentQuestion: isComplete ? null : (state.questions[nextIndex]?.question ?? null),
    turns: nextTurns,
    inferredBackground: uniqueStrings([
      ...state.inferredBackground,
      ...signals.inferredBackground,
    ]),
    detectedStrengths: uniqueStrings([
      ...state.detectedStrengths,
      ...signals.strengths,
    ]),
    detectedWeakAreas: uniqueStrings([
      ...state.detectedWeakAreas,
      ...signals.weakAreas,
    ]),
    detectedMisconceptions: uniqueStrings([
      ...state.detectedMisconceptions,
      ...signals.misconceptions,
    ]),
    topicBlueprint,
    completedAt: isComplete ? new Date().toISOString() : null,
  });

  if (!isComplete || topicBlueprint === null) {
    return {
      state: nextState,
      completed: false,
      completionSummary: null,
    };
  }

  return {
    state: nextState,
    completed: true,
    completionSummary: {
      state: nextState,
      topicBlueprint,
      motivation: getTurnAnswer(nextTurns, 'motivation'),
      priorAttempts: getTurnAnswer(nextTurns, 'constraints'),
      dailyConstraint: getTurnAnswer(nextTurns, 'constraints'),
    },
  };
}

export function buildOnboardingRagSeedPlan(
  state: ArchitectOnboardingState,
): PlannedRagSeedEntry[] {
  const plan: PlannedRagSeedEntry[] = [];
  const motivation = getTurnAnswer(state.turns, 'motivation');
  const background = getTurnAnswer(state.turns, 'background') ?? state.background;
  const probe = getTurnAnswer(state.turns, 'probe');
  const constraints = getTurnAnswer(state.turns, 'constraints');

  if (motivation !== null) {
    plan.push({
      eventType: 'onboarding_response',
      content: `Goal: ${state.goal}. Motivation: ${motivation}`,
      metadata: { kind: 'goal_motivation' },
      idempotencySuffix: 'goal-motivation',
    });
  }

  if (background !== null) {
    plan.push({
      eventType: 'onboarding_response',
      content: `Relevant background: ${background}`,
      metadata: { kind: 'background' },
      idempotencySuffix: 'background',
    });
  }

  if (probe !== null) {
    plan.push({
      eventType: 'onboarding_response',
      content: `Probe summary: ${probe}`,
      metadata: { kind: 'probe_answer' },
      idempotencySuffix: 'probe',
    });
  }

  if (constraints !== null) {
    plan.push({
      eventType: 'onboarding_response',
      content: `Practice constraints and prior attempts: ${constraints}`,
      metadata: { kind: 'constraints' },
      idempotencySuffix: 'constraints',
    });
  }

  state.detectedWeakAreas.forEach((weakArea, index) => {
    plan.push({
      eventType: 'gap_detected',
      content: weakArea,
      metadata: { kind: 'weak_area', index },
      idempotencySuffix: `weak-${index}`,
    });
  });

  state.detectedMisconceptions.forEach((misconception, index) => {
    plan.push({
      eventType: 'misconception_detected',
      content: misconception,
      metadata: { kind: 'misconception', index },
      idempotencySuffix: `misconception-${index}`,
    });
  });

  return plan;
}
