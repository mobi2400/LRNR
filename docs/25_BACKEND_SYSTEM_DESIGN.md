# LRNR - Backend System Design
> **Backend blueprint for LRNR from private MVP to product-scale system.**
> This file is the backend implementation guide: API design, database control, caching, queues, latency, observability, multi-tenancy, and open-source-first tooling.

---

## System Goal

LRNR needs a backend because the frontend must not own secrets, agent execution, database authority, RAG, Graph RAG, queues, or provider calls.

The backend must make LRNR:

- private
- fast
- debuggable
- safe to rerun
- strongly typed
- low-latency for normal UI actions
- reliable for long-running AI workflows
- ready for RAG, Graph RAG, ElevenLabs, Telegram alerts, and future expansion

This is personal-first, but it must be designed so it can become a product used by millions without rewriting the core architecture.

Important distinction:

```text
Mode 1: Private owner-only MVP
Mode 2: Invite-only beta
Mode 3: Multi-tenant public product
```

The first implementation can run in owner-only mode. The data model, auth, queues, observability, and service boundaries must not assume there will only ever be one user.

Core rule:

```text
Frontend is the learning cockpit.
Backend is the secure brain.
PostgreSQL is the source of truth.
Valkey/Redis is temporary acceleration.
Workers handle slow jobs.
```

---

## High-Level Architecture

```text
Browser / Frontend
  -> Next.js app UI
  -> Backend API
      -> Auth and owner guard
      -> Zod validation
      -> Service layer
      -> DB repositories
      -> Cache layer
      -> Queue layer
      -> Agent orchestration
      -> Provider wrappers
  -> PostgreSQL + pgvector
  -> Valkey/Redis
  -> Worker process
  -> LLM provider
  -> ElevenLabs
  -> Telegram
```

The backend should be split logically even if it starts in one repo.

Recommended runtime shape:

```text
apps/web
  Next.js frontend + route handlers for lightweight API

apps/worker
  Long-running jobs, queues, agents, scheduled workflows

packages/core
  Types, schemas, domain rules, pure helpers

packages/db
  Repositories, migrations, SQL helpers

packages/ai
  LLM, embeddings, RAG, Graph RAG, prompt builders

packages/integrations
  Telegram, ElevenLabs, scraping, notifications
```

If starting smaller, keep the same folders under `src/` and split later.

---

## Open-Source-First Tooling

Use open-source tools wherever possible. Paid APIs can still be used where they provide the core capability, but the project should avoid unnecessary vendor lock-in.

| Layer | Recommended tool | Why |
|---|---|---|
| Frontend/backend app | Next.js | One repo for UI and API routes |
| API router option | Hono or Fastify | Very fast, typed, lightweight APIs |
| Language | TypeScript | One language across frontend, backend, agents |
| Validation | Zod | Runtime boundary validation |
| Database | PostgreSQL | Durable source of truth |
| Vector search | pgvector | RAG inside PostgreSQL |
| Database platform | Supabase | Postgres, storage, RLS, quick personal deployment |
| DB client | Drizzle ORM plus postgres.js | Typed SQL, migrations, low overhead |
| App auth | Auth.js / NextAuth | Best fit for a Next.js app, supports OAuth, credentials, magic links, WebAuthn, and adapters |
| DB access protection | PostgreSQL RLS | Row-level database safety even in personal mode |
| Cache | Valkey or Redis-compatible server | Low-latency cache, locks, rate limits |
| Queue | BullMQ on Valkey/Redis | Background jobs, retries, delayed tasks |
| Workflow graph | LangGraph JS | Agent orchestration and stateful workflows |
| HTTP access logging | Morgan | Simple request/response logs for API routes and backend handlers |
| Application logging | Winston | Structured app, worker, provider, and agent logs with transports |
| Metrics | Prometheus | Open metrics collection |
| Dashboards | Grafana | Observability UI |
| Tracing | OpenTelemetry | Cross-service trace correlation |
| Testing | Vitest | Unit and integration tests |
| API docs | OpenAPI from route schemas | Contract clarity |
| Local dev | Docker Compose | Reproducible Postgres, Valkey, worker |
| Reverse proxy later | Caddy or Nginx | TLS, compression, routing |
| Object storage | Supabase Storage or MinIO | Temporary audio/files if needed |

Provider wrappers:

- `src/lib/llm.ts`
- `src/lib/embeddings.ts`
- `src/lib/elevenlabs.ts`
- `src/lib/telegram.ts`
- `src/lib/scraper.ts`

Never let agents call raw provider SDKs directly.

---

## Backend Services

Recommended service modules:

```text
src/server/auth.ts
src/server/owner.ts
src/server/request-context.ts
src/server/rate-limit.ts
src/server/cache.ts
src/server/jobs.ts
src/server/errors.ts
src/server/openapi.ts

src/db/client.ts
src/db/profile.repo.ts
src/db/curriculum.repo.ts
src/db/rag.repo.ts
src/db/knowledge.repo.ts
src/db/evaluation.repo.ts
src/db/queue.repo.ts
src/db/news.repo.ts
src/db/notifications.repo.ts

src/services/dashboard.service.ts
src/services/lesson.service.ts
src/services/evaluation.service.ts
src/services/curriculum.service.ts
src/services/rag.service.ts
src/services/audio.service.ts
src/services/notification.service.ts

src/agents/
src/graphs/
src/workers/
src/workflows/
src/types/
src/schemas/
```

