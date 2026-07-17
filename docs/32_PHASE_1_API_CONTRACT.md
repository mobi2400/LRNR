# LRNR - Phase 1 API Contract
> **Phase 1 backend API contract.**
> This file defines the initial endpoints, auth requirements, request/response shapes, idempotency rules, and error codes for the private core MVP.

---

## Purpose

This file converts Phase 1 product flow into backend API contracts.

Use this before implementing:

- route handlers
- Zod schemas
- frontend fetchers
- service methods
- API tests

Phase 1 API goal:

```text
Support owner-only login, onboarding, dashboard, lesson, curriculum, settings, notifications, workflows, and system status.
```

---

## Global API Rules

All Phase 1 APIs must:

- return JSON
- include `requestId`
- use Zod request validation
- use stable error codes
- never expose secrets
- never expose service-role database access
- enforce owner auth on protected routes
- enforce private unlock where required
- use idempotency for retryable mutations

---

## Response Envelope

Success:

```ts
interface ApiSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
}
```

Error:

```ts
interface ApiError {
  ok: false;
  requestId: string;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
```

Error codes:

```ts
type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'LOCKED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'WORKFLOW_ALREADY_RUNNING'
  | 'PROVIDER_ERROR'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';
```

---

## Auth Levels

| Level | Meaning |
|------|---------|
| `public` | no session required |
| `session` | Auth.js session required |
| `owner` | authenticated user must match owner allowlist |
| `unlocked_owner` | owner must also pass private LRNR access secret |

Default for app APIs:

```text
unlocked_owner
```

Only login/auth bootstrap routes may be `public` or `session`.

---

## Idempotency Rules

Mutation routes that can be retried must accept:

```text
Idempotency-Key: <stable-client-generated-key>
```

Required for:

- starting goal/onboarding
- onboarding reply
- daily learning workflow trigger
- lesson mark complete
- Telegram test send
- audio generation if enabled

If the same key and same request body are repeated, return the saved response.

The backend must reserve the idempotency record atomically before executing side effects. A request that finds the same key and request hash in `processing` state must not execute again; return:

```text
409 IDEMPOTENCY_IN_PROGRESS
Retry-After: <bounded retry delay>
```

Replay must preserve the original response body and status code. Expired `processing` records may be reclaimed only by an explicit timeout policy; normal upsert must never overwrite another request's route or request hash.

If the same key is reused with a different body, return:

```text
409 IDEMPOTENCY_CONFLICT
```

---

## Core Types

### `UserSummary`

```ts
interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
  isOwner: boolean;
  isUnlocked: boolean;
  accessMode: 'owner_only' | 'invite_only' | 'public';
}
```

### `DashboardSummary`

```ts
interface DashboardSummary {
  currentTopic: {
    topicSlug: string;
    title: string;
    status: 'active' | 'paused' | 'completed' | 'archived';
  } | null;
  currentSession: {
    sessionId: string;
    title: string;
    status: 'planned' | 'ready' | 'delivered' | 'completed' | 'skipped' | 'rescheduled';
    objective: string;
  } | null;
  progress: {
    completedSessions: number;
    totalSessions: number;
    nextEvaluationDueAt: string | null;
  };
  alerts: Array<{
    id: string;
    type: 'lesson_ready' | 'workflow_failed' | 'reminder' | 'system';
    title: string;
    createdAt: string;
  }>;
}
```

### `LessonPayload`

```ts
interface LessonPayload {
  sessionId: string;
  topicSlug: string;
  title: string;
  objective: string;
  mentalModel: string;
  explanation: string;
  diagram?: {
    type: 'mermaid' | 'text';
    content: string;
  };
  codeExamples: Array<{
    language: string;
    title: string;
    code: string;
    explanation?: string;
  }>;
  commonMistakes: string[];
  reviewQuestions: Array<{
    id: string;
    question: string;
    hint?: string;
    expectedPoints: string[];
  }>;
  sources: Array<{
    title: string;
    url?: string;
    sourceType?: string;
  }>;
  status: 'planned' | 'ready' | 'delivered' | 'completed' | 'skipped' | 'rescheduled';
}
```

### `WorkflowRunSummary`

