import { describe, expect, it } from 'vitest';

import {
  buildDashboardViewModel,
  clampProgressPercent,
} from '@/components/dashboard/dashboard-view-model';
import type { DashboardResponse } from '@/schemas/dashboard.schema';

function makeDashboard(
  overrides: Partial<DashboardResponse> = {},
): DashboardResponse {
  return {
    topic: {
      currentTopicSlug: null,
      topicStatus: null,
      currentSessionId: null,
      currentSession: null,
      curriculumRevision: null,
      completedSessionCount: 0,
      totalSessionCount: 0,
      nextEvaluationDueAt: null,
    },
    alerts: [],
    latestWorkflow: null,
    cache: { status: 'miss' },
    ...overrides,
  };
}

describe('dashboard view model', () => {
  it('normalizes progress into a safe percent range', () => {
    expect(clampProgressPercent(0, 0)).toBe(0);
    expect(clampProgressPercent(2, 4)).toBe(50);
    expect(clampProgressPercent(9, 4)).toBe(100);
    expect(clampProgressPercent(-2, 4)).toBe(0);
  });

  it('selects the goal-building state when no topic exists', () => {
    const viewModel = buildDashboardViewModel(makeDashboard());

    expect(viewModel.mode).toBe('no_goal');
    expect(viewModel.primaryActionLabel).toBe('Start with a goal');
  });

  it('selects the lesson-ready action from an honest ready session', () => {
    const viewModel = buildDashboardViewModel(
      makeDashboard({
        topic: {
          currentTopicSlug: 'agentic-ai',
          topicStatus: 'active',
          currentSessionId: 'session-1',
          currentSession: {
            sessionId: 'session-1',
            title: 'Mental models for agent loops',
            status: 'ready',
            objective: 'Understand what repeats inside an agent loop.',
          },
          curriculumRevision: 1,
          completedSessionCount: 1,
          totalSessionCount: 4,
          nextEvaluationDueAt: null,
        },
      }),
    );

    expect(viewModel.mode).toBe('lesson_ready');
    expect(viewModel.progressPercent).toBe(25);
    expect(viewModel.primaryActionLabel).toBe('Continue learning');
  });

  it('prioritizes failed workflow attention without losing progress', () => {
    const viewModel = buildDashboardViewModel(
      makeDashboard({
        topic: {
          currentTopicSlug: 'rag-systems',
          topicStatus: 'active',
          currentSessionId: 'session-1',
          currentSession: null,
          curriculumRevision: 1,
          completedSessionCount: 1,
          totalSessionCount: 2,
          nextEvaluationDueAt: null,
        },
        latestWorkflow: {
          id: '11111111-1111-4111-8111-111111111111',
          jobType: 'teaching_session',
          status: 'failed',
          createdAt: '2026-07-17T00:00:00.000Z',
          updatedAt: '2026-07-17T00:01:00.000Z',
        },
      }),
    );

    expect(viewModel.mode).toBe('workflow_failed');
    expect(viewModel.primaryTitle).toContain('needs attention');
    expect(viewModel.progressText).toBe('1 of 2 sessions complete.');
  });
});