Responsibilities:

- route handlers validate and authorize
- services orchestrate use cases
- repositories own database access
- agents reason
- workers run slow jobs
- providers live behind wrappers

Do not put business logic inside route handlers.

---

## Request Lifecycle

Every backend request follows the same control path:

```text
request
  -> request id
  -> auth verification
  -> owner assertion
  -> rate limit
  -> input validation
  -> service call
  -> repository/provider calls
  -> response validation
  -> structured log
```

Example route skeleton:

```ts
export async function getCurrentLesson(req: Request): Promise<Response> {
  const ctx = await buildRequestContext(req);
  assertOwner(ctx.user);
  await rateLimit(ctx, "lesson:read");

  const result = await lessonService.getCurrentLesson(ctx);
  return json(CurrentLessonResponseSchema.parse(result));
}
```

No API route should skip auth because "it is only personal use."

---

## Latency Design

Separate fast UI requests from slow AI workflows.

## Fast Path

Target: under 200-500 ms when cache is warm.

Examples:

- dashboard load
- current lesson read
- curriculum map read
- notes list
- mastery summary
- notification settings

Fast path should:

- read from cache where safe
- fall back to PostgreSQL
- avoid LLM calls
- avoid embedding calls
- avoid web scraping
- avoid long transactions

## Slow Path

Target: async job with progress status.

Examples:

- generate lesson
- run evaluation analysis
- transcribe voice answer
- generate ElevenLabs audio
- run daily research
- run nightly reconciliation
- build Graph RAG context

Slow path should:

- create job
- return `runId`
- stream or poll status
- persist final result
- notify frontend and/or Telegram

Pattern:

```text
POST /api/evaluation/start
  -> returns { runId, status: "queued" }

GET /api/runs/{runId}
  -> returns current status
```

---

## Latency Budgets

| Operation | Target | Notes |
|---|---:|---|
| Auth + owner check | < 50 ms | Verify JWT and owner ID |
| Dashboard warm cache | < 150 ms | Redis/Valkey summary |
| Dashboard cold DB | < 600 ms | Indexed DB queries |
| Current lesson read | < 300 ms | No LLM call |
| Submit text answer | < 500 ms | Store answer, enqueue eval if needed |
| Voice upload accepted | < 800 ms | Store temp audio, enqueue transcription |
| Transcription | async | Provider-bound |
| Evaluation analysis | async | LLM-bound |
| RAG query | < 800 ms | Filter first, vector second |
| Audio generation | async | ElevenLabs-bound |
| Telegram notification | async | Outbox and retry |

Golden rule:

```text
Never block a normal page load on an LLM call.
```

---

## API Design

Use JSON APIs with strict request and response schemas.

Use consistent response envelope:

```ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
```

Use stable error codes:

```text
UNAUTHORIZED
FORBIDDEN_OWNER_ONLY
VALIDATION_ERROR
NOT_FOUND
CONFLICT
RATE_LIMITED
PROVIDER_UNAVAILABLE
JOB_ALREADY_RUNNING
INVARIANT_VIOLATION
```

---

## Core API Routes

## Auth and Owner

```text
GET  /api/me
GET  /api/session
POST /api/logout
```

Purpose:

- verify current owner
- return safe profile
- never leak secrets

## Dashboard

```text
GET /api/dashboard
GET /api/dashboard/summary
```

Returns:

- current topic
- current session
- next action
- evaluation due
- active weak concepts
- alerts
- workflow status summary

Cache:

```text
dashboard:{ownerId}
ttl: 30-120 seconds
```

Invalidate on:

- lesson delivered
- answer submitted
- evaluation completed
- curriculum revised
- alert created

## Lessons

```text
GET  /api/lesson/current
GET  /api/lesson/{sessionId}
POST /api/lesson/{sessionId}/answer
POST /api/lesson/{sessionId}/mark-complete
POST /api/lesson/{sessionId}/ask-follow-up
```

Rules:

- lesson read does not call LLM
- answer write is durable
- follow-up can enqueue a slow agent job
- completion uses idempotency key

## Evaluation

```text
POST /api/evaluation/start
GET  /api/evaluation/current
POST /api/evaluation/{evaluationId}/reply
POST /api/evaluation/{evaluationId}/voice-reply
POST /api/evaluation/{evaluationId}/confirm-transcript
GET  /api/evaluation/{evaluationId}/result
```

Voice flow:

```text
voice-reply -> temp audio -> transcription job -> transcript review -> confirm -> scoring
```

Do not score unconfirmed transcripts.

## Curriculum

```text
GET /api/curriculum/map
GET /api/curriculum/session/{sessionId}
GET /api/curriculum/concept/{conceptId}
GET /api/curriculum/prerequisites/{conceptId}
```