```ts
interface WorkflowRunSummary {
  runId: string;
  jobType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  route?: 'new_topic' | 'continue_teaching' | 'waiting_for_onboarding_reply' | 'no_pending_session';
  startedAt: string | null;
  finishedAt: string | null;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## Endpoint Contracts

## `GET /api/me`

Auth:

```text
session
```

Returns:

```ts
ApiSuccess<UserSummary>
```

Errors:

- `UNAUTHENTICATED`

---

## `POST /api/unlock`

Auth:

```text
owner
```

Request:

```ts
interface UnlockRequest {
  accessSecret: string;
}
```

Returns:

```ts
ApiSuccess<{
  isUnlocked: true;
  unlockedUntil: string;
}>
```

Errors:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `LOCKED`

Rules:

- never log `accessSecret`
- compare against hash
- set short-lived unlock session/cookie claim

---

## `POST /api/logout`

Auth:

```text
session
```

Returns:

```ts
ApiSuccess<{ loggedOut: true }>
```

---

## `GET /api/dashboard`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<DashboardSummary>
```

Rules:

- no LLM calls in this route
- can use Redis dashboard cache
- cache must be safe and short-lived

---

## `GET /api/lesson/current`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<{
  lesson: LessonPayload | null;
  reasonIfEmpty?: 'no_active_topic' | 'not_ready' | 'waiting_for_onboarding' | 'completed';
}>
```

Rules:

- load persisted lesson/session state
- no LLM call during normal page load

---

## `POST /api/goals/start`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Request:

```ts
interface StartGoalRequest {
  goal: string;
  background?: string;
  preferredDepth?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}
```

Returns:

```ts
ApiSuccess<{
  onboardingId: string;
  firstQuestion: string;
  status: 'awaiting_reply';
}>
```

Rules:

- starts Architect onboarding
- does not create full curriculum yet
- writes initial job/onboarding state

---

## `GET /api/onboarding/current`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<{
  onboardingId: string | null;
  status: 'not_started' | 'awaiting_reply' | 'processing' | 'completed';
  currentQuestion?: string;
  turnsCompleted: number;
}>
```

---

## `POST /api/onboarding/reply`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Request:

```ts
interface OnboardingReplyRequest {
  onboardingId: string;
  answer: string;
}
```

Returns:

```ts
ApiSuccess<{
  status: 'awaiting_reply' | 'completed';
  nextQuestion?: string;
  topicBriefId?: string;
  workflowRunId?: string;
}>
```

Rules:

- if onboarding completes, create profile/topic brief/RAG seed
- starts the bounded Phase 1 preparation handoff after the onboarding transaction commits
- onboarding remains complete if downstream preparation fails; the failed `curriculum_build` job remains retryable

---

## `GET /api/curriculum/map`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<{
  topicSlug: string | null;
  roadmap: unknown;
  sessions: Array<{
    sessionId: string;
    title: string;
    status: string;
    concepts: string[];
  }>;
  currentSessionId: string | null;
}>
```

Rules:

- Phase 1 can return simple session map
- Phase 2 can enrich with mastery/concept status

---

## `POST /api/lesson/{sessionId}/mark-complete`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Request:

```ts
interface MarkLessonCompleteRequest {
  understood: boolean;
  notes?: string;
}
```

Returns:

```ts
ApiSuccess<{
  sessionId: string;
  status: 'completed';
  nextSessionId: string | null;
}>
```

Rules:

- updates session status
- can write compact RAG summary if not already written
- must not duplicate RAG summary on retry
- reserves idempotency before mutation and replays the completed response
- commits curriculum status/pointer, RAG summary, and idempotency completion transactionally or through a resumable step state machine

---

## `POST /api/lesson/{sessionId}/ask-follow-up`

Auth:

```text
unlocked_owner
```

Request:

```ts
interface AskFollowUpRequest {
  question: string;
}
```

Returns:

```ts
ApiSuccess<{
  answer: string;
  sources: Array<{
    title: string;
    url?: string;
  }>;
}>
```

Rules:

- use current session/topic knowledge/RAG context
- Phase 1 can keep this simple
- if evidence is weak, say so

---

## `POST /api/workflows/phase1/prepare`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Returns:

```ts
ApiSuccess<{
  status: 'prepared' | 'already_prepared';
  topicSlug: string;
  sessionId: string;
  lessonReady: true;
  repairableFailures: Array<'delivery' | 'rag'>;
}>
```

Rules:

- requires a completed owner profile and topic brief
- runs Cartographer, initial Curriculum Builder, Teaching, lesson persistence, and post-lesson side effects in dependency order
- reuses existing topic knowledge and curriculum state
- returns the persisted lesson on retry without regenerating or duplicating the lesson-ready alert
- records `curriculum_build` as running, succeeded, or failed in `job_runs`

---

## `POST /api/workflows/daily-learning`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Request:

```ts
interface StartDailyLearningWorkflowRequest {
  reason: 'manual' | 'scheduled' | 'onboarding_completed';
}
```

Returns:

```ts
ApiSuccess<WorkflowRunSummary>
```

Errors:

- `WORKFLOW_ALREADY_RUNNING`
- `IDEMPOTENCY_CONFLICT`

Rules:

- must acquire workflow lock
- must create `job_runs`
- should not duplicate lesson delivery

---

## `GET /api/workflows/{runId}`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<WorkflowRunSummary>
```

