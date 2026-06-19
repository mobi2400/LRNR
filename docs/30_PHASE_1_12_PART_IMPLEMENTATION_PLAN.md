# LRNR - Phase 1 12-Part Implementation Plan
> **Agent execution file for Phase 1.**
> Agents should use this file as the primary task breakdown when implementing the private core MVP.

---

## Purpose

This file divides Phase 1 into **12 implementation parts**.

Each part is designed to be:

- specific enough for an agent to execute
- small enough to test
- ordered by dependency
- clear about what to build and what not to build
- aligned with `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

The goal of Phase 1:

```text
Owner logs in privately.
Owner submits a learning goal.
LRNR understands the goal.
LRNR researches the topic.
LRNR creates a curriculum.
LRNR teaches the first lesson in the frontend.
Telegram alerts the owner.
RAG stores useful onboarding/session memory.
The flow is idempotent and debuggable.
```

---

## Global Phase 1 Rules

These rules apply to every part.

- Use TypeScript strict mode.
- Validate runtime inputs with Zod.
- Use typed return values.
- Use repositories for database access.
- Do not call provider SDKs directly from agents.
- Do not expose secrets to the frontend.
- Do not store Redis as source of truth.
- Do not write RAG memory without `user_id`.
- Do not retrieve RAG memory without user filtering.
- Do not skip owner auth because the product is private.
- Do not build Phase 2/3 features unless marked as a placeholder.
- Every mutation that may retry should be idempotent.
- Every external call should have timeout, retry, and structured logging.
- Every user-visible error should be safe and understandable.
- Keep documenting implementation decisions as work progresses.
- Add helpful comments for non-obvious code so the owner can learn from the implementation.
- Use hybrid routing: keep dependent agent steps sequential, but run independent reads/fetches/checks in parallel with explicit fan-in.

### Hybrid Routing In Phase 1

The main Phase 1 spine is sequential:

```text
Architect -> Cartographer -> Curriculum Builder -> Teaching -> Persist -> Notify/RAG
```

This must stay sequential because each step depends on the previous step's validated output.

Safe parallelism is allowed inside steps:

- load profile/curriculum/preferences/job status in parallel
- fetch multiple Cartographer sources in parallel with bounded concurrency
- prepare Teaching context by loading curriculum, topic knowledge, and scoped RAG in parallel
- after lesson persistence, queue Telegram alert and write RAG summary as separate idempotent side effects
- run health checks in parallel for system status

Never parallelize:

- Teaching before Curriculum Builder finishes
- Curriculum Builder before Cartographer output validates
- delivery before lesson persistence
- RAG summary before session/lesson content exists
- conflicting writes to the same authoritative row without transaction/version protection

---

## Required Execution Loop For Every Part

Every part in this file must be executed as a complete mini-delivery.

For each part:

```text
read relevant docs
  -> read matching prompt in docs/35_PHASE_1_SUBPART_AGENT_PROMPTS.md
  -> implement scoped changes
  -> run relevant tests/checks
  -> cross-check implementation against docs
  -> update docs if needed
  -> review git diff
  -> commit completed work
  -> move to next part
