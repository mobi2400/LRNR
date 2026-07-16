import type { DashboardResponse } from '@/schemas/dashboard.schema';

export type DashboardMode =
  | 'no_goal'
  | 'workflow_failed'
  | 'lesson_ready'
  | 'lesson_not_ready'
  | 'topic_completed';

export type DashboardViewModel = {
  mode: DashboardMode;
  topicLabel: string;
  progressPercent: number;
  progressText: string;
  primaryTitle: string;
  primaryDescription: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string;
  secondaryActionHref: string;
  activityTitle: string;
  activityDescription: string;
  alertSummary: string;
};

const READY_SESSION_STATUSES = new Set(['ready', 'delivered']);

export function clampProgressPercent(completed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  const percent = Math.round((completed / total) * 100);

  return Math.min(100, Math.max(0, percent));
}

function formatTopicLabel(topicSlug: string | null): string {
  if (topicSlug === null) {
    return 'No active topic yet';
  }

  return topicSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getMode(dashboard: DashboardResponse): DashboardMode {
  const hasTopic = dashboard.topic.currentTopicSlug !== null;

  if (!hasTopic) {
    return 'no_goal';
  }

  if (dashboard.latestWorkflow?.status === 'failed') {
    return 'workflow_failed';
  }

  if (
    dashboard.topic.totalSessionCount > 0 &&
    dashboard.topic.completedSessionCount >= dashboard.topic.totalSessionCount
  ) {
    return 'topic_completed';
  }

  if (
    dashboard.topic.currentSession !== null &&
    READY_SESSION_STATUSES.has(dashboard.topic.currentSession.status ?? '')
  ) {
    return 'lesson_ready';
  }

  return 'lesson_not_ready';
}

function getActivityCopy(
  dashboard: DashboardResponse,
): Pick<DashboardViewModel, 'activityTitle' | 'activityDescription'> {
  switch (dashboard.latestWorkflow?.status) {
    case 'running':
      return {
        activityTitle: 'LRNR is preparing the next step.',
        activityDescription:
          'Your progress is safe while the learning workflow assembles the next grounded surface.',
      };
    case 'succeeded':
      return {
        activityTitle: 'The latest preparation finished.',
        activityDescription:
          'The newest available learning state has been saved and is ready to inspect.',
      };
    case 'failed':
      return {
        activityTitle: 'Preparation needs attention.',
        activityDescription:
          'LRNR could not finish the latest preparation, but completed progress remains safe.',
      };
    default:
      return {
        activityTitle: 'LRNR is ready when you are.',
        activityDescription:
          'No background preparation currently needs your attention.',
      };
  }
}

export function buildDashboardViewModel(
  dashboard: DashboardResponse,
): DashboardViewModel {
  const mode = getMode(dashboard);
  const progressPercent = clampProgressPercent(
    dashboard.topic.completedSessionCount,
    dashboard.topic.totalSessionCount,
  );
  const topicLabel = formatTopicLabel(dashboard.topic.currentTopicSlug);
  const progressText =
    dashboard.topic.totalSessionCount === 0
      ? 'No sessions planned yet.'
      : `${dashboard.topic.completedSessionCount} of ${dashboard.topic.totalSessionCount} sessions complete.`;
  const activity = getActivityCopy(dashboard);
  const alertSummary =
    dashboard.alerts.length === 0
      ? 'No alerts need your attention.'
      : `${dashboard.alerts.length} recent alert${dashboard.alerts.length === 1 ? '' : 's'} may need a look.`;

  switch (mode) {
    case 'no_goal':
      return {
        mode,
        topicLabel,
        progressPercent,
        progressText,
        primaryTitle: 'Build your learning path.',
        primaryDescription:
          'Tell LRNR what you want to master. It will start by understanding your goal and where you are starting from.',
        primaryActionLabel: 'Start with a goal',
        primaryActionHref: '#build-learning-path',
        secondaryActionLabel: 'Open settings',
        secondaryActionHref: '/settings',
        ...activity,
        alertSummary,
      };
    case 'workflow_failed':
      return {
        mode,
        topicLabel,
        progressPercent,
        progressText,
        primaryTitle: 'The latest preparation needs attention.',
        primaryDescription:
          'Your completed learning state is safe. Review the alert, then retry the workflow when you are ready.',
        primaryActionLabel: 'Review alerts',
        primaryActionHref: '/settings',
        secondaryActionLabel: 'Open learning path',
        secondaryActionHref: '/curriculum',
        ...activity,
        alertSummary,
      };
    case 'topic_completed':
      return {
        mode,
        topicLabel,
        progressPercent,
        progressText,
        primaryTitle: 'This topic is complete.',
        primaryDescription:
          'You have completed the planned sessions for this topic. Use review to consolidate the ideas before starting another path.',
        primaryActionLabel: 'Review the topic',
        primaryActionHref: '/lesson/review',
        secondaryActionLabel: 'Open learning path',
        secondaryActionHref: '/curriculum',
        ...activity,
        alertSummary,
      };
    case 'lesson_not_ready':
      return {
        mode,
        topicLabel,
        progressPercent,
        progressText,
        primaryTitle: 'LRNR is preparing your next lesson.',
        primaryDescription:
          'A learning path exists, but the next persisted lesson is not ready to study yet.',
        primaryActionLabel: 'View learning path',
        primaryActionHref: '/curriculum',
        secondaryActionLabel: 'Check lesson surface',
        secondaryActionHref: '/lesson/current',
        ...activity,
        alertSummary,
      };
    case 'lesson_ready':
    default:
      return {
        mode: 'lesson_ready',
        topicLabel,
        progressPercent,
        progressText,
        primaryTitle:
          dashboard.topic.currentSession?.title ?? 'Your next lesson is ready.',
        primaryDescription:
          dashboard.topic.currentSession?.objective ??
          'Continue with one focused learning session from the current path.',
        primaryActionLabel: 'Continue learning',
        primaryActionHref: '/lesson/current',
        secondaryActionLabel: 'Review first',
        secondaryActionHref: '/lesson/review',
        ...activity,
        alertSummary,
      };
  }
}
