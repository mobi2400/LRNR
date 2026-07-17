import '../setup-env';

import { describe, expect, it, vi } from 'vitest';

import { lessonPayloadSchema } from '@/schemas/lesson.schema';
import type { CurriculumSession } from '@/schemas/curriculum.schema';
import { createDailyLearningService } from '@/services/daily-learning.service';

const now = new Date('2026-07-20T01:30:00.000Z');
const actor = {
  userId: '22222222-2222-4222-8222-222222222222',
  requestId: 'daily-test',
};

function session(input: {
  id: string;
  dayNumber: number;
  status: CurriculumSession['status'];
  lesson?: unknown;
}): CurriculumSession {
  return {
    id: input.id,
    dayNumber: input.dayNumber,
    title: `Day ${input.dayNumber}`,
    status: input.status,
    phase: 'foundation',
    conceptsToCover: [`concept-${input.dayNumber}`],
    prerequisites: [],
    masteryObjective: 'Explain the current concept clearly.',
    mentalModel:
      'A sufficiently specific mental model for the lesson contract.',
    explanationPlan: ['Explain the concept with a concrete system example.'],
    examplesPlan: ['Use one relevant example.'],
    reviewQuestions: ['What tradeoff matters most?'],
    sourceRefs: ['https://example.com/source'],
    connectionToPrior: null,
    tomorrowPreview: null,
    evaluationDue: false,
    ...(input.lesson === undefined ? {} : { lesson: input.lesson }),
  };
}

const lesson = lessonPayloadSchema.parse({
  sessionId: 'day-3',
  topicSlug: 'system-design',
  title: 'A grounded daily lesson',
  objective: 'Explain a concrete system design tradeoff.',
  mentalModel:
    'Every scaling decision moves a bottleneck instead of removing all constraints.',
  explanation: [
    {
      heading: 'Why',
      body: 'Distributed systems need explicit boundaries because failures are partial.',
    },
  ],
  diagram: { type: 'description', content: 'Client to service to database.' },
  codeExamples: [],
  commonMistakes: ['Assuming every component scales at the same rate.'],
  reviewQuestions: [
    {
      id: 'q1',
      question: 'Where can this design fail?',
      expectedPoints: ['A bottleneck'],
      hint: 'Trace the request.',
    },
  ],
  sourceReferences: [
    { label: 'Source', url: 'https://example.com/source', kind: 'external' },
  ],
  nextAction: 'Inspect the next bottleneck.',
  generatedBy: 'teaching_node',
});

function dependencies(input: {
  sessions: CurriculumSession[];
  currentSessionId: string;
  nextEvaluationDueAt?: Date | null;
}) {
  const curriculum = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: actor.userId,
    topicBriefId: null,
    topicSlug: 'system-design',
    status: 'active' as const,
    layer1Roadmap: {},
    layer2Sessions: input.sessions,
    layer3LiveQueue: [],
    currentSessionId: input.currentSessionId,
    currentSessionIndex: input.sessions.findIndex(
      (item) => item.id === input.currentSessionId,
    ),
    revision: 4,
    lastDeliveredAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const generatedCurriculum = { ...curriculum, revision: 5 };
  const job = {
    id: '33333333-3333-4333-8333-333333333333',
  };

  return {
    profileRepository: {
      getCurrentProfile: vi.fn().mockResolvedValue({
        id: '44444444-4444-4444-8444-444444444444',
        userId: actor.userId,
        displayName: null,
        currentGoal: 'Learn system design',
        currentTopicId: null,
        currentTopicSlug: 'system-design',
        curriculumPosition: {},
        learnerPreferences: {},
        stableMasterySummary: {},
        activeMisconceptions: [],
        nextEvaluationDueAt: input.nextEvaluationDueAt ?? null,
        lastActiveAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    },
    curriculumRepository: {
      getActiveCurriculum: vi
        .fn()
        .mockResolvedValueOnce(curriculum)
        .mockResolvedValue(generatedCurriculum),
    },
    jobsRepository: {
      createJobRun: vi.fn().mockResolvedValue(job),
      updateStatus: vi.fn().mockResolvedValue(job),
      recordError: vi.fn().mockResolvedValue(job),
    },
    generateCurrentLesson: vi.fn().mockResolvedValue(lesson),
    queueLessonReadyAlert: vi.fn().mockResolvedValue({} as never),
    writeMemory: vi.fn().mockResolvedValue({} as never),
  };
}

describe('daily learning service', () => {
  it('generates the current planned session and queues post-lesson side effects', async () => {
    const deps = dependencies({
      sessions: [session({ id: 'day-3', dayNumber: 3, status: 'planned' })],
      currentSessionId: 'day-3',
    });
    const result = await createDailyLearningService(deps).run(actor, now);

    expect(result.route).toBe('continue_teaching');
    expect(result.status).toBe('prepared');
    expect(deps.generateCurrentLesson).toHaveBeenCalledTimes(1);
    expect(deps.queueLessonReadyAlert).toHaveBeenCalledTimes(1);
    expect(deps.writeMemory).toHaveBeenCalledTimes(1);
  });

  it('does not regenerate an already-ready lesson', async () => {
    const deps = dependencies({
      sessions: [
        session({ id: 'day-3', dayNumber: 3, status: 'ready', lesson }),
      ],
      currentSessionId: 'day-3',
    });
    const result = await createDailyLearningService(deps).run(actor, now);

    expect(result.reason).toBe('current_lesson_already_ready');
    expect(deps.generateCurrentLesson).not.toHaveBeenCalled();
  });

  it('pauses teaching when evaluation is due after enough completed lessons', async () => {
    const deps = dependencies({
      sessions: [
        session({ id: 'day-1', dayNumber: 1, status: 'completed' }),
        session({ id: 'day-2', dayNumber: 2, status: 'completed' }),
        session({ id: 'day-3', dayNumber: 3, status: 'planned' }),
      ],
      currentSessionId: 'day-3',
      nextEvaluationDueAt: new Date('2026-07-19T00:00:00.000Z'),
    });
    const result = await createDailyLearningService(deps).run(actor, now);

    expect(result.route).toBe('evaluation_due');
    expect(result.status).toBe('waiting');
    expect(deps.generateCurrentLesson).not.toHaveBeenCalled();
  });
});
