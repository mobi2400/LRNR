import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { generateStructured, type StructuredGenerationInput } from '@/lib/llm';
import { serverConfig } from '@/server/config';
import {
  architectOnboardingStateSchema,
  onboardingQuestionKindSchema,
  onboardingTopicBlueprintSchema,
  preferredDepthSchema,
  type ArchitectOnboardingState,
  type OnboardingQuestion,
  type OnboardingQuestionKind,
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
  /**
   * Authoritative source URLs the Architect proposes for this topic. The
   * Cartographer fetches them, so unreachable or invented URLs simply fail and
   * are recorded as failed sources rather than becoming evidence.
   */
  recommendedSources: string[];
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

/**
 * Structured generator seam. `undefined` resolves to the real LLM in
 * production and the deterministic path under test/offline; `null` forces the
 * deterministic path; a function overrides it (used to exercise the LLM path in
 * tests). Keeping this seam means onboarding never hard-fails on a model error.
 */
export type ArchitectGenerator =
  | (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>)
  | null;

function resolveGenerator(
  generate: ArchitectGenerator | undefined,
): (<TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>) | null {
  if (generate === null) {
    return null;
  }

  if (generate === undefined) {
    return serverConfig.nodeEnv === 'test' ? null : generateStructured;
  }

  return generate;
}

// Discovery is capped so a model that never volunteers completion still ends.
const MAX_TURNS = 5;
// The deterministic path mirrors the original fixed four-question interview.
const DETERMINISTIC_TURN_COUNT = 4;

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

/** The deterministic interview: a fixed, kind-ordered question sequence. */
function deterministicQuestions(goal: string): OnboardingQuestion[] {
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

function getTurnAnswerByKind(
  turns: OnboardingTurn[],
  kind: OnboardingQuestionKind,
): string | null {
  return turns.find((turn) => turn.questionKind === kind)?.answer ?? null;
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

// ---------------------------------------------------------------------------
// LLM-driven conversational discovery
// ---------------------------------------------------------------------------

const architectSystemPrompt = `You are LRNR's Architect agent running a short discovery interview with one learner.
Your job is to understand their real starting point, not to survey them.

Rules:
- Ask one focused question at a time. Adapt each question to what they just said.
- Probe for demonstrated understanding; do not accept self-assessment at face value.
- Detect genuine strengths, weak areas, and misconceptions from their answers.
- Stop when you have enough to design a personalized path (usually 3-5 turns).
- When done, produce a topic blueprint: the real prerequisite chain and an ordered concept outline for their goal, at the appropriate depth.
- Return one JSON object, no markdown fence.`;

const firstQuestionSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  kind: onboardingQuestionKindSchema,
});

const turnDecisionSchema = z.object({
  inferredBackground: z.array(z.string().trim().min(1)).default([]),
  strengths: z.array(z.string().trim().min(1)).default([]),
  weakAreas: z.array(z.string().trim().min(1)).default([]),
  misconceptions: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  complete: z.boolean(),
  nextQuestion: firstQuestionSchema.nullable().default(null),
  blueprint: z
    .object({
      title: z.string().trim().min(1),
      requiredDepth: preferredDepthSchema,
      prerequisiteMap: z.array(z.string().trim().min(1)).default([]),
      conceptOutline: z.array(z.string().trim().min(1)).default([]),
    })
    .nullable()
    .default(null),
  motivation: z.string().trim().min(1).nullable().default(null),
  priorAttempts: z.string().trim().min(1).nullable().default(null),
  dailyConstraint: z.string().trim().min(1).nullable().default(null),
});

function cap(values: string[], max: number): string[] {
  return uniqueStrings(values.map((value) => value.slice(0, 255))).slice(0, max);
}

function toQuestion(
  input: { question: string; kind: OnboardingQuestionKind },
  index: number,
): OnboardingQuestion {
  return {
    id: `q-${index}-${input.kind}`,
    kind: input.kind,
    question: input.question.slice(0, 2000),
  };
}

function transcript(turns: OnboardingTurn[]): string {
  if (turns.length === 0) {
    return '(no answers yet)';
  }

  return turns
    .map((turn, index) => `Turn ${index + 1} [${turn.questionKind}]\nA: ${turn.answer}`)
    .join('\n');
}

async function generateFirstQuestion(
  input: StartOnboardingInput,
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<OnboardingQuestion> {
  const decision = await generate({
    label: 'architect_first_question',
    system: architectSystemPrompt,
    prompt: `Learner goal: ${input.goal}
Stated background: ${input.background ?? '(none given)'}
Preferred depth: ${input.preferredDepth ?? 'beginner'}

Ask the single best opening discovery question. Return { "question": "...", "kind": "motivation|background|probe|constraints" }.`,
    schema: firstQuestionSchema,
    temperature: 0.4,
    maxTokens: 2_500,
  });

  return toQuestion(decision, 0);
}

const blueprintSchema = z.object({
  title: z.string().trim().min(1),
  requiredDepth: preferredDepthSchema,
  prerequisiteMap: z.array(z.string().trim().min(1)).min(1),
  conceptOutline: z.array(z.string().trim().min(1)).min(3),
  recommendedSources: z.array(z.string().trim().min(1)).default([]),
});

/**
 * A dedicated blueprint pass. The turn model often signals completion without
 * filling in the blueprint, and falling straight back to the generic template
 * threw away everything the interview just learned. Asking once, explicitly,
 * with the full transcript keeps the roadmap grounded in the real conversation.
 */
async function generateBlueprint(
  state: ArchitectOnboardingState,
  turns: OnboardingTurn[],
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<z.infer<typeof blueprintSchema>> {
  return generate({
    label: 'architect_blueprint',
    system: architectSystemPrompt,
    prompt: `Design the topic blueprint for this learner from the completed discovery interview.

Stated goal: ${state.goal}
Preferred depth: ${state.preferredDepth}
Detected strengths: ${state.detectedStrengths.join('; ') || '(none)'}
Detected weak areas: ${state.detectedWeakAreas.join('; ') || '(none)'}
Detected misconceptions: ${state.detectedMisconceptions.join('; ') || '(none)'}

Interview transcript:
${turns.map((turn, index) => `Q${index + 1} [${turn.questionKind}]: ${turn.question}\nA${index + 1}: ${turn.answer}`).join('\n')}

Base the blueprint on what the learner actually needs, which may be narrower or
different from how they phrased the goal. Return JSON:
{
  "title": "clean topic name, no filler words like 'I want to learn'",
  "requiredDepth": "beginner|intermediate|advanced|expert",
  "prerequisiteMap": ["real prerequisite", ...],
  "conceptOutline": ["ordered concept", ...at least 3],
  "recommendedSources": ["https://authoritative-doc-url", ...]
}`,
    schema: blueprintSchema,
    temperature: 0.3,
    maxTokens: 4_000,
  });
}

function blueprintFromDecision(
  state: ArchitectOnboardingState,
  decision: z.infer<typeof turnDecisionSchema>,
): OnboardingTopicBlueprint {
  if (decision.blueprint === null) {
    return buildTopicBlueprint(state.goal, state.preferredDepth);
  }

  return onboardingTopicBlueprintSchema.parse({
    // Slug from the model's clean topic title, not the raw goal sentence, so
    // we get "system-design" instead of "i-want-to-learn-sysytem-design".
    topicSlug: toSlug(decision.blueprint.title) || toSlug(state.goal),
    title: decision.blueprint.title.slice(0, 255),
    requiredDepth: decision.blueprint.requiredDepth,
    prerequisiteMap: cap(decision.blueprint.prerequisiteMap, 12),
    conceptOutline: cap(decision.blueprint.conceptOutline, 16),
  });
}

async function applyLlmAnswer(
  state: ArchitectOnboardingState,
  answer: string,
  question: OnboardingQuestion,
  generate: <TOutput>(input: StructuredGenerationInput<TOutput>) => Promise<TOutput>,
): Promise<ProgressResult> {
  const nextTurnCount = state.turns.length + 1;
  const decision = await generate({
    label: 'architect_turn',
    system: architectSystemPrompt,
    prompt: `Learner goal: ${state.goal}
Preferred depth: ${state.preferredDepth}
Turns so far (${state.turns.length}):
${transcript(state.turns)}

Just asked [${question.kind}]: ${question.question}
Learner answered: ${answer}

This is turn ${nextTurnCount} of at most ${MAX_TURNS}. Extract signals from the answer.
Decide whether discovery is complete. If not complete, provide the next adaptive question.
If complete (or this is the final allowed turn), provide the topic blueprint.
Return JSON: { "inferredBackground": [], "strengths": [], "weakAreas": [], "misconceptions": [], "tags": [], "complete": bool, "nextQuestion": {"question","kind"}|null, "blueprint": {"title","requiredDepth","prerequisiteMap":[],"conceptOutline":[]}|null, "motivation": str|null, "priorAttempts": str|null, "dailyConstraint": str|null }`,
    schema: turnDecisionSchema,
    temperature: 0.35,
    maxTokens: 4_000,
  });

  const forcedComplete = nextTurnCount >= MAX_TURNS;
  const isComplete = decision.complete || forcedComplete || decision.nextQuestion === null;
  const nextTurns: OnboardingTurn[] = [
    ...state.turns,
    {
      questionId: question.id,
      questionKind: question.kind,
      question: question.question,
      answer,
      tags: cap(decision.tags, 8),
    },
  ];
  const nextQuestion =
    isComplete || decision.nextQuestion === null
      ? null
      : toQuestion(decision.nextQuestion, state.questions.length);
  const questions =
    nextQuestion === null ? state.questions : [...state.questions, nextQuestion];
  const mergedSignals = {
    inferredBackground: uniqueStrings([
      ...state.inferredBackground,
      ...decision.inferredBackground,
    ]),
    detectedStrengths: uniqueStrings([
      ...state.detectedStrengths,
      ...decision.strengths,
    ]),
    detectedWeakAreas: uniqueStrings([
      ...state.detectedWeakAreas,
      ...decision.weakAreas,
    ]),
    detectedMisconceptions: uniqueStrings([
      ...state.detectedMisconceptions,
      ...decision.misconceptions,
    ]),
  };
  let topicBlueprint: OnboardingTopicBlueprint | null = null;
  let recommendedSources: string[] = [];

  if (isComplete) {
    if (decision.blueprint !== null) {
      topicBlueprint = blueprintFromDecision(state, decision);
    } else {
      // The turn model signalled completion without a blueprint. Ask for one
      // explicitly rather than discarding the interview for a generic template.
      try {
        const generated = await generateBlueprint(
          { ...state, ...mergedSignals },
          nextTurns,
          generate,
        );

        topicBlueprint = onboardingTopicBlueprintSchema.parse({
          topicSlug: toSlug(generated.title) || toSlug(state.goal),
          title: generated.title.slice(0, 255),
          requiredDepth: generated.requiredDepth,
          prerequisiteMap: cap(generated.prerequisiteMap, 12),
          conceptOutline: cap(generated.conceptOutline, 16),
        });
        recommendedSources = generated.recommendedSources.slice(0, 8);
      } catch {
        topicBlueprint = buildTopicBlueprint(state.goal, state.preferredDepth);
      }
    }
  }

  const nextState = architectOnboardingStateSchema.parse({
    ...state,
    status: isComplete ? 'completed' : 'awaiting_reply',
    currentQuestionIndex: isComplete
      ? state.currentQuestionIndex
      : questions.length - 1,
    currentQuestion: nextQuestion?.question ?? null,
    questions,
    turns: nextTurns,
    ...mergedSignals,
    topicBlueprint,
    completedAt: isComplete ? new Date().toISOString() : null,
  });

  if (!isComplete || topicBlueprint === null) {
    return { state: nextState, completed: false, completionSummary: null };
  }

  return {
    state: nextState,
    completed: true,
    completionSummary: {
      state: nextState,
      topicBlueprint,
      motivation:
        decision.motivation ?? getTurnAnswerByKind(nextTurns, 'motivation'),
      priorAttempts:
        decision.priorAttempts ?? getTurnAnswerByKind(nextTurns, 'constraints'),
      dailyConstraint:
        decision.dailyConstraint ?? getTurnAnswerByKind(nextTurns, 'constraints'),
      recommendedSources,
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic path (test/offline and resilient fallback)
// ---------------------------------------------------------------------------

function applyDeterministicAnswer(
  state: ArchitectOnboardingState,
  answer: string,
  question: OnboardingQuestion,
): ProgressResult {
  const signals = extractSignals(answer);
  const nextTurns: OnboardingTurn[] = [
    ...state.turns,
    {
      questionId: question.id,
      questionKind: question.kind,
      question: question.question,
      answer,
      tags: signals.tags,
    },
  ];
  const allQuestions = deterministicQuestions(state.goal);
  const nextIndex = state.currentQuestionIndex + 1;
  const isComplete = nextIndex >= DETERMINISTIC_TURN_COUNT;
  const nextQuestion = isComplete ? null : allQuestions[nextIndex] ?? null;
  const questions =
    nextQuestion === null ? state.questions : [...state.questions, nextQuestion];
  const topicBlueprint = isComplete
    ? buildTopicBlueprint(state.goal, state.preferredDepth)
    : null;

  const nextState = architectOnboardingStateSchema.parse({
    ...state,
    status: isComplete ? 'completed' : 'awaiting_reply',
    currentQuestionIndex: nextIndex,
    currentQuestion: nextQuestion?.question ?? null,
    questions,
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
    return { state: nextState, completed: false, completionSummary: null };
  }

  return {
    state: nextState,
    completed: true,
    completionSummary: {
      state: nextState,
      topicBlueprint,
      motivation: getTurnAnswerByKind(nextTurns, 'motivation'),
      priorAttempts: getTurnAnswerByKind(nextTurns, 'constraints'),
      dailyConstraint: getTurnAnswerByKind(nextTurns, 'constraints'),
      recommendedSources: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createInitialOnboardingState(
  input: StartOnboardingInput,
  generate?: ArchitectGenerator,
): Promise<ArchitectOnboardingState> {
  const goal = input.goal.trim();
  const resolved = resolveGenerator(generate);
  let firstQuestion = deterministicQuestions(goal)[0] as OnboardingQuestion;

  if (resolved !== null) {
    try {
      firstQuestion = await generateFirstQuestion(input, resolved);
    } catch {
      firstQuestion = deterministicQuestions(goal)[0] as OnboardingQuestion;
    }
  }

  return architectOnboardingStateSchema.parse({
    onboardingId: input.onboardingId ?? randomUUID(),
    status: 'awaiting_reply',
    goal,
    background: input.background?.trim() || null,
    preferredDepth: input.preferredDepth ?? 'beginner',
    questions: [firstQuestion],
    currentQuestionIndex: 0,
    currentQuestion: firstQuestion.question,
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

export async function applyOnboardingAnswer(
  state: ArchitectOnboardingState,
  rawAnswer: string,
  generate?: ArchitectGenerator,
): Promise<ProgressResult> {
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
              motivation: getTurnAnswerByKind(state.turns, 'motivation'),
              priorAttempts: getTurnAnswerByKind(state.turns, 'constraints'),
              dailyConstraint: getTurnAnswerByKind(state.turns, 'constraints'),
              recommendedSources: [],
            }
          : null,
    };
  }

  const resolved = resolveGenerator(generate);

  if (resolved === null) {
    return applyDeterministicAnswer(state, answer, question);
  }

  try {
    return await applyLlmAnswer(state, answer, question, resolved);
  } catch {
    return applyDeterministicAnswer(state, answer, question);
  }
}

export function buildOnboardingRagSeedPlan(
  state: ArchitectOnboardingState,
): PlannedRagSeedEntry[] {
  const plan: PlannedRagSeedEntry[] = [];
  const motivation = getTurnAnswerByKind(state.turns, 'motivation');
  const background =
    getTurnAnswerByKind(state.turns, 'background') ?? state.background;
  const probe = getTurnAnswerByKind(state.turns, 'probe');
  const constraints = getTurnAnswerByKind(state.turns, 'constraints');

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