Rules:

- frontend can view curriculum
- frontend cannot directly mutate Layer 1 or Layer 2
- mutations go through agents/services

## RAG and Graph RAG

```text
POST /api/rag/query
GET  /api/rag/memories
GET  /api/rag/memories/{memoryId}
POST /api/graph-rag/explain-path
GET  /api/graph/concepts/{conceptId}/neighbors
```

Rules:

- default RAG queries are backend-only
- UI can request safe views of memories
- Graph RAG starts as relational graph traversal
- never expose raw embeddings

## Knowledge and Sources

```text
GET /api/sources
GET /api/sources/{sourceId}
GET /api/claims
GET /api/claims/{claimId}
GET /api/concepts/{conceptId}/claims
```

Rules:

- preserve source provenance
- show trust tier
- show contradiction status

## Notes

```text
GET    /api/notes
POST   /api/notes
PATCH  /api/notes/{noteId}
DELETE /api/notes/{noteId}
```

Notes are owner-authored and private.

## Audio

```text
POST /api/audio/generate-question
POST /api/audio/generate-explanation
POST /api/audio/transcribe-answer
GET  /api/audio/{audioId}
```

Rules:

- ElevenLabs key is backend-only
- generated audio is cacheable
- transcript must be confirmed
- raw audio expires by default

## Notifications

```text
GET  /api/notifications
POST /api/notifications/telegram/test
PATCH /api/notifications/preferences
```

Rules:

- Telegram notifies and deep-links
- frontend is the study surface

## Runs and Jobs

```text
GET  /api/runs/{runId}
POST /api/workflows/daily-learning
POST /api/workflows/daily-research
POST /api/workflows/nightly-reconcile
```

Manual workflow endpoints should require owner auth and job locks.

---

## Database Control

Use strict ownership:

```text
user_profile          -> learner authority
curriculum_state      -> curriculum authority
topic_knowledge_base  -> research authority
rag_memory            -> retrieval memory
evaluation_sessions   -> evaluation evidence
agent_update_queue    -> deferred work
news_items            -> digest and news record
contradiction_queue   -> contradiction lifecycle
notes                 -> owner notes
notifications         -> outbound and in-app alerts
job_runs              -> async job state
```

Add new backend-control tables:

```text
job_runs
api_idempotency_keys
delivery_outbox
notification_preferences
audio_artifacts
concepts
concept_prerequisites
session_concepts
learner_concept_mastery
source_claims
claim_sources
```

These support frontend, Graph RAG, voice, and background jobs.

---

## Recommended Database Tables

## `job_runs`

Tracks async work.

```sql
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_type text not null,
  status text not null,
  input jsonb not null default '{}',
  output jsonb,
  error jsonb,
  idempotency_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
```

Indexes:

```sql
create index job_runs_user_status_idx on job_runs (user_id, status, created_at desc);
create unique index job_runs_idempotency_idx on job_runs (user_id, idempotency_key)
where idempotency_key is not null;
```

## `api_idempotency_keys`

Prevents duplicate client actions.

```sql
create table api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  key text not null,
  route text not null,
  request_hash text not null,
  response jsonb,
  status text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
```

## `delivery_outbox`

Reliable outbound side effects.

```sql
create table delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channel text not null,
  delivery_key text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, delivery_key)
);
```

Use this for Telegram notifications and any future email/push.

## `audio_artifacts`

Tracks temporary/generated audio.

```sql
create table audio_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  artifact_type text not null,
  source_text_hash text,
  storage_path text,
  transcript text,
  transcript_status text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

Rules:

- raw user answer audio expires by default
- confirmed transcript lives in `evaluation_sessions`
- generated question/explanation audio can be regenerated

## `concepts`

```sql
create table concepts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null,
  slug text not null,
  name text not null,
  summary text,
  created_at timestamptz not null default now(),
  unique (topic_id, slug)
);
```

## `concept_prerequisites`

```sql
create table concept_prerequisites (
  topic_id uuid not null,
  concept_id uuid not null,
  prerequisite_concept_id uuid not null,
  strength text not null default 'required',
  created_at timestamptz not null default now(),
  primary key (concept_id, prerequisite_concept_id)
);
```

Use this for topological sort and Graph RAG Phase 1.

## `learner_concept_mastery`

```sql
create table learner_concept_mastery (
  user_id uuid not null,
  concept_id uuid not null,
  can_solve numeric not null default 0,
  can_explain numeric not null default 0,
  can_decide numeric not null default 0,
  confidence numeric not null default 0,
  last_evidence_at timestamptz,
  next_probe_due_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);
```

---

## Database Access Rules

Use repositories, not raw SQL in agents.

Rules:

- every write function has a caller or actor
- repositories validate domain permission
- transactions wrap multi-table effects
- optimistic concurrency protects curriculum revisions
- RLS stays enabled
- service role is backend-only

Example:

```ts
await curriculumRepo.updateLayer2({
  actor,
  curriculumId,
  expectedRevision,
  nextLayer2,
  source: "curriculum_builder_node",
});
```

This function must enforce:

- caller is Curriculum Builder
- N+2 rule
- revision match
- valid session shape

---

## Transaction Patterns

## Pattern 1 - Fast user action

```text
begin
  insert answer
  create job_run
  enqueue job