```

This rule exists because LRNR has many moving pieces. If agents skip verification after each part, small mismatches will compound into architecture drift.

### Required Verification After Each Part

After every part, verify:

- the matching sub-part prompt was read before implementation
- the code still builds or typechecks where applicable
- relevant unit/integration tests pass
- the implementation matches the part's scope
- the implementation still follows `AGENTS.md`
- the implementation still follows `docs/00_AI_CODING_GUIDELINES.md`
- schema/API/RAG/auth behavior still matches the relevant docs
- relevant docs/comments were added for non-obvious implementation decisions
- no secrets were added
- no unrelated files were changed accidentally
- git diff is reviewed before committing

### Commit Rule

Commit every completed part.

Use clear commits:

```text
phase1-part01: scaffold project foundation
phase1-part02: add typed environment configuration
phase1-part03: add database migration foundation
```

Do not commit:

- failing tests unless explicitly approved
- unrelated changes
- secrets
- generated junk
- half-finished work disguised as complete

If a part cannot be completed in one sitting, leave a clear note in the final response and do not mark the part done.

---

## Phase 1 Part Map

| Part | Name | Main Outcome |
|---:|------|--------------|
| 1 | Project Foundation | App scaffolding, config, scripts, dependencies |
| 2 | Environment and Configuration | Typed env, constants, runtime config |
| 3 | Database and Migration Foundation | Drizzle, Supabase/Postgres, base schema, RLS |
| 4 | Auth and Owner Access | Auth.js, owner allowlist, private unlock |
| 5 | Backend Core Infrastructure | request context, errors, response envelope, logging, Redis |
| 6 | Repository Layer | typed data access for Phase 1 tables |
| 7 | Frontend App Shell | private UI shell, navigation, dashboard skeleton |
| 8 | Architect Onboarding Flow | goal intake, onboarding state, profile/topic brief/RAG seed |
| 9 | Cartographer Research Flow | source discovery, research extraction, topic KB write |
| 10 | Curriculum Builder Initial Flow | roadmap, concepts, sessions, current lesson pointer |
| 11 | Teaching and Lesson Experience | lesson generation, frontend lesson/review, session summary RAG |
| 12 | Telegram, Observability, Testing, Deployment Gate | alerts, outbox, metrics/logs, tests, deploy readiness |

---

## Part 1 - Project Foundation

### Objective

Create the technical base of the project so all later work has a consistent structure.

### Required Inputs

Read:

- `AGENTS.md`
- `docs/00_AI_CODING_GUIDELINES.md`
- `docs/04_STACK_AND_CONVENTIONS.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Create or configure:

```text
package.json
tsconfig.json
next.config.*
eslint/prettier config if used
src/
src/app/
src/components/
src/server/
src/services/
src/db/
src/lib/
src/types/
src/schemas/
src/utils/
src/workflows/
src/agents/
```

### Required Dependencies

Install only what Phase 1 needs.

Minimum expected packages:

```text
@mobasshirkhan/docguard
zod
drizzle-orm
postgres
next-auth or Auth.js package chosen for the Next.js version
winston
morgan
ioredis or redis client compatible with chosen queue/cache approach
p-retry
p-limit
telegraf
```

Optional if enabled in Phase 1:

```text
@opentelemetry/*
prom-client
bullmq
```

### Tasks

1. Initialize package scripts.
2. Enable TypeScript strictness.
3. Add base folder structure.
4. Add path aliases if useful.
5. Add base app route.
6. Add basic build script.
7. Add lint/typecheck scripts.
8. Ensure no secret files are committed.

### Done Criteria

- `npm run build` or equivalent passes.
- TypeScript config is strict.
- Folder structure exists.
- Dependency list is intentional.
- No app logic is implemented in random root files.

### Guardrails

- Do not implement agents in this part.
- Do not design UI deeply in this part.
- Do not add large dependency stacks before they are needed.

---

## Part 2 - Environment and Configuration

### Objective

Create typed configuration so missing or invalid environment variables fail early.

### Required Inputs

Read:

- `docs/24_BACKEND_AUTH_CACHE_PLAN.md`
- `docs/25_BACKEND_SYSTEM_DESIGN.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Create:

```text
src/env.ts
src/server/config.ts
src/schemas/env.schema.ts
.env.example
```

### Required Environment Variables

Phase 1 should define:

```text
NODE_ENV=
APP_URL=
ACCESS_MODE=owner_only
OWNER_USER_ID=
OWNER_EMAIL=
AUTH_SECRET=
LRNR_ACCESS_SECRET_HASH=
LRNR_ACCESS_SECRET_SALT=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
REDIS_URL=
LLM_API_KEY=
EMBEDDING_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

If ElevenLabs is not enabled in Phase 1, its variables can be optional.

### Tasks

1. Define Zod env schema.
2. Parse server env once at startup.
3. Export typed config object.
4. Separate server-only config from client-safe config.
5. Add `.env.example` with blank values and comments.
6. Ensure service keys cannot be imported by frontend components.

### Done Criteria

