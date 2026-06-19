# LRNR - Agent Working Guide
> **Read this before any agent writes code in this repository.**
> This file tells coding agents how to work safely, consistently, and productively on LRNR.

---

## Project Identity

LRNR is a personal-first learning operating system that may later grow into a product used by many users.

The system combines:

- adaptive curriculum planning
- agent workflows
- RAG and future Graph RAG
- frontend learning cockpit
- backend orchestration
- owner-only authentication
- Telegram notifications
- ElevenLabs voice UX
- observability for debugging agents and RAG

The current priority is not speed of coding. The priority is correct architecture, readable implementation, typed state, and low-hallucination engineering.

---

## Mandatory Reading Order

Before coding, read these foundation docs:

1. `docs/00_AI_CODING_GUIDELINES.md`
2. `docs/01_projectoverview.md`
3. `docs/02_architecture.md`
4. `docs/03_DATA_SCHEMA.md`
5. `docs/04_STACK_AND_CONVENTIONS.md`

For phase planning and execution, read:

- `docs/27_PHASE_1_PRIVATE_CORE_FLOW.md`
- `docs/28_PHASE_2_ADAPTIVE_LEARNING_FLOW.md`
- `docs/29_PHASE_3_LIVE_INTELLIGENCE_FLOW.md`

For **Phase 1 implementation work**, this is the primary execution file:

- `docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md`

Agents implementing Phase 1 must follow the 12 parts in order unless the user explicitly asks to work on a specific part.

Also read these Phase 1 implementation support files before coding:

- `docs/31_REPOSITORY_STRUCTURE.md`
- `docs/32_PHASE_1_API_CONTRACT.md`
- `docs/33_AGENT_ORCHESTRATION_ROUTES.md`
- `docs/34_DEPLOYMENT_ENV_CHECKLIST.md`
- `docs/35_PHASE_1_SUBPART_AGENT_PROMPTS.md`

Before implementing any Phase 1 sub-part, read the matching prompt from `docs/35_PHASE_1_SUBPART_AGENT_PROMPTS.md`.

For backend/schema work, also read:

- `docs/24_BACKEND_AUTH_CACHE_PLAN.md`
- `docs/25_BACKEND_SYSTEM_DESIGN.md`
- `docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md`

For RAG work, also read:

- `docs/16_RAG_SYSTEM.md`
- `docs/22_FUTURE_GRAPH_RAG_PLAN.md`

For frontend work, also read:

- `docs/23_FRONTEND_PLAN.md`
- `docs/17_DELIVERY_TELEGRAM.md`

For workflow work, also read:

- `docs/18_WORKFLOW_DAILY_LEARNING.md`
- `docs/19_WORKFLOW_DAILY_RESEARCH.md`
- `docs/20_WORKFLOW_NIGHTLY_RECONCILE.md`
- `docs/21_BUILD_SEQUENCE.md`

For agent-specific work, read the relevant agent file:

- `docs/05_agent_architect.md`
- `docs/06_AGENT_CARTOGRAPHER.md`
- `docs/07_AGENT_CURRICULUM_BUILDER.md`
- `docs/08_agent_teaching.md`
- `docs/09_agent_evaluation.md`
- `docs/10_agent_scout.md`
- `docs/11_AGENT_CONTRADICTION.md`
- `docs/12_AGENT_NEWS_INTELLIGENCE.md`

---

## Non-Negotiable Coding Rules

- Use TypeScript strictly.
- Define proper types for every state, payload, API body, database row, and agent output.
- Validate runtime boundaries with Zod.
- Do not use `any` unless there is no safe alternative and the reason is documented.
- Keep code readable before clever.
- Keep functions small and named by intent.
- Add useful comments for non-obvious logic.
- Do not comment obvious assignments.
- Separate business logic from side effects.
- Agents must not call raw provider SDKs directly.
- Agents must use approved tools/wrappers for DB, LLM, embeddings, Telegram, ElevenLabs, scraping, and Redis.
- Every expensive or external operation must have retry, timeout, logging, and error handling.
- Every write that can be retried must be idempotent.
- Every list endpoint must paginate.
- Every protected route must enforce auth and owner access.

---

## Sub-Part Execution Rule

When working from a phase implementation plan, especially `docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md`, agents must treat each sub-part as a complete mini-delivery.

For every sub-part:

1. Read the relevant docs before coding.
2. Read the matching sub-part prompt from `docs/35_PHASE_1_SUBPART_AGENT_PROMPTS.md`.
3. Implement only the scope of that sub-part.
4. Re-test the touched behavior.
5. Cross-verify the implementation against the docs.
6. Update docs if implementation reality changed.
7. Check git status and review the diff.
8. Commit the completed sub-part with a clear message.

Do not move to the next sub-part while the current one has:

- failing relevant tests
- unreviewed diffs
- missing docs updates
- unclear ownership boundaries
- known architecture drift
- uncommitted completed work

Commit rule:

```text
Commit after each completed and verified sub-part.
Do not commit broken or half-finished work unless the commit is explicitly marked as WIP and requested by the user.
```

Recommended commit message format:

```text
phase1-part03: add database migration foundation
phase1-part08: implement architect onboarding flow
docs: update phase 1 execution plan
```

---

## State Rules

Agent systems fail when state is unclear.

Every workflow must define:

- input state
- output state
- node-local state
- persisted state
- retry behavior
- failure behavior
- resume behavior

State transitions must be explicit and typed.

Do not mutate large anonymous objects across many functions.

Prefer:

```ts
type EvaluationStatus = 'started' | 'awaiting_answer' | 'scoring' | 'completed' | 'failed';
```

Avoid:

```ts
const state: any = {};
state.done = true;
```

---

## Backend Rules

Backend owns sensitive logic.