commit
```

Return immediately with `runId`.

## Pattern 2 - Queue processing

```text
claim queue items quickly
commit
perform slow work outside lock
begin
  validate result
  update authoritative tables
  mark queue items processed
commit
```

Never hold DB locks during LLM or provider calls.

## Pattern 3 - Outbox delivery

```text
begin
  write state change
  insert delivery_outbox row
commit
worker sends Telegram
worker marks outbox sent
```

This prevents losing external side effects.

---

## Caching Strategy

Use Valkey/Redis for temporary acceleration.

Cache classes:

| Cache | Key | TTL | Invalidation |
|---|---|---:|---|
| Dashboard summary | `dashboard:{userId}` | 30-120s | lesson/eval/curriculum changes |
| Current lesson | `lesson:current:{userId}` | 60-300s | session status changes |
| Curriculum map | `curriculum:map:{userId}:{revision}` | 5-30m | revision change |
| RAG query | `rag:{hash}` | 1-10m | memory write/resolution |
| Graph neighbors | `graph:concept:{conceptId}:v{revision}` | 10-60m | graph edge change |
| Provider result | `provider:{type}:{hash}` | short | content/model version change |
| Audio metadata | `audio:{hash}:{voice}` | 1-24h | voice/text change |
| Job status | `run:{runId}` | 1-24h | job complete/expired |
| Rate limit | `rate:{userId}:{scope}` | window | automatic |
| Lock | `lock:{jobType}:{key}` | short | release/expiry |

Do not cache:

- service-role credentials
- raw private prompts
- raw embeddings
- permanent mastery truth
- authoritative curriculum state as the only copy

---

## Queue Design

Use BullMQ backed by Valkey/Redis for job execution.

Queues:

```text
learning-queue
evaluation-queue
audio-queue
rag-queue
research-queue
notification-queue
reconcile-queue
```

Job rules:

- every job has `userId`
- every job has `jobRunId`
- every job has idempotency key where appropriate
- every job writes status to `job_runs`
- every job logs start/end/duration
- retries are bounded
- failures are visible in System Status page

Example job payload:

```ts
interface EvaluationAnalysisJob {
  jobRunId: string;
  userId: string;
  evaluationSessionId: string;
  answerId: string;
  idempotencyKey: string;
}
```

---

## RAG and Graph RAG Backend

RAG flow:

```text
validate query purpose
filter by owner/user
filter by topic/concept/event type
vector search inside narrowed set
lexical search where needed
rerank
return safe context pack
```

Graph RAG Phase 1/2 flow:

```text
load concept
load prerequisites and dependents
load learner mastery
load related sessions
load related claims and sources
load relevant memories
assemble relationship-aware context
```

Backend endpoints should not expose raw vector internals. Return explanations:

```text
This concept is shown because:
- it is a prerequisite of today's lesson
- mastery confidence is low
- evaluation found a misconception
- it appears in session 6
```

---

## Authentication and Authorization

Use four layers:

1. Auth.js / NextAuth verifies the app session
2. owner allowlist verifies the session belongs to the approved owner
3. private login secret verifies the user knows the LRNR access passphrase
4. RLS and repository checks protect database access

Why Auth.js/NextAuth:

- LRNR is a Next.js app
- it integrates cleanly with Next.js route handlers and middleware
- it supports OAuth providers, credentials, magic links, and WebAuthn/passkeys
- it can use database adapters such as Drizzle or Supabase if needed
- it keeps app-session logic close to the app

Recommended auth layers:

```text
Layer 1: Auth.js provider login
Layer 2: owner email/user id allowlist
Layer 3: private LRNR access secret
Layer 4: database RLS + repository authorization
```

Environment variables:

```text
AUTH_SECRET=
AUTH_TRUST_HOST=true
OWNER_EMAIL=
OWNER_USER_ID=
LRNR_ACCESS_SECRET_HASH=
LRNR_ACCESS_SECRET_SALT=
```

Owner guard:

```ts
function assertOwner(user: AuthenticatedUser): void {
  const isOwnerId = user.id === process.env.OWNER_USER_ID;
  const isOwnerEmail = user.email === process.env.OWNER_EMAIL;

  if (!isOwnerId && !isOwnerEmail) {
    throw new UnauthorizedError("LRNR is private to the owner");
  }
}
```

Private secret guard:

```ts
async function assertLrnrSecret(inputSecret: string): Promise<void> {
  const ok = await verifySecretHash({
    input: inputSecret,
    hash: process.env.LRNR_ACCESS_SECRET_HASH!,
    salt: process.env.LRNR_ACCESS_SECRET_SALT!,
  });

  if (!ok) {
    throw new UnauthorizedError("Invalid LRNR access secret");
  }
}
```

Do not store the secret in plain text. Store only a hash.

Even for single-user mode, every protected request should pass owner guard. The private secret is required at login/unlock time and can create a short-lived `lrnr_unlocked` session claim.

---

## Rate Limiting

Use Valkey/Redis token buckets.

Scopes:

```text
api:read
api:write
agent:start
audio:generate
audio:transcribe
rag:query
notification:test
workflow:manual
```

Personal use does not remove the need for rate limits. Bugs and accidental loops can still happen.

---

## ElevenLabs Integration

Backend owns all ElevenLabs calls.

Use cases:

- generate voice for evaluation question
- generate voice for explanation from another angle
- generate encouragement between questions
- optionally transcribe or process voice answer if chosen provider supports it

Critical rules:

- frontend never sees API key
- text is source of truth
- confirmed transcript is evaluated
- raw answer audio expires by default
- audio generation is async
- cache generated audio by text hash and voice version

Voice answer path:

```text
frontend records audio
backend stores temp artifact
audio queue transcribes
frontend shows transcript
owner edits/confirms
evaluation job scores confirmed transcript
```

---

## Telegram Integration

Telegram is not the learning surface.

Telegram sends:

- lesson-ready alert
- evaluation reminder
- digest alert
- workflow failure alert
- dead-letter/queue alert

Use outbox:

```text
state change -> delivery_outbox -> notification worker -> Telegram
```

Every Telegram send must have a delivery key.

---

## Observability

Use:

- Morgan for HTTP access logs
- Winston for structured application logs
- OpenTelemetry traces
- Prometheus metrics
- Grafana dashboards
- Phoenix or Langfuse for RAG/LLM trace inspection
- RAGAS-style scripts or Phoenix evals for retrieval/answer evaluation

Reference:

```text
https://mallahyari.github.io/rag-ebook/05_observability_tools.html
```

Every request logs:

- request id
- user id
- route
- status code
- duration
- cache hit/miss
- job id if created

Morgan responsibility:

- HTTP method
- path
- status code
- response time
- response size
- request id
- user id hash if available

Morgan should not log:

- raw request body
- auth headers
- cookies
- voice transcripts
- private RAG context

Every job logs:

- job id
- job type
- run id
- duration
- status
- retry count
- provider latency

Winston responsibility:

- structured app logs
- worker lifecycle logs
- provider call logs
- agent decision logs
- RAG retrieval logs
- authentication/security events
- error logs with safe stack traces

Required Winston fields:

```text
timestamp
level
service
environment
request_id
user_id_hash
job_id
agent
event
duration_ms
error_code
metadata
```

Recommended Winston transports:

```text
development:
  console pretty output

