# LRNR - Phase 1 Private Core Flow
> **Phase 1 implementation blueprint.**
> Build this before Evaluation, Scout, News Intelligence, full Graph RAG, analytics, or public product work.

---

## Phase 1 Goal

Phase 1 proves the core LRNR promise:

```text
Give LRNR a learning goal.
LRNR understands the learner.
LRNR researches the topic.
LRNR builds a curriculum.
LRNR teaches the first useful lesson.
LRNR stores enough memory to continue tomorrow.
```

Phase 1 is not the final product.

It is the first trustworthy private version.

---

## Product Mode

Phase 1 runs in:

```text
ACCESS_MODE=owner_only
```

Rules:

- only the owner can log in
- no public signup
- no team accounts
- no billing
- no shared dashboards
- no anonymous pages

The code should still be written with future multi-user boundaries:

- every learner-owned row has `user_id`
- repositories enforce owner/user scope
- RAG filters by user before retrieval
- Redis keys include user scope where relevant
- owner-only mode is configuration, not hardcoded domain logic

---

## Phase 1 User Experience

The user-facing experience should feel simple:

```text
Login
  -> unlock private LRNR
  -> see dashboard
  -> submit learning goal
  -> answer onboarding questions
  -> wait while LRNR researches and builds curriculum
  -> open first lesson
  -> study lesson
  -> review recap/questions
  -> receive Telegram reminder/alert when needed
```

Frontend is the main learning cockpit.

Telegram is for:

- lesson-ready alerts
- reminders
- workflow failure alerts
- deep links back to the frontend

Telegram is not the primary study surface in Phase 1.

---

## Phase 1 System Flow

```text
Owner opens LRNR
  -> Auth.js / NextAuth login
  -> owner allowlist check
  -> private access secret unlock
  -> dashboard loads
  -> owner submits learning goal
  -> Architect onboarding starts
  -> onboarding answers are stored
  -> onboarding seed is written to RAG
  -> topic brief is created
  -> Cartographer researches topic
  -> topic knowledge base is written
  -> Curriculum Builder creates Layer 1 roadmap and Layer 2 sessions
  -> first session becomes ready
  -> Teaching Agent generates first lesson
  -> lesson is shown in frontend
  -> Telegram sends lesson-ready notification
  -> session summary is written to RAG
  -> delivery state is marked idempotently
```

---

## Phase 1 Architecture Flow

```text
Frontend
  -> Backend API
    -> Auth/session guard
    -> owner unlock guard
    -> Zod validation
    -> services
    -> repositories
    -> PostgreSQL/Supabase
    -> Redis/Valkey
    -> agent workflows
    -> provider wrappers
      -> LLM
      -> embeddings
      -> Telegram
      -> ElevenLabs if enabled
```

Backend owns all sensitive logic.

Frontend only displays, collects, and guides.

---

## Phase 1 Includes

### Foundation

- project scaffold
- TypeScript strict mode
- env validation
- folder structure
- package scripts
- linting/formatting
- `AGENTS.md` compliance
- `@mobasshirkhan/docguard` installed

### Authentication

- Auth.js / NextAuth setup
- owner email/user id allowlist
- private LRNR access secret
- `lrnr_unlocked` session/cookie claim
- backend owner guard on all protected APIs
- RLS enabled on learner-owned tables

### Database

Use the schema plan from:

```text
docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md
```

Phase 1 needs at minimum:

- `user_profile`
- `topic_briefs`
- `curriculum_state`
- `topic_knowledge_base`
- `rag_memory`
- `job_runs`
- `api_idempotency_keys`
- `delivery_outbox`
- `notification_preferences`
- basic `concepts`
- basic `concept_prerequisites`
- optional `audio_artifacts` if ElevenLabs is enabled in Phase 1

Phase 1 should prepare, but does not need to fully use:

- `evaluation_sessions`
- `learner_concept_mastery`
- `source_claims`
- `claim_sources`
- `rag_query_traces`

### Backend

Build:

- request context
- owner guard
- Zod request validation
- response envelope
- Winston application logger
- Morgan HTTP logger
- Redis/Valkey connection
- basic rate limits
- job lock helper
- idempotency helper
- dashboard API
- current lesson API
- goal submission/onboarding APIs
- workflow start/status APIs
- Telegram notification API
- settings/notification preferences API
- minimal system status API