- Missing required env values fail clearly.
- Client-safe env does not include secrets.
- `ACCESS_MODE` only allows expected values.
- Owner email/user id config is typed.

### Guardrails

- Do not log full env values.
- Do not expose service role key to client bundle.
- Do not hardcode secrets.

---

## Part 3 - Database and Migration Foundation

### Objective

Set up database schema foundation for Phase 1.

### Required Inputs

Read:

- `docs/03_DATA_SCHEMA.md`
- `docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md`
- `docs/24_BACKEND_AUTH_CACHE_PLAN.md`

### Build

Create:

```text
src/db/client.ts
src/db/schema/*
src/db/migrations/*
src/db/rls/*
src/db/types.ts
```

### Phase 1 Tables

Implement at minimum:

```text
user_profile
topic_briefs
curriculum_state
topic_knowledge_base
rag_memory
job_runs
api_idempotency_keys
delivery_outbox
notification_preferences
concepts
concept_prerequisites
```

Optional if ElevenLabs is enabled:

```text
audio_artifacts
```

### Required Extensions

```sql
pgcrypto
vector
pg_trgm
```

### Required Index Areas

Add indexes for:

- user scoped profile lookup
- topic brief by user/topic
- active curriculum by user/status
- RAG by user/topic/event type
- RAG unresolved memories
- RAG lexical search
- job status by user/status
- outbox pending deliveries
- idempotency keys
- concept prerequisites

### RLS

Enable RLS for every learner-owned table.

Use policy pattern:

```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

Remember:

- backend service role can bypass RLS
- repository owner checks are still required

### Tasks

1. Configure Drizzle.
2. Define tables with typed schema.
3. Add migrations for extensions/enums/tables/indexes.
4. Add RLS migrations.
5. Add database connection helper.
6. Add migration/status script.
7. Add seed helper for owner profile if needed.

### Done Criteria

- Migrations run locally.
- Tables exist.
- RLS enabled.
- Required indexes exist.
- Drizzle types compile.

### Guardrails

- Do not add Phase 2 tables deeply unless needed as empty placeholders.
- Do not skip `user_id`.
- Do not create vector index before confirming pgvector support in deployment target.

---

## Part 4 - Auth and Owner Access

### Objective

Make LRNR private and owner-only.

### Required Inputs

Read:

- `docs/24_BACKEND_AUTH_CACHE_PLAN.md`
- `docs/25_BACKEND_SYSTEM_DESIGN.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Create:

```text
src/server/auth.ts
src/server/owner.ts
src/server/access-secret.ts
src/server/session.ts
src/middleware.ts if needed
```

Frontend routes:

```text
/login
/unlock
```

Backend routes:

```text
GET  /api/me
POST /api/unlock
POST /api/logout
```

### Access Layers

```text
Auth.js / NextAuth login
  -> owner allowlist
  -> private LRNR access secret
  -> backend owner guard
  -> RLS/repository authorization
```

### Tasks

1. Configure Auth.js/NextAuth.
2. Add owner allowlist check.
3. Implement private secret verification.
4. Store unlock state securely.
5. Add `assertOwner` helper.
6. Add route guard helper.
7. Block non-owner users.
8. Add safe auth error responses.

### Done Criteria

- Owner can log in.
- Non-owner cannot access app or APIs.
- Owner must unlock with private secret.
- Protected API rejects locked owner.
- Protected API rejects unauthenticated user.

### Guardrails

- Do not rely on frontend-only checks.
- Do not store access secret in plain text.
- Do not log auth secrets.
- Do not let provider login alone unlock LRNR.

---

## Part 5 - Backend Core Infrastructure

### Objective

Create the backend foundation every route/service/agent will use.

### Required Inputs

Read:

- `docs/25_BACKEND_SYSTEM_DESIGN.md`
- `docs/04_STACK_AND_CONVENTIONS.md`
- `AGENTS.md`

### Build

Create:

```text
src/server/request-context.ts
src/server/errors.ts
src/server/response.ts
src/server/validation.ts
src/server/rate-limit.ts
src/server/idempotency.ts
src/server/cache.ts
src/server/locks.ts
src/lib/logger.ts
src/lib/redis.ts
```