---

## `GET /api/settings`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<{
  owner: {
    email: string;
    displayName: string | null;
  };
  notifications: {
    telegramEnabled: boolean;
    dailyLearningAlertEnabled: boolean;
    evaluationAlertEnabled: boolean;
    digestAlertEnabled: boolean;
  };
  voice: {
    elevenLabsEnabled: boolean;
    voiceId?: string;
  };
}>
```

---

## `PATCH /api/settings`

Auth:

```text
unlocked_owner
```

Request:

```ts
interface UpdateSettingsRequest {
  notifications?: {
    telegramEnabled?: boolean;
    dailyLearningAlertEnabled?: boolean;
    evaluationAlertEnabled?: boolean;
    digestAlertEnabled?: boolean;
  };
  voice?: {
    voiceId?: string;
  };
}
```

Returns:

```ts
ApiSuccess<{ updated: true }>
```

---

## `POST /api/notifications/telegram/test`

Auth:

```text
unlocked_owner
```

Headers:

```text
Idempotency-Key: required
```

Returns:

```ts
ApiSuccess<{
  queued: boolean;
  deliveryKey: string;
}>
```

Rules:

- use `delivery_outbox`
- do not send duplicate test for same idempotency key

---

## `GET /api/system/status`

Auth:

```text
unlocked_owner
```

Returns:

```ts
ApiSuccess<{
  postgres: 'ok' | 'degraded' | 'down';
  redis: 'ok' | 'degraded' | 'down';
  telegram: 'configured' | 'missing' | 'error';
  llm: 'configured' | 'missing' | 'error';
  embeddings: 'configured' | 'missing' | 'error';
  latestWorkflowRun: WorkflowRunSummary | null;
}>
```

Rules:

- do not expose secrets
- do not expose raw provider error responses

---

## Optional Phase 1 Audio Endpoints

Use only if ElevenLabs is enabled in Phase 1.

## `POST /api/audio/generate-explanation`

Auth:

```text
unlocked_owner
```

Request:

```ts
interface GenerateExplanationAudioRequest {
  sessionId: string;
  contentHash: string;
  text: string;
}
```

Returns:

```ts
ApiSuccess<{
  audioArtifactId: string;
  audioUrl: string;
  expiresAt: string;
}>
```

Rules:

- backend owns ElevenLabs key
- cache by text hash and voice version
- do not store long-lived audio unless explicitly enabled

---

## Phase 1 API Test Checklist

- unauthenticated user cannot call protected APIs
- non-owner cannot call protected APIs
- locked owner cannot call unlocked APIs
- invalid body returns `VALIDATION_ERROR`
- repeated idempotent mutation returns same response
- idempotency key with different body returns `IDEMPOTENCY_CONFLICT`
- dashboard makes no LLM call
- current lesson loads persisted state
- workflow trigger respects lock
- Telegram test uses outbox
- system status redacts secrets

---

## Final API Rule

Do not add an endpoint unless it has:

- auth level
- request schema
- response schema
- error behavior
- idempotency decision
- test expectation