### Frontend

Minimum Phase 1 pages:

1. Private Login
2. Learning Dashboard
3. Daily Lesson
4. Lesson Review
5. Curriculum Map
6. Settings

Optional if time allows:

- Alerts and Notifications page
- minimal System Status card inside dashboard

Frontend quality bar:

- top-notch UI
- responsive desktop/mobile layout
- clear progress state
- clear loading/error states
- no raw technical errors shown to user
- frontend never exposes provider keys

### Agents

Build only the core loop agents:

- Architect Agent
- Cartographer Agent
- Curriculum Builder in initial mode
- Teaching Agent

Do not build full:

- Evaluation Agent
- Scout Agent
- News Intelligence Agent
- Contradiction Agent

### RAG

Phase 1 RAG scope:

- onboarding seed writes
- session summary writes
- metadata-filtered retrieval basics
- embedding generation
- idempotent RAG writes
- user/topic/event filters

Phase 1 RAG does not need full:

- cross-encoder reranking
- advanced confidence gates
- full citation verification
- Graph RAG traversal
- learner-history cache

But the code should follow the final pipeline shape so these can be added later.

### Telegram

Telegram in Phase 1 sends:

- lesson-ready alert
- reminder alert
- workflow failure alert
- deep link back to frontend

Use `delivery_outbox` to prevent duplicate sends.

### ElevenLabs

ElevenLabs is optional but allowed in Phase 1 if included carefully.

Allowed Phase 1 use:

- generate audio explanation for lesson section
- generate audio for review question
- backend-only API key
- short-lived audio metadata/cache

Not Phase 1:

- full voice evaluation
- scoring spoken answers
- long-term raw voice archive

---

## Phase 1 Excludes

Do not build these in Phase 1:

- full Evaluation Agent
- spoken/written evaluation scoring loop
- mastery dashboard
- Scout/news live intelligence
- contradiction workflow
- nightly reconcile workflow
- full Graph RAG
- full source explorer
- advanced analytics dashboards
- billing
- public signup
- multi-user/team workspace
- admin tools

Reason:

These depend on a stable core learning loop and meaningful accumulated evidence.

---

## Phase 1 Build Order

### Step 1 - Scaffold

Build:

- Next.js project
- TypeScript config
- env schema
- lint/format scripts
- folder structure
- package install
- base CI/build script if needed

Done when:

- app runs locally
- env validation works
- TypeScript compiles

### Step 2 - Database and Auth Foundation

Build:

- Drizzle setup
- first migrations
- Supabase/Postgres connection
- RLS policies
- Auth.js / NextAuth
- owner allowlist
- private access secret layer

Done when:

- only owner can access protected APIs
- unauthorized requests fail
- base tables exist
- RLS is enabled

### Step 3 - Backend Infrastructure

Build:

- request context
- response envelope
- error classes
- Zod schema helpers
- Winston/Morgan logging
- Redis connection
- rate limit helper
- job lock helper
- idempotency helper

Done when:

- every request has request id
- logs are structured
- Redis health check works
- duplicate protected action can be prevented

### Step 4 - Core Repositories

Build repositories for:

- profile
- topic briefs
- curriculum
- knowledge base
- RAG
- jobs
- outbox
- notification preferences

Done when:

- repository methods enforce user scope
- write/read tests pass
- no agent uses raw DB calls

### Step 5 - Frontend Private Shell

Build:

- login/unlock page
- app shell/navigation
- dashboard layout
- settings page
- loading/error states

Done when:

- owner can log in
- locked user cannot access app
- dashboard shell loads from backend

### Step 6 - Architect Onboarding

Build:

- learning goal submission
- onboarding conversation state
- Architect prompts
- profile write
- topic brief write
- onboarding RAG seed

Done when:

- owner can submit a goal
- onboarding completes
- profile/topic brief/RAG rows are created

### Step 7 - Cartographer Research

Build:

- source discovery/fetch wrapper
- topic research extraction
- topic knowledge base write
- provenance metadata

Done when:

- real sources produce usable topic knowledge
- weak/failed sources do not crash the workflow
- topic knowledge base supports lesson generation

### Step 8 - Curriculum Builder Initial Mode

Build:

- concept outline normalization
- basic prerequisite ordering
- Layer 1 roadmap
- Layer 2 session generation
- current session pointer

Done when:

- curriculum state exists
- sessions are coherent
- first session can be loaded without LLM call

### Step 9 - Teaching Flow

Build:

- lesson generation
- lesson persistence inside curriculum/session state
- frontend lesson page
- lesson review page
- session summary RAG write
- delivery status update

Done when:

- first lesson renders in frontend
- lesson is grounded in topic knowledge
- session summary is stored in RAG

### Step 10 - Telegram Alerting

Build:

- Telegram provider wrapper
- delivery outbox send worker or simple processor
- lesson-ready alert
- workflow failure alert
- duplicate delivery protection

Done when:

- Telegram sends a link/alert
- rerun does not duplicate alert

### Step 11 - Observability and Tests

Build:

- logs
- minimal traces
- core metrics
- health endpoint
- unit tests
- integration tests
- end-to-end manual test script

Done when:

- failures are debuggable
- core tests pass
- manual Phase 1 flow works end to end

---

## Phase 1 API Surface

Exact request/response schemas will be finalized during implementation, but Phase 1 needs these route groups:

```text
GET  /api/me
POST /api/unlock
GET  /api/dashboard
GET  /api/lesson/current
POST /api/goals/start
POST /api/onboarding/reply
GET  /api/workflows/{runId}
POST /api/workflows/daily-learning
GET  /api/curriculum/map
GET  /api/settings
PATCH /api/settings
POST /api/notifications/telegram/test
GET  /api/system/status
```

Optional if ElevenLabs is enabled:

```text
POST /api/audio/generate-explanation
POST /api/audio/generate-question
```

Rules:

- all protected APIs require owner auth
- all bodies validated with Zod
- all responses use stable envelope
- all mutations support idempotency where needed

---

## Phase 1 Data Written

Phase 1 should create and update:

- owner profile
- topic brief
- topic knowledge base
- curriculum state
- RAG onboarding memory
- RAG session summary memory
- job runs
- delivery outbox records
- notification preferences
- optional audio artifacts

Phase 1 should not depend on:

- evaluation history
- mastery dashboard data
- live news data
- contradiction lifecycle data

---

## Phase 1 Testing Plan

### Unit Tests

- env validation
- owner guard
- access secret validation
- Redis key builders
- idempotency helpers
- message formatting
- curriculum session shape validation
- RAG canonical content formatting

### Integration Tests

- profile write/read
- topic brief write/read
- curriculum create/load
- RAG write/query
- outbox write/send mark
- job run create/update
- auth-protected route rejection

### Manual End-To-End Test

1. Start with fresh database state.
2. Log in as owner.
3. Unlock LRNR with private access secret.
4. Submit learning goal.
5. Complete Architect onboarding.
6. Verify profile, topic brief, and RAG seed rows.
7. Run Cartographer.
8. Verify topic knowledge base is created.
9. Run Curriculum Builder.
10. Verify roadmap and sessions exist.
11. Open dashboard.
12. Open first lesson.
13. Verify Telegram alert is sent.
14. Mark/review lesson.
15. Verify session summary RAG write.
16. Rerun workflow.
17. Verify no duplicate lesson or Telegram alert.

---

## Phase 1 Done Criteria

Phase 1 is done when:

- owner-only login works
- private unlock works
- dashboard loads from backend
- owner can submit a learning goal
- Architect onboarding creates profile, topic brief, and RAG seed
- Cartographer creates usable topic knowledge
- Curriculum Builder creates coherent sessions
- Teaching Agent creates first useful lesson
- lesson renders in frontend
- Telegram sends alert/link
- RAG stores session summary
- workflow rerun is idempotent
- logs show what happened
- basic tests pass

Phase 1 is not done if:

- lessons feel generic
- Cartographer output is weak
- auth can be bypassed
- RAG writes are skipped
- duplicate delivery can happen
- frontend depends on secrets
- failures are not visible in logs
- session state becomes confusing

---

## Phase 1 Exit Gate

Do not move to Phase 2 until this sentence is true:

```text
LRNR can privately take my goal, understand me, research the topic, build a curriculum, teach me the first lesson, remember the important context, and notify me without duplicate or confusing state.
```

That is the foundation.

Everything else becomes easier after this is solid.