### Response Envelope

Use stable responses:

```ts
type ApiSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

type ApiError = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

### Logging

Use:

- Morgan for HTTP access logs
- Winston for structured application logs

Log:

- request id
- user id hash
- route
- status
- duration
- job id if created

Never log:

- secrets
- cookies
- raw transcripts
- raw RAG context
- sensitive prompts

### Redis

Build helpers for:

- rate limits
- locks
- dashboard cache
- workflow status
- idempotency

### Tasks

1. Generate request IDs.
2. Define error classes.
3. Define API envelope helpers.
4. Add validation helper for Zod schemas.
5. Configure Winston.
6. Configure Morgan.
7. Configure Redis client.
8. Build rate-limit helper.
9. Build lock helper.
10. Build idempotency helper.

### Done Criteria

- Every API can use common envelope.
- Redis health check works.
- Logs are structured.
- Duplicate mutation can be detected.
- Rate limit can reject excessive calls.

### Guardrails

- Do not make normal page loads call LLMs.
- Do not store important state only in Redis.
- Do not throw raw errors to frontend.

---

## Part 6 - Repository Layer

### Objective

Create typed data access modules that agents and services can safely use.

### Required Inputs

Read:

- `docs/03_DATA_SCHEMA.md`
- `docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md`
- `docs/00_AI_CODING_GUIDELINES.md`

### Build

Create repositories:

```text
src/db/profile.repo.ts
src/db/topic-briefs.repo.ts
src/db/curriculum.repo.ts
src/db/knowledge.repo.ts
src/db/rag.repo.ts
src/db/jobs.repo.ts
src/db/outbox.repo.ts
src/db/notification-preferences.repo.ts
src/db/concepts.repo.ts
```

Optional:

```text
src/db/audio.repo.ts
```

### Repository Contract

Every repository function should:

- accept actor/context
- validate input
- scope by `user_id`
- return typed domain data
- avoid provider calls
- avoid frontend-specific shapes

Example pattern:

```ts
async function getCurrentProfile(ctx: DbActor): Promise<UserProfile> {
  // Always scoped by ctx.userId.
}
```

### Required Repository Capabilities

Profile:

- create/update owner profile
- get current profile
- update current topic/session metadata

Topic briefs:

- create topic brief
- get by topic slug
- list recent briefs

Curriculum:

- create curriculum
- get active curriculum
- update session status
- save generated lesson
- update current session pointer

Knowledge:

- create/update topic knowledge base
- get by topic

RAG:

- write meaningful memory
- write onboarding seed
- write session summary
- query by metadata filters
- idempotent write check

Jobs:

- create job run
- update status
- record error

Outbox:

- create delivery item
- claim pending delivery
- mark sent/failed

### Done Criteria

- Repositories compile.
- Repositories are user scoped.
- Basic write/read tests pass.
- Agents can use repositories without raw SQL.

### Guardrails

- Do not put business prompts in repositories.
- Do not bypass owner/user scope.
- Do not return raw database internals to UI.

---

## Part 7 - Frontend App Shell

### Objective

Build the private frontend shell that will host the learning experience.

### Required Inputs

Read:

- `docs/23_FRONTEND_PLAN.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build Pages

```text
/login
/unlock
/dashboard
/lesson/current
/lesson/review
/curriculum
/settings
```

### Build Components

```text
AppShell
SidebarNavigation
TopStatusBar
SystemHealthCard
ProgressRing
LessonCard
CurriculumTimeline
NotificationToast
CodeBlock
DiagramPanel
MentalModelCallout
SourceCitationCard
ReviewQuestionCard
```

### UI Standard

The UI should feel like:

- private learning cockpit
- personal research lab
- calm study room
- technical notebook

It should not feel like:

- generic SaaS admin panel
- chatbot clone
- default template
- cluttered dashboard

### Tasks

1. Build app shell layout.
2. Build protected route handling.
3. Build login and unlock UI.
4. Build dashboard skeleton.
5. Build current lesson page skeleton.
6. Build lesson review page skeleton.
7. Build curriculum map basic UI.
8. Build settings page.
9. Add loading and error states.
10. Add mobile responsiveness.