production:
  JSON console output
  optional file or log-drain transport
```

Do not use Winston/Morgan as a replacement for traces or metrics.

```text
Morgan tells what HTTP request happened.
Winston tells what the application decided.
OpenTelemetry tells where time went across services.
Prometheus tells whether the system is healthy over time.
Grafana shows the operating picture.
```

Metrics:

```text
api_request_duration_ms
api_request_count
cache_hit_ratio
job_duration_ms
job_failure_count
queue_depth
oldest_pending_job_age
rag_query_duration_ms
llm_latency_ms
audio_generation_latency_ms
telegram_send_failure_count
db_query_duration_ms
```

RAG-specific traces:

```text
rag.request
rag.route_intent
rag.query_rewrite
rag.permission_filter
rag.lexical_retrieval
rag.vector_retrieval
rag.rank_fusion
rag.rerank
rag.confidence_gate
rag.context_pack_build
llm.generate
rag.citation_verify
rag.evaluation_log
```

RAG-specific metrics:

```text
rag_empty_retrieval_rate
rag_confidence_refusal_rate
rag_citation_verification_failure_rate
rag_permission_filter_failure_count
rag_reranker_top_score
rag_context_token_count
rag_retrieval_mode_count
rag_query_rewrite_count
rag_stale_context_count
rag_cost_per_answer
```

RAG observability must avoid leaking private learning data.

Safe to send to external tools:

- hashed user id
- trace id
- route name
- retrieval mode
- candidate counts
- scores
- latencies
- token counts
- model/provider names

Not safe unless explicitly approved:

- raw learner memory
- raw voice transcripts
- private source text
- secrets
- full prompts containing sensitive context

For private local development, full traces can be stored locally if the machine is trusted. For public product mode, traces must be redacted by default.

---

## System Status Page Data

Backend should expose safe system health:

```text
GET /api/system/status
```

Returns:

- Postgres reachable
- Valkey/Redis reachable
- queue depth
- failed jobs
- last daily learning run
- last daily research run
- last reconcile run
- Telegram status
- ElevenLabs status
- LLM provider status
- RAG health
- Graph RAG graph revision

Do not expose secrets.

---

## Testing Strategy

Unit tests:

- owner guard
- Zod schemas
- topological sort
- cache key builders
- idempotency helpers
- route service logic

Integration tests:

- DB repositories
- RLS policies
- transaction rollback
- queue claim/process
- Redis cache
- outbox delivery

API tests:

- every route rejects unauthenticated
- every route rejects non-owner
- invalid body returns validation error
- idempotency key prevents duplicate effect
- dashboard cache invalidates

Workflow tests:

- lesson generation job
- evaluation voice transcript flow
- RAG query flow
- reconcile flow
- Telegram alert flow

Performance tests:

- dashboard warm/cold latency
- RAG filtered query latency
- curriculum map load
- queue throughput

---

## Build Order

## Backend Slice 1 - Private Core

Build:

- Next.js backend routes or Fastify/Hono API
- Auth.js / NextAuth setup
- owner allowlist
- private access secret layer
- owner guard
- env validation
- Postgres connection
- RLS policies
- core repositories
- dashboard API
- current lesson API
- notes API
- Redis/Valkey connection
- basic rate limit
- job_runs table
- System Status minimal page data

Done when:

- only owner can call APIs
- dashboard loads from backend
- current lesson loads without LLM call
- Redis cache works
- unauthorized requests are blocked

## Backend Slice 2 - Learning Workflows

Build:

- answer submission
- evaluation APIs
- voice answer transcription flow
- ElevenLabs audio generation
- BullMQ workers
- RAG query service
- lesson generation job
- evaluation scoring job
- notification outbox
- Telegram lesson/evaluation alerts

Done when:

- owner can answer by text or voice
- transcript is confirmed before scoring
- evaluation writes durable records
- Telegram can alert owner to continue on site

## Backend Slice 3 - Intelligence and Operations

Build:

- Graph RAG relational traversal
- concept prerequisite APIs
- topological sort service
- source/claim explorer APIs
- daily research workflow
- nightly reconciliation workflow
- full observability
- provider health checks
- advanced cache invalidation

Done when:

- curriculum graph drives ordering
- RAG and graph context improve teaching/evaluation
- system status shows real operational truth
- failures are visible and recoverable

---

## Backend Guardrails

- No LLM call inside normal page-load request path.
- No raw provider SDKs in agents.
- No service-role key in frontend.
- No unconfirmed voice transcript enters evaluation.
- No direct Layer 2 mutation outside Curriculum Builder.
- No RAG retrieval without owner/user filtering.
- No Redis as source of truth.
- No long DB locks during provider calls.
- No workflow without idempotency.
- No endpoint without Zod validation.
- No route without owner guard.
- Use hybrid orchestration: sequential for dependent agent outputs, parallel for independent reads/fetches/checks with explicit fan-in validation.
- Do not parallelize conflicting writes to the same authoritative state without transaction or revision protection.

---

## Final Architecture Statement

LRNR backend should be designed as a private, low-latency learning operating system:

```text
Auth protects access.
PostgreSQL protects truth.
Valkey/Redis protects speed.
Queues protect slow work.
Repositories protect database control.
Agents protect reasoning boundaries.
RAG protects memory.
Graph RAG protects relationships.
Observability protects debugging.
Telegram protects attention.
ElevenLabs protects voice UX.
```

Build it simple first, but with the correct boundaries from day one.

---

## Product-Scale Design Requirement

LRNR must be designed for eventual millions of users.

That does not mean building every scale feature on day one. It means avoiding decisions that make scale impossible later.

Required from day one:

- every user-owned row has `user_id`
- every organization/team-owned row later can add `tenant_id`
- no global singleton learner state
- no hard-coded owner ID in domain logic
- owner-only access is a deployment mode, not a data-model assumption
- RAG always filters by user/tenant
- queues are partitionable by user/tenant/priority
- API routes enforce auth consistently
- provider calls are rate-limited and metered
- observability includes user-safe correlation IDs
- migrations are versioned
- background jobs are idempotent

The product-scale mindset:

```text
Start private.
Code multi-tenant boundaries.
Enable public access only when ready.
```

---

## Deployment Modes

## Mode 1 - Private Owner MVP

Used now.

Rules:

- Auth.js login required
- owner allowlist required
- private LRNR access secret required
- public signup disabled
- one real learner account

## Mode 2 - Invite-Only Beta

Used when trusted testers are added.

Changes:

- invitation table
- allowed emails
- per-user onboarding
- user-specific quotas
- admin-only invite creation
- no public self-serve signup

## Mode 3 - Public Product

Used only after reliability, security, and cost controls are ready.

Changes:

- public signup
- billing/subscriptions
- tenant model if teams are supported
- abuse prevention
- stronger quota enforcement
- support/admin tooling
- privacy/export/delete flows
- production SLOs

Architecture must allow this progression.

---

## Multi-Tenant Data Model Direction

Even in private mode, design tables with future multi-user support.

Minimum:

```text
user_id on every learner-owned row
```

Future:

```text
tenant_id on organization-owned rows
```

Recommended identity model:

```text
users
tenants
tenant_memberships
user_profile
curriculum_state
rag_memory
evaluation_sessions
```

For personal mode:

```text
tenant_id = personal workspace id
```

This avoids a painful migration later if LRNR adds teams.

Required indexing pattern:

```sql
create index on rag_memory (user_id, topic_id, event_type, created_at desc);
create index on curriculum_state (user_id, status, updated_at desc);
create index on evaluation_sessions (user_id, topic_id, created_at desc);
create index on agent_update_queue (user_id, status, priority, available_at);
```

Future tenant indexes:

```sql
create index on rag_memory (tenant_id, user_id, topic_id, event_type);
create index on job_runs (tenant_id, status, created_at desc);
```

---

## Scale Targets

Design target tiers:

| Tier | Users | Backend posture |
|---:|---:|---|
| Private | 1 | owner-only, simple deployment |
| Alpha | 10-100 | invite-only, manual ops acceptable |
| Beta | 1k-10k | queues, quotas, observability required |
| Growth | 100k-1M | horizontal workers, DB tuning, cache discipline |
| Large scale | 1M+ | partitioning, multi-region strategy, provider routing |

The current build should implement the Private tier while preserving Alpha/Beta/Growth paths.

---

## Build Now vs Build Later

The backend should be product-scale-ready, not product-scale-bloated.

Build now:

- `user_id` on learner-owned tables
- consistent auth middleware
- owner-only access mode
- repository authorization checks
- pagination on every list endpoint
- idempotency keys for expensive mutations
- Redis/Valkey rate limits
- BullMQ workers for slow jobs
- structured logs with request IDs
- usage event tracking for expensive provider calls

Design now, implement later:

- public signup
- billing
- tenant/team workspaces
- table partitioning
- read replicas
- multi-region deployment
- advanced analytics warehouse
- dedicated vector database
- provider marketplace/routing engine

This is the core scaling rule:

```text
Do not build every scale feature early.
Do not make choices that block scale later.
```

---

## Horizontal Scaling Plan

Stateless services:

- Next.js API servers
- API route handlers
- dashboard read APIs
- lesson read APIs

Stateful systems:

- PostgreSQL
- Valkey/Redis
- object storage
- queue workers

Scale by:

- keeping API servers stateless
- using Redis/Valkey for shared cache and locks
- using BullMQ workers for slow tasks
- partitioning queues by job type
- separating read-heavy APIs from long-running agent work
- adding read replicas for analytics/read-heavy pages later

Do not store important state in process memory.

---

## Database Scaling Plan

PostgreSQL can carry LRNR far if the schema is disciplined.

Use:

- proper composite indexes
- `user_id` and later `tenant_id` filters
- pagination everywhere
- no unbounded list endpoints
- JSONB only where flexible structure is needed
- relational columns for filtering, status, ordering, joins
- table partitioning later for high-volume event tables

High-growth tables likely to need partitioning:

- `rag_memory`
- `job_runs`
- `delivery_outbox`
- `news_items`
- `evaluation_sessions`
- audit logs if stored in Postgres

Possible partition keys:

```text
created_at month
tenant_id hash
user_id hash
```

Do not partition early unless operationally needed. But keep access patterns compatible.

---

## RAG Scaling Plan

RAG can become expensive quickly.

The backend should treat RAG as trust engineering, not just retrieval engineering.

Core question:

```text
Can the backend prove the answer from allowed, fresh, relevant evidence?
```

Rules:

- validate ingestion quality before embedding
- deduplicate source content and learner-memory writes
- preserve source version, source URI, chunk hash, and metadata quality where applicable
- filter by tenant/user before vector search
- enforce permissions inside retrieval queries, not only at the UI/API boundary
- filter by topic/concept/event type when possible
- cap top-k
- avoid embedding duplicate events
- batch embedding writes
- keep embedding version explicit
- cache safe retrieval results briefly
- measure retrieval latency and relevance
- route retrieval through a single RAG controller
- support metadata, semantic, lexical, hybrid, hierarchical, and graph-enhanced modes
- use query rewriting only with logged original query, rewritten query, and inferred filters
- merge lexical and vector candidates with a deterministic rank-fusion strategy
- rerank top candidates before prompt assembly
- apply confidence gates before generation or final answer delivery
- return structured context packs with provenance and ranking signals
- reorder large context packs to reduce lost-in-the-middle failures
- verify citations for source-backed answers
- evaluate retrieval changes against a curated RAG test dataset before making them default

Production RAG pipeline:

```text
Ingest
  -> deduplicate
  -> normalize
  -> version
  -> enrich metadata
  -> semantic/hierarchical chunking
  -> embedding index + lexical index

