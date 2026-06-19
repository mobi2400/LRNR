# LRNR - Phase 1 Sub-Part Agent Prompts
> **Copy-ready prompts for agents implementing Phase 1.**
> Use one prompt per sub-part from `docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md`.

---

## How To Use This File

Before starting any Phase 1 sub-part:

1. Read `AGENTS.md`.
2. Read `docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md`.
3. Read the relevant sub-part prompt below.
4. Execute only that sub-part.
5. Keep documenting your work and add helpful comments for non-obvious implementation decisions.
6. Test, cross-check docs, update docs if needed, then commit.

Every prompt assumes:

```text
Frontend is the primary study surface.
Telegram is alerts/deep links only.
Backend owns sensitive logic.
PostgreSQL is source of truth.
Redis is temporary acceleration.
Document important implementation decisions.
Add helpful comments for code that the owner will need to understand later.
```

---

## Part 1 Prompt - Project Foundation

```text
You are implementing LRNR Phase 1 Part 1: Project Foundation.

Read AGENTS.md, docs/00_AI_CODING_GUIDELINES.md, docs/04_STACK_AND_CONVENTIONS.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/31_REPOSITORY_STRUCTURE.md.

Create the project scaffold only: package scripts, TypeScript strict config, Next.js/base app structure, src folders, lint/format setup if applicable, and required baseline dependencies including @mobasshirkhan/docguard. Do not implement agents, database schema, auth, or UI flows yet.

After implementation, run the relevant build/typecheck command if available, verify the folder structure matches docs/31_REPOSITORY_STRUCTURE.md, review git diff, update docs if reality changed, and commit with a message like:

phase1-part01: scaffold project foundation
```

---

## Part 2 Prompt - Environment and Configuration

```text
You are implementing LRNR Phase 1 Part 2: Environment and Configuration.

Read AGENTS.md, docs/24_BACKEND_AUTH_CACHE_PLAN.md, docs/25_BACKEND_SYSTEM_DESIGN.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/34_DEPLOYMENT_ENV_CHECKLIST.md.

Create typed environment validation using Zod, server-only config, client-safe config, and .env.example. Include owner auth, database, Redis, LLM, embeddings, Telegram, and optional ElevenLabs variables. Ensure secrets cannot be imported into frontend code.

After implementation, test missing/invalid env behavior, run typecheck/build if available, cross-check with docs/34_DEPLOYMENT_ENV_CHECKLIST.md, update docs if needed, and commit with:

phase1-part02: add typed environment configuration
```

---

## Part 3 Prompt - Database and Migration Foundation

```text
You are implementing LRNR Phase 1 Part 3: Database and Migration Foundation.

Read AGENTS.md, docs/03_DATA_SCHEMA.md, docs/24_BACKEND_AUTH_CACHE_PLAN.md, docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/31_REPOSITORY_STRUCTURE.md.

Set up Drizzle/Postgres schema and migrations for Phase 1 tables: user_profile, topic_briefs, curriculum_state, topic_knowledge_base, rag_memory, job_runs, api_idempotency_keys, delivery_outbox, notification_preferences, concepts, concept_prerequisites, and optional audio_artifacts if ElevenLabs is enabled. Add extensions, indexes, and RLS policy migrations.

After implementation, run migration/status checks if available, verify user_id ownership and RLS, run typecheck, update docs if schema decisions changed, and commit with:

phase1-part03: add database migration foundation
```

---

## Part 4 Prompt - Auth and Owner Access

```text
You are implementing LRNR Phase 1 Part 4: Auth and Owner Access.

Read AGENTS.md, docs/24_BACKEND_AUTH_CACHE_PLAN.md, docs/25_BACKEND_SYSTEM_DESIGN.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/32_PHASE_1_API_CONTRACT.md.

Implement Auth.js/NextAuth owner login, owner allowlist, private LRNR access secret verification, unlock session/cookie claim, assertOwner helper, protected route guard, /api/me, /api/unlock, and logout behavior if in scope. Non-owner, unauthenticated, and locked-owner access must fail safely.

After implementation, test owner/non-owner/locked states, verify no secret logging, cross-check API contract, update docs if needed, and commit with:

phase1-part04: add owner-only auth and unlock
```

---

## Part 5 Prompt - Backend Core Infrastructure

```text
You are implementing LRNR Phase 1 Part 5: Backend Core Infrastructure.

Read AGENTS.md, docs/04_STACK_AND_CONVENTIONS.md, docs/25_BACKEND_SYSTEM_DESIGN.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, docs/32_PHASE_1_API_CONTRACT.md, and docs/34_DEPLOYMENT_ENV_CHECKLIST.md.

Create request context, request IDs, response envelope, typed errors, Zod validation helpers, Winston app logger, Morgan HTTP logger, Redis client, rate limit helper, lock helper, cache helper, and idempotency helper. Do not implement business agents yet.

After implementation, test envelope/error helpers, Redis health/locks if available, run typecheck, verify logs do not leak secrets, update docs if needed, and commit with:

phase1-part05: add backend core infrastructure
```

---

## Part 6 Prompt - Repository Layer

```text
You are implementing LRNR Phase 1 Part 6: Repository Layer.

Read AGENTS.md, docs/03_DATA_SCHEMA.md, docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/31_REPOSITORY_STRUCTURE.md.

Implement typed repositories for profile, topic briefs, curriculum, knowledge base, RAG, jobs, outbox, notification preferences, and concepts. Repositories must accept actor/context, enforce user_id scope, validate inputs, return domain objects, and avoid provider calls.

After implementation, test write/read paths where possible, verify no raw DB access leaks into agents/services, run typecheck, update docs if needed, and commit with:

phase1-part06: add phase 1 repository layer
```