### Done Criteria

- Owner can navigate protected pages.
- Locked/unauthorized state redirects safely.
- Dashboard loads backend data.
- UI has clear primary action.
- Mobile layout is usable.

### Guardrails

- Do not call LLM, embedding, Supabase service role, or Telegram directly from frontend.
- Do not expose private data publicly.
- Do not build Phase 2 pages deeply.

---

## Part 8 - Architect Onboarding Flow

### Objective

Allow the owner to submit a learning goal and complete onboarding so LRNR can understand the learner before building a curriculum.

### Required Inputs

Read:

- `docs/05_agent_architect.md`
- `docs/16_RAG_SYSTEM.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Agent/service files:

```text
src/agents/architect/*
src/services/onboarding.service.ts
src/services/profile.service.ts
src/schemas/onboarding.schema.ts
```

API routes:

```text
POST /api/goals/start
POST /api/onboarding/reply
GET  /api/onboarding/current
```

### Architect Responsibilities

Architect must:

- understand the owner's goal
- ask probing questions
- assess prior knowledge
- identify likely prerequisites
- create topic brief
- write initial profile
- seed meaningful onboarding RAG entries

### Onboarding State

Track:

- goal
- current question
- conversation turns
- inferred background
- detected strengths
- detected weak areas
- detected misconceptions
- completion status

### RAG Writes

Write only meaningful onboarding events:

- motivation
- concrete goal
- background
- prior attempts
- probing answer
- strength
- gap
- misconception

### Done Criteria

- Owner can submit a goal.
- Architect asks useful questions.
- Onboarding can complete.
- `user_profile` is created/updated.
- `topic_briefs` row is created.
- RAG onboarding seed is written.

### Guardrails

- Do not accept self-assessment blindly.
- Do not write raw full transcript as one RAG blob.
- Do not create curriculum before onboarding is complete enough.

---

## Part 9 - Cartographer Research Flow

### Objective

Research the selected topic and create a usable topic knowledge base for teaching.

### Required Inputs

Read:

- `docs/06_AGENT_CARTOGRAPHER.md`
- `docs/03_DATA_SCHEMA.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Files:

```text
src/agents/cartographer/*
src/services/research.service.ts
src/lib/scraper.ts
src/lib/llm.ts
src/schemas/knowledge.schema.ts
```

### Research Responsibilities

Cartographer must produce:

- concept map
- source inventory
- important claims
- limitations
- production examples
- code patterns
- version notes
- beginner-to-advanced ordering hints

### Source Handling

Every source should track:

- name
- URL
- retrieved time
- source type
- credibility signal
- relevant extracted sections

### Tasks

1. Build source discovery/fetch wrapper.
2. Add retry and timeout.
3. Extract structured topic knowledge.
4. Validate extraction with Zod.
5. Store in `topic_knowledge_base`.
6. Preserve source provenance.
7. Log failed sources without crashing whole workflow.

### Done Criteria

- Cartographer can research a real topic.
- Topic knowledge validates.
- Knowledge base is saved.
- Teaching can use the knowledge base.
- Failed source fetches are handled gracefully.

### Guardrails

- Do not dump giant raw article bodies.
- Do not trust scraped data without validation.
- Do not teach from source claims without provenance where possible.

---

## Part 10 - Curriculum Builder Initial Flow

### Objective

Create the first roadmap and session plan from the topic brief and topic knowledge base.

### Required Inputs

Read:

- `docs/07_AGENT_CURRICULUM_BUILDER.md`
- `docs/21_BUILD_SEQUENCE.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Build

Files:

```text
src/agents/curriculum-builder/*
src/services/curriculum.service.ts
src/schemas/curriculum.schema.ts
src/types/curriculum.types.ts
```

### Curriculum Responsibilities

Create:

- Layer 1 roadmap
- Layer 2 sessions
- basic concept ordering
- first current session pointer
- evaluation placeholder date
- session statuses

### Session Shape

Each session should include:

- id
- title
- learning objective
- concepts
- prerequisites
- mental model
- explanation plan
- examples/code plan
- review questions
- source references
- status

### Tasks

1. Read topic brief.
2. Read topic knowledge base.
3. Normalize concept outline.
4. Build prerequisite-aware order.
5. Generate Layer 1 roadmap.
6. Generate Layer 2 sessions.
7. Validate session shape.
8. Save `curriculum_state`.
9. Set current session.

### Done Criteria

- Curriculum exists for the active topic.
- Sessions are coherent and ordered.
- First session can load without LLM call.
- Curriculum map frontend can display basic roadmap.

### Guardrails

- Do not implement full reconcile mode in Phase 1.
- Do not mutate Layer 2 from random services.
- Do not confuse session index with calendar date.

---

## Part 11 - Teaching and Lesson Experience

### Objective

Generate and display the first useful lesson, then store a compact session summary in RAG.

### Required Inputs

Read:

- `docs/08_agent_teaching.md`
- `docs/16_RAG_SYSTEM.md`
- `docs/17_DELIVERY_TELEGRAM.md`
- `docs/23_FRONTEND_PLAN.md`

### Build

Files:

```text
src/agents/teaching/*
src/services/lesson.service.ts
src/schemas/lesson.schema.ts
src/types/lesson.types.ts
```

Frontend:

```text
/lesson/current
/lesson/review
```

API:

```text
GET  /api/lesson/current
POST /api/lesson/{sessionId}/mark-complete
POST /api/lesson/{sessionId}/ask-follow-up
```

Optional:

```text
POST /api/audio/generate-explanation
```

### Lesson Requirements

A lesson should include:

- title
- objective
- mental model
- explanation
- diagram description or Mermaid
- code examples if relevant
- common mistakes
- review questions
- source references
- next action

### RAG Session Summary

Write one compact session summary after lesson delivery/completion.

Do not write:

- every paragraph
- raw lesson text
- every UI interaction

Write:

- what was taught
- concepts covered
- likely weak points
- review questions asked
- session status

### Done Criteria

- Current lesson page renders real lesson.
- Lesson is grounded in topic knowledge.
- Lesson review page works.
- Session delivery/completion state updates.
- RAG session summary writes idempotently.

### Guardrails

- Do not make normal lesson page load call LLM.
- Generate lesson in workflow/job, then read persisted result.
- Do not send generic ungrounded lessons.

---

## Part 12 - Telegram, Observability, Testing, Deployment Gate

### Objective

Finish Phase 1 by making the product alertable, debuggable, testable, and deployable for private use.

### Required Inputs

Read:

- `docs/17_DELIVERY_TELEGRAM.md`
- `docs/25_BACKEND_SYSTEM_DESIGN.md`
- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`

### Telegram

Build:

```text
src/lib/telegram.ts
src/services/notification.service.ts
src/workers/outbox.worker.ts or simple outbox processor
```

API:

```text
POST /api/notifications/telegram/test
PATCH /api/settings/notifications
```

Send:

- lesson-ready alert
- reminder alert
- workflow failure alert
- deep link to frontend

Use `delivery_outbox`.

Never send duplicate delivery for same `delivery_key`.

### Observability

Build:

- Morgan HTTP logging
- Winston app logging
- request IDs
- job logs
- RAG write/query logs
- basic health endpoint
- basic metrics if Prometheus is enabled

API:

```text
GET /api/system/status
```

Health checks:

- Postgres
- Redis
- Telegram config
- LLM config
- embedding config
- latest workflow status

### Workflow

Create Phase 1 daily learning workflow:

```text
start
  -> determine whether new topic or existing session
  -> if new topic: Architect -> Cartographer -> Curriculum Builder
  -> Teaching Agent
  -> persist lesson
  -> write RAG summary
  -> outbox Telegram alert
  -> finish job run
```

### Testing

Required unit tests:

- env validation
- owner guard
- access secret verification
- Redis key builders
- idempotency helpers
- curriculum session validation
- RAG canonical content formatting
- Telegram message formatting

Required integration tests:

- profile write/read
- topic brief write/read
- curriculum create/load
- RAG write/query
- outbox create/mark sent
- protected route rejects unauthorized user
- job run status update

### Phase 1 Eval Harness

Build a lightweight eval harness in Phase 1.

Purpose:

```text
Do not trust agent outputs just because they look fluent.
Check that they validate, are grounded, and are useful.
```

Recommended location:

```text
tests/evals/
  architect.eval.ts
  cartographer.eval.ts
  curriculum.eval.ts
  teaching.eval.ts
  rag-memory.eval.ts
  phase-1-flow.eval.ts
```

Minimum eval cases:

- Architect turns a vague goal into a usable topic brief.
- Architect identifies at least one prerequisite or probing need.
- Cartographer output includes source inventory and concept map.
- Cartographer does not pass empty/ungrounded research as complete.
- Curriculum Builder creates sessions with objectives, concepts, review questions, and ordering.
- Teaching lesson references topic knowledge instead of producing generic content.
- RAG onboarding seed writes meaningful event rows, not one raw transcript blob.
- RAG session summary is compact and useful.
- Phase 1 rerun does not duplicate lesson delivery or Telegram alert.

Eval harness outputs should include:

- pass/fail
- reason
- failed field or rule
- fixture used
- agent/output version if available

Do not block Phase 1 on advanced RAGAS-style metrics. Those become more important in Phase 2.

Manual end-to-end test:

1. Deploy or run app locally.
2. Log in as owner.
3. Unlock LRNR.
4. Submit goal.
5. Complete onboarding.
6. Verify profile/topic brief/RAG seed.
7. Run research.
8. Verify topic knowledge base.
9. Generate curriculum.
10. Open first lesson.
11. Send Telegram alert.
12. Complete/review lesson.
13. Verify RAG session summary.
14. Rerun workflow.
15. Confirm no duplicate lesson or Telegram alert.

### Deployment Gate

Phase 1 can be deployed for private testing when:

- build passes
- migrations run
- owner auth works
- private unlock works
- dashboard loads
- full core workflow completes
- Telegram alert works
- RAG writes work
- duplicate delivery is prevented
- logs show failures clearly

### Done Criteria

- Owner can use LRNR privately for first learning goal.
- Product is deployable as private alpha.
- Failures are visible.
- Phase 2 can begin without rewriting Phase 1 foundations.

### Guardrails

- Do not hide workflow failures.
- Do not skip duplicate delivery protection.
- Do not mark Phase 1 done if lesson quality is generic.
- Do not start Phase 2 until the private core loop is stable.

---

## Phase 1 Final Acceptance Checklist

Phase 1 is complete only when all boxes are true:

- [ ] App builds successfully.
- [ ] Environment validation works.
- [ ] Database migrations run.
- [ ] RLS is enabled on learner-owned tables.
- [ ] Owner login works.
- [ ] Private unlock works.
- [ ] Non-owner access is blocked.
- [ ] Dashboard loads from backend.
- [ ] Owner can submit learning goal.
- [ ] Architect onboarding completes.
- [ ] Topic brief is created.
- [ ] Onboarding RAG seed is written.
- [ ] Cartographer creates topic knowledge base.
- [ ] Curriculum Builder creates roadmap and sessions.
- [ ] Current lesson loads from persisted state.
- [ ] Teaching Agent creates grounded lesson.
- [ ] Lesson review page works.
- [ ] Session summary RAG write works.
- [ ] Telegram alert sends.
- [ ] Telegram alert is not duplicated on rerun.
- [ ] Job run status is visible.
- [ ] Basic logs show request/job failures.
- [ ] Core unit tests pass.
- [ ] Core integration tests pass.
- [ ] Each completed part was re-tested before moving on.
- [ ] Each completed part was cross-checked against relevant docs.
- [ ] Docs were updated when implementation decisions changed.
- [ ] Each completed part was committed with a clear message.

Final acceptance sentence:

```text
LRNR can privately take my goal, understand me, research the topic, build a curriculum, teach me the first lesson, remember the important context, and notify me without duplicate or confusing state.
```