Query
  -> authorize
  -> permission-scoped retrieval
  -> hybrid dense/sparse retrieval
  -> reciprocal rank fusion
  -> cross-encoder reranking
  -> confidence gate
  -> context pack assembly
  -> LLM generation
  -> citation verification
  -> response or refusal
  -> trace/evaluation logging
```

The system must be allowed to refuse when evidence is weak.

Example refusal:

```text
I do not have enough reliable evidence to answer that yet.
```

This is better than a fluent unsupported answer.

At larger scale:

- separate hot and cold memories
- archive low-value memories
- partition by user/tenant/time
- maintain concept-level summaries
- maintain learner-history question-answer memory for safe repeated-question cache hits
- use Graph RAG to reduce noisy broad vector search
- consider dedicated vector infrastructure only if pgvector becomes limiting
- add golden-dataset regression tests for retrieval and answer faithfulness
- track hallucination rate, citation verification failures, and permission-boundary failures

Required RAG metrics:

- ingestion deduplication rate
- metadata completeness score
- retrieval precision
- retrieval recall
- reranker top score
- confidence-gate refusal rate
- citation verification failure rate
- hallucination rate from evaluation traces
- permission-filter failure count
- per-stage latency for retrieval, reranking, generation, and verification

Do not start with a separate vector database unless PostgreSQL/pgvector proves insufficient.

---

## Queue Scaling Plan

Queues must support many users later.

Queue partitioning:

```text
learning-queue
evaluation-queue
audio-queue
rag-queue
research-queue
notification-queue
reconcile-queue
```

Future partitioning:

```text
learning-queue:high
learning-queue:normal
audio-queue:realtime
audio-queue:batch
research-queue:free
research-queue:paid
```

Fairness rules:

- avoid one user monopolizing workers
- cap concurrent jobs per user
- cap provider calls per user
- prioritize interactive jobs over batch research
- move failed jobs to dead-letter
- expose queue health in System Status

Large-scale queue metrics:

- queue depth by type
- oldest pending age
- retries
- dead-letter count
- average processing time
- provider rate-limit count

---

## Quotas and Cost Controls

At product scale, provider costs can kill the system.

Track usage:

- LLM tokens
- embeddings generated
- ElevenLabs characters/audio seconds
- transcription minutes
- Telegram sends
- scraped pages
- RAG queries
- background job count

Add tables later:

```text
usage_events
user_quotas
billing_accounts
subscription_plans
```

Even before billing, enforce safety quotas:

- max agent runs per hour
- max audio generation per day
- max research fetches per day
- max RAG queries per minute
- max workflow retries

Personal mode can set high limits for owner, but the mechanism should exist.

---

## API Scale Rules

All list endpoints must support:

- pagination
- sort order
- filters
- stable cursors where needed

No endpoint should return unlimited rows.

Bad:

```text
GET /api/rag/memories
```

Better:

```text
GET /api/rag/memories?topicId=...&eventType=...&cursor=...&limit=50
```

All mutation endpoints should support:

- idempotency key
- validation
- conflict handling
- clear error code

---

## Multi-Region Future

Do not build multi-region in MVP.

But avoid assumptions that block it.

Future strategy:

- primary region close to owner/users
- CDN for static frontend assets
- object storage with CDN for generated audio if retained
- read replicas for global reads later
- queue workers near primary DB
- provider routing by latency/cost

Hard rule:

```text
Strongly consistent learner state stays in primary database.
```

Do not create multi-region write complexity until the product truly needs it.

---

## Product-Scale Auth Direction

Private mode:

```text
Auth.js login + owner allowlist + private access secret
```

Invite-only beta:

```text
Auth.js login + invitation table + optional access code
```

Public product:

```text
Auth.js login + verified email + abuse prevention + billing/plan checks
```

RLS and repository authorization stay in every mode.

Owner-only logic should be configuration:

```text
ACCESS_MODE=owner_only | invite_only | public
```

Do not scatter owner-only assumptions across the codebase.

---

## Product-Scale Observability

For millions of users, debugging by logs alone is impossible.

Need:

- request traces
- user-safe correlation IDs
- metrics dashboards
- queue dashboards
- provider cost dashboards
- retrieval quality dashboards
- error budgets
- alert routing

Production dashboards:

- API latency p50/p95/p99
- dashboard load latency
- RAG latency
- LLM latency by provider/model
- ElevenLabs latency
- queue depth and age
- failed jobs
- DB connection pool
- cache hit rate
- cost per active user
- daily active learners
- lesson completion rate
- evaluation completion rate

---

## Product-Scale Security

Needed before public launch:

- threat model
- RLS audit
- auth callback hardening
- CSRF protection
- secure cookies
- rate limits
- abuse monitoring
- admin access separation
- audit logs
- data export
- data deletion
- provider key rotation
- dependency scanning
- secret scanning

Private mode can be simpler, but do not skip the boundaries.

---

## Product-Scale Build Milestones

### Milestone 1 - Private MVP

Goal:

- works for the owner
- clean backend boundaries
- no hardcoded data-model singleton

### Milestone 2 - Invite-Only Alpha

Goal:

- 10-100 users
- invitation system
- per-user quotas
- basic admin visibility
- real observability

### Milestone 3 - Beta

Goal:

- 1k-10k users
- robust queues
- provider cost controls
- onboarding scale
- cache hit-rate optimization
- privacy/export/delete flows

### Milestone 4 - Growth Product

Goal:

- 100k+ users
- partitioning where needed
- stronger Graph RAG
- provider fallback/routing
- billing
- SLOs
- incident response

### Milestone 5 - Millions

Goal:

- horizontal API scale
- scaled workers
- partitioned high-volume tables
- read replicas
- advanced analytics pipeline
- mature operations

Non-negotiable by this stage:

- every data access path is tenant/user scoped
- every expensive action has quota enforcement
- every slow action is async or streamed
- every provider integration has fallback behavior
- every production incident has enough traces, logs, and metrics to debug