---

## Part 7 Prompt - Frontend App Shell

```text
You are implementing LRNR Phase 1 Part 7: Frontend App Shell.

Read AGENTS.md, docs/23_FRONTEND_PLAN.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, docs/31_REPOSITORY_STRUCTURE.md, and docs/32_PHASE_1_API_CONTRACT.md.

Build the private frontend shell: login, unlock, dashboard, current lesson, lesson review, curriculum, settings, app shell navigation, loading states, error states, and responsive layout. The UI should feel like a private learning cockpit, not a generic admin panel. Do not call provider SDKs or service-role database clients from frontend.

After implementation, run build/typecheck, manually verify protected navigation states if possible, cross-check pages against Phase 1 docs, update docs if needed, and commit with:

phase1-part07: build private frontend shell
```

---

## Part 8 Prompt - Architect Onboarding Flow

```text
You are implementing LRNR Phase 1 Part 8: Architect Onboarding Flow.

Read AGENTS.md, docs/05_agent_architect.md, docs/16_RAG_SYSTEM.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, docs/32_PHASE_1_API_CONTRACT.md, and docs/33_AGENT_ORCHESTRATION_ROUTES.md.

Implement goal submission and onboarding flow through frontend/backend APIs. Architect should probe the learner, create/update user_profile, create topic_brief, and seed meaningful onboarding RAG events. Use authenticated owner user id as identity; Telegram chat id is notification metadata only.

After implementation, test onboarding state transitions, Zod-validate agent outputs, verify RAG seed is not a raw transcript blob, update docs if needed, and commit with:

phase1-part08: implement architect onboarding flow
```

---

## Part 9 Prompt - Cartographer Research Flow

```text
You are implementing LRNR Phase 1 Part 9: Cartographer Research Flow.

Read AGENTS.md, docs/06_AGENT_CARTOGRAPHER.md, docs/03_DATA_SCHEMA.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/33_AGENT_ORCHESTRATION_ROUTES.md.

Implement Cartographer topic research from topic_brief. Use bounded parallel source fetching where safe, validate extracted topic knowledge, preserve source provenance, deduplicate weak/noisy sources, and write topic_knowledge_base. Failed sources should be logged without crashing the whole workflow unless all critical research fails.

After implementation, test with mocked and/or real-safe source fixtures, validate topic KB shape, cross-check provenance requirements, update docs if needed, and commit with:

phase1-part09: implement cartographer research flow
```

---

## Part 10 Prompt - Curriculum Builder Initial Flow

```text
You are implementing LRNR Phase 1 Part 10: Curriculum Builder Initial Flow.

Read AGENTS.md, docs/07_AGENT_CURRICULUM_BUILDER.md, docs/21_BUILD_SEQUENCE.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/33_AGENT_ORCHESTRATION_ROUTES.md.

Implement initial Curriculum Builder only. It should read topic_brief, topic_knowledge_base, and profile; create Layer 1 roadmap, Layer 2 sessions, basic concept ordering, first current session pointer, and evaluation placeholder. Do not implement full reconcile mode.

After implementation, test session shape validation, current lesson pointer, curriculum map payload, run typecheck, update docs if needed, and commit with:

phase1-part10: implement initial curriculum builder
```

---

## Part 11 Prompt - Teaching and Lesson Experience

```text
You are implementing LRNR Phase 1 Part 11: Teaching and Lesson Experience.

Read AGENTS.md, docs/08_agent_teaching.md, docs/16_RAG_SYSTEM.md, docs/17_DELIVERY_TELEGRAM.md, docs/23_FRONTEND_PLAN.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, and docs/33_AGENT_ORCHESTRATION_ROUTES.md.

Implement Teaching Agent to create a structured frontend lesson payload, persist it to curriculum/session state, render it on the frontend lesson page, support lesson review, mark completion, and write an idempotent compact RAG session summary. Do not send the full lesson as Telegram messages.

After implementation, test lesson payload validation, frontend rendering, no LLM on normal lesson page load, RAG summary idempotency, update docs if needed, and commit with:

phase1-part11: implement teaching lesson experience
```

---

## Part 12 Prompt - Telegram, Observability, Testing, Deployment Gate

```text
You are implementing LRNR Phase 1 Part 12: Telegram, Observability, Testing, Deployment Gate.

Read AGENTS.md, docs/17_DELIVERY_TELEGRAM.md, docs/25_BACKEND_SYSTEM_DESIGN.md, docs/27_PHASE_1_PRIVATE_CORE_FLOW.md, docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, docs/33_AGENT_ORCHESTRATION_ROUTES.md, and docs/34_DEPLOYMENT_ENV_CHECKLIST.md.

Implement Telegram alert/deep-link delivery through delivery_outbox, workflow status, system status, observability basics, Phase 1 eval harness, smoke tests, and deployment readiness checks. Telegram is not the primary lesson surface. Ensure duplicate delivery is prevented.

After implementation, run relevant unit/integration/eval/smoke tests, verify deployment checklist, cross-check docs, update docs if needed, and commit with:

phase1-part12: add alerts observability and deployment gate
```

---

## Final Prompt Rule

If an implementation agent is unsure, use this decision rule:

```text
Prefer the behavior documented in:
1. AGENTS.md
2. docs/30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md
3. this prompt file
4. docs/33_AGENT_ORCHESTRATION_ROUTES.md
5. docs/32_PHASE_1_API_CONTRACT.md
6. the older agent-specific docs
```

Older Telegram-first examples are historical context unless a newer doc confirms them.