The frontend must never own:

- service-role database access
- LLM keys
- embedding keys
- ElevenLabs keys
- Telegram bot token
- RAG permission logic
- agent execution authority
- workflow locks

Every backend request follows:

```text
request
  -> request id
  -> Auth.js session check
  -> owner/unlock guard
  -> rate limit
  -> Zod input validation
  -> service layer
  -> repository/tool wrapper
  -> Zod output validation where useful
  -> safe response envelope
```

Use the response envelope from `docs/25_BACKEND_SYSTEM_DESIGN.md`.

---

## Database Rules

PostgreSQL is the source of truth.

Redis is temporary acceleration.

Every learner-owned table must include `user_id`.

Use repositories instead of raw SQL in agents.

Repository functions must:

- accept an authenticated actor/context
- validate inputs
- enforce ownership
- use transactions for multi-table writes
- return domain objects, not random raw rows

Follow `docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md` for table, index, RLS, pgvector, and Redis key planning.

---

## RAG Rules

RAG is trust engineering, not just retrieval.

The decided retrieval pipeline is:

```text
authenticate
  -> permission/user/topic/concept filters
  -> optional query rewrite
  -> lexical retrieval
  -> vector retrieval
  -> RRF merge
  -> rerank
  -> confidence gate
  -> context pack
  -> generation
  -> citation verification
  -> response or refusal
  -> trace/evaluation log
```

RAG must store meaningful learning events, not arbitrary transcript dumps.

RAG must not:

- retrieve across users
- bypass permission filters
- treat cached answers as truth
- answer when evidence is below threshold
- cite sources that do not support the answer
- mix incompatible embedding versions
- store raw private prompts in external tools by default

If evidence is weak, the system should refuse or ask a clarifying question.

---

## Observability Rules

Use:

- Morgan for HTTP access logs
- Winston for structured app, worker, provider, agent, and RAG logs
- OpenTelemetry for traces
- Prometheus for metrics
- Grafana for dashboards
- Phoenix or Langfuse for RAG/LLM trace inspection

Never log:

- secrets
- auth headers
- cookies
- raw voice transcripts
- raw private RAG context
- sensitive prompts

RAG traces must make it possible to identify whether failure happened during:

- ingestion
- metadata filtering
- lexical retrieval
- vector retrieval
- RRF
- reranking
- confidence gating
- context packing
- LLM generation
- citation verification
- freshness checks
- permission checks

---

## Frontend Rules

The frontend is the learning cockpit.

It should:

- feel top-notch and intentional
- show system status clearly
- support study, evaluation, notes, source exploration, and voice UX
- never expose secrets
- never make final authorization decisions alone
- call backend APIs instead of direct provider/database calls

Telegram is for notification and alerting. The frontend is where serious study happens.

---

## Auth Rules

LRNR starts owner-only.

Required layers:

```text
Auth.js / NextAuth login
  -> owner allowlist
  -> private LRNR access secret
  -> backend owner guard
  -> RLS/repository authorization
```

Do not scatter owner-only assumptions through business logic.

Use access mode configuration:

```text
ACCESS_MODE=owner_only | invite_only | public
```

---

## Package Rules

Install packages only when they materially improve reliability, safety, productivity, or UX.

Required project package:

```text
npm i @mobasshirkhan/docguard
```

Expected useful packages may include:

- `zod`
- `drizzle-orm`
- `postgres`
- `next-auth` / Auth.js package matching the final Next.js version
- `winston`
- `morgan`
- `bullmq`
- `ioredis`
- `@opentelemetry/*`
- `prom-client`
- `telegraf`
- `p-limit`
- `p-retry`

Do not add dependencies casually.

---

## Testing Rules

Every meaningful implementation should include tests where practical.

Prioritize:

- pure helper unit tests
- Zod schema tests
- repository tests
- auth/owner guard tests
- API route tests
- RAG retrieval tests
- idempotency tests
- workflow state transition tests
- Redis key builder tests
- RLS policy verification where possible

RAG changes must be evaluated against golden examples before becoming defaults.

### Eval Harness Rule

LRNR should use an eval harness, staged by phase.

The eval harness is a repeatable test system for checking whether agents and RAG outputs are valid, grounded, useful, and safe.

Phase 1 harness:

- Architect output validates
- Cartographer output has usable grounded structure
- Curriculum sessions validate
- Teaching lesson is grounded in topic knowledge
- RAG onboarding/session writes create useful rows
- duplicate workflow delivery is prevented

Phase 2 harness:

- Evaluation Agent detects gaps and misconceptions
- mastery scoring behaves consistently
- RAG retrieval finds expected evidence
- citation/grounding checks pass
- voice transcript confirmation guard works

Phase 3 harness:

- Scout priority classification is correct
- News relevance scoring filters noise
- Contradiction lens classification is correct
- source/claim grounding works
- nightly reconcile preserves protected sessions

Do not treat "the output looks good" as enough for agent or RAG quality.

---

## Documentation Rules

Keep documentation close to the code.

When implementing a module, document:

- what it owns
- what it must never do
- important state transitions
- error behavior
- retry/idempotency behavior

If implementation changes architecture, update the relevant markdown doc in the same pull request/commit.

---

## Git and Safety Rules

- Do not revert user changes unless explicitly asked.
- Do not run destructive git commands.
- Do not commit secrets.
- Do not ignore failing tests without explaining the reason.
- Keep generated or temporary files out of git unless intentionally required.
- Before large refactors, understand the current code patterns first.

---

## Final Agent Rule

Build LRNR like it matters.

```text
Readable code.
Typed state.
Scoped retrieval.
Owner-safe auth.
Observable failures.
Idempotent writes.
Documented decisions.
No silent magic.
```

If unsure, choose the design that is easier to debug, test, and explain.
