# LRNR - Repository Folder and File Structure
> **Implementation structure guide.**
> Use this file when creating files, moving code, or deciding where a new module belongs.

---

## Purpose

This document defines the intended repository structure for LRNR.

It answers:

- where frontend files go
- where backend files go
- where agents go
- where database code goes
- where schemas and types live
- where tests live
- where workflow code lives
- what must not be mixed together

The goal is simple:

```text
Every file should have an obvious home.
Every folder should have a clear responsibility.
Agents should not guess where code belongs.
```

---

## Current Repo State

Current repository is documentation-first:

```text
/
  AGENTS.md
  docs/
  handbook/
  .gitignore
```

During Phase 1, code will be added around this documentation foundation.

---

## Target Top-Level Structure

Recommended final shape:

```text
/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  next.config.ts
  drizzle.config.ts
  .env.example
  .gitignore

  docs/
  handbook/
  public/
  scripts/
  src/
  tests/
```

Purpose of each top-level folder:

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Rules for AI/coding agents |
| `docs/` | Architecture, phase plans, schema plans, agent specs |
| `handbook/` | Long-form learning handbook artifacts |
| `public/` | Static frontend assets safe to serve publicly |
| `scripts/` | CLI scripts for setup, migrations, checks, maintenance |
| `src/` | Application source code |
| `tests/` | Cross-cutting tests and test fixtures |

---

## `docs/` Structure

`docs/` contains planning and architecture documents.

Current important groups:

```text
docs/
  00_AI_CODING_GUIDELINES.md
  01_projectoverview.md
  02_architecture.md
  03_DATA_SCHEMA.md
  04_STACK_AND_CONVENTIONS.md

  05_agent_architect.md
  06_AGENT_CARTOGRAPHER.md
  07_AGENT_CURRICULUM_BUILDER.md
  08_agent_teaching.md
  09_agent_evaluation.md
  10_agent_scout.md
  11_AGENT_CONTRADICTION.md
  12_AGENT_NEWS_INTELLIGENCE.md

  16_RAG_SYSTEM.md
  17_DELIVERY_TELEGRAM.md
  21_BUILD_SEQUENCE.md
  23_FRONTEND_PLAN.md
  25_BACKEND_SYSTEM_DESIGN.md
  26_DATABASE_SCHEMA_IMPLEMENTATION.md
  27_PHASE_1_PRIVATE_CORE_FLOW.md
  28_PHASE_2_ADAPTIVE_LEARNING_FLOW.md
  29_PHASE_3_LIVE_INTELLIGENCE_FLOW.md
  30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md
  31_REPOSITORY_STRUCTURE.md
```

Rules:

- Update docs when implementation changes architecture.
- Do not put runtime code inside `docs/`.
- Do not let docs become stale when API/schema decisions change.

---

## `src/` Target Structure

Recommended Phase 1 source tree:

```text
src/
  app/
  agents/
  components/
  db/
  env.ts
  lib/
  schemas/
  server/
  services/
  styles/
  types/
  utils/
  workflows/
  workers/
```

Each folder has a strict responsibility.

---

## `src/app/`

Purpose:

Next.js App Router pages, layouts, and route handlers.

Recommended structure:

```text
src/app/
  layout.tsx
  page.tsx

  (auth)/
    login/
      page.tsx
    unlock/
      page.tsx

  (app)/
    dashboard/
      page.tsx
    lesson/
      current/
        page.tsx
      review/
        page.tsx
    curriculum/
      page.tsx
    settings/
      page.tsx

  api/
    me/
      route.ts
    unlock/
      route.ts
    dashboard/
      route.ts
    lesson/
      current/
        route.ts
      [sessionId]/
        mark-complete/
          route.ts
        ask-follow-up/
          route.ts
    goals/
      start/
        route.ts
    onboarding/
      current/
        route.ts
      reply/
        route.ts
    curriculum/
      map/
        route.ts
    notifications/
      telegram/
        test/
          route.ts
    settings/
      route.ts
    system/
      status/
        route.ts
    workflows/
      daily-learning/
        route.ts
      [runId]/
        route.ts
```

Rules:

- Page files should remain thin.
- API route handlers should remain thin.
- Route handlers should call `server/` helpers and `services/`.
- Do not put business logic directly in `page.tsx` or `route.ts`.
- Do not call provider SDKs from page components.

---

## `src/components/`

Purpose:

Reusable frontend UI components.

Recommended structure:

```text
src/components/
  app-shell/
    AppShell.tsx
    SidebarNavigation.tsx
    TopStatusBar.tsx

  lesson/
    LessonCard.tsx
    MentalModelCallout.tsx
    ReviewQuestionCard.tsx
    SourceCitationCard.tsx

  curriculum/
    CurriculumTimeline.tsx
    ConceptNode.tsx
    ProgressRing.tsx

  system/
    SystemHealthCard.tsx
    NotificationToast.tsx

  markdown/
    CodeBlock.tsx
    DiagramPanel.tsx

  ui/
    Button.tsx
    Card.tsx
    Input.tsx
    Textarea.tsx
    Badge.tsx
```

Rules:

- Components should be typed.
- Components should not own backend logic.
- Components should not import service-role clients.
- Components should receive data as props or through safe frontend fetchers.
- Keep visual components separate from data-fetching where practical.

---

## `src/server/`

Purpose:

Backend request-level infrastructure.

Recommended structure:

```text
src/server/
  auth.ts
  owner.ts
  access-secret.ts
  session.ts
  request-context.ts
  response.ts
  errors.ts
  validation.ts
  rate-limit.ts
  idempotency.ts
  cache.ts
  locks.ts
  openapi.ts
```

Responsibilities:

- auth/session verification
- owner guard
- private unlock guard
- request id creation
- API response envelope
- error mapping
- Zod request validation
- rate limiting
- idempotency checks
- Redis cache/lock wrappers

Rules:

- `server/` can use secrets.
- `server/` code should not be imported by client components.
- Keep provider-specific wrappers in `lib/`, not `server/`.

---

## `src/services/`

Purpose:

Business use-cases that coordinate repositories, agents, and providers.

Recommended Phase 1 structure:

```text
src/services/
  dashboard.service.ts
  onboarding.service.ts
  profile.service.ts
  research.service.ts
  curriculum.service.ts
  lesson.service.ts
  notification.service.ts
  workflow-status.service.ts
  system-status.service.ts
```

Responsibilities:

- orchestrate business actions
- call repositories
- call agents
- call provider wrappers
- enforce app-level rules
- return domain outputs to API handlers

Rules:

- Services may coordinate multiple repositories.
- Services may call agents.
- Services should not contain raw SQL.
- Services should not return raw provider responses to frontend.

---

## `src/agents/`

Purpose:

Agent-specific prompts, node logic, typed outputs, and validation.

Recommended structure:

```text
src/agents/
  architect/
    architect.agent.ts
    architect.prompts.ts
    architect.schema.ts
    architect.types.ts

  cartographer/
    cartographer.agent.ts
    cartographer.prompts.ts
    cartographer.schema.ts
    cartographer.types.ts

  curriculum-builder/
    curriculum-builder.agent.ts
    curriculum-builder.prompts.ts
    curriculum-builder.schema.ts
    curriculum-builder.types.ts

  teaching/
    teaching.agent.ts
    teaching.prompts.ts
    teaching.schema.ts
    teaching.types.ts
```

Phase 2 adds:

```text
src/agents/evaluation/
```

Phase 3 adds:

```text
src/agents/scout/
src/agents/news-intelligence/
src/agents/contradiction/
```

Rules:

- Agent outputs must be validated with Zod.
- Agents must not call raw DB clients.
- Agents must not call raw provider SDKs.
- Agents should use services/tools/wrappers.
- Prompts should be versioned or named clearly.
- Keep prompt text separate from orchestration logic.

---

## `src/workflows/`

Purpose:

Workflow orchestration and graph execution.

Recommended Phase 1 structure:

```text
src/workflows/
  daily-learning/
    daily-learning.workflow.ts
    daily-learning.state.ts
    daily-learning.nodes.ts
    daily-learning.router.ts
```

Phase 2 adds:

```text
src/workflows/evaluation/
```

Phase 3 adds:

```text
src/workflows/daily-research/
src/workflows/nightly-reconcile/
```

Rules:

- Workflow state must be typed.
- Workflow nodes must have clear inputs/outputs.
- Long-running workflows should create/update `job_runs`.
- Workflow steps must be idempotent where possible.
- Do not hide side effects inside anonymous callbacks.

---

## `src/db/`

Purpose:

Database schema, migrations, repositories, and database clients.

Recommended structure:

```text
src/db/
  client.ts
  types.ts

  schema/
    auth.schema.ts
    profile.schema.ts
    curriculum.schema.ts
    knowledge.schema.ts
    rag.schema.ts
    jobs.schema.ts
    notifications.schema.ts
    concepts.schema.ts

  migrations/

  rls/

  profile.repo.ts
  topic-briefs.repo.ts
  curriculum.repo.ts
  knowledge.repo.ts
  rag.repo.ts
  jobs.repo.ts
  outbox.repo.ts
  notification-preferences.repo.ts
  concepts.repo.ts
```

Phase 2 adds:

```text
evaluation.repo.ts
notes.repo.ts
audio.repo.ts
agent-update-queue.repo.ts
```

Phase 3 adds:

```text
news.repo.ts
contradictions.repo.ts
claims.repo.ts
```

Rules:

- Repositories enforce `user_id` scope.
- Repositories return domain objects.
- Repositories do not call LLMs.
- Repositories do not send Telegram messages.
- Schema files define table shape only.
- Migrations are the source of deployed database changes.

---

## `src/schemas/`

Purpose:

Zod schemas for runtime validation.

Recommended structure:

```text
src/schemas/
  env.schema.ts
  api.schema.ts
  profile.schema.ts
  onboarding.schema.ts
  curriculum.schema.ts
  lesson.schema.ts
  knowledge.schema.ts
  rag.schema.ts
  workflow.schema.ts
  notification.schema.ts
```

Rules:

- Validate API request bodies.
- Validate LLM outputs.
- Validate scraped/extracted structures.
- Validate workflow payloads.
- Keep schemas close to domain concepts, not random route files.

---

## `src/types/`

Purpose:

Shared TypeScript types that are not runtime validators by themselves.

Recommended structure:

```text
src/types/
  api.types.ts
  auth.types.ts
  profile.types.ts
  curriculum.types.ts
  lesson.types.ts
  rag.types.ts
  workflow.types.ts
  notification.types.ts
  provider.types.ts
```

Rules:

- Prefer deriving types from Zod when possible.
- Use explicit discriminated unions for states.
- Do not create giant unstructured type files.
- Keep types readable and documented.

---

## `src/lib/`

Purpose:

Provider wrappers and low-level integrations.

Recommended structure:

```text
src/lib/
  llm.ts
  embeddings.ts
  telegram.ts
  elevenlabs.ts
  scraper.ts
  redis.ts
  logger.ts
  telemetry.ts
  metrics.ts
  supabase-admin.ts
```

Rules:

- Raw provider SDKs live here.
- Agents call wrappers, not raw SDKs.
- Provider wrappers handle retries/timeouts/logging.
- Provider wrappers return normalized results.
- Do not leak provider-specific responses across the app.

---

## `src/utils/`

Purpose:

Small pure helpers.

Recommended structure:

```text
src/utils/
  assert.ts
  date.ts
  hash.ts
  ids.ts
  retry.ts
  sleep.ts
  text.ts
  tokens.ts
```

Rules:

- Utilities should be mostly pure.
- Utilities should not import database clients.
- Utilities should not call providers.
- If a helper needs app state, it probably belongs in `services/` or `server/`.

---

## `src/workers/`

Purpose:

Background processors.

Recommended Phase 1 structure:

```text
src/workers/
  outbox.worker.ts
  workflow.worker.ts
```

Phase 2 adds:

```text
evaluation.worker.ts
audio.worker.ts
```

Phase 3 adds:

```text
research.worker.ts
reconcile.worker.ts
```

Rules:

- Workers update `job_runs`.
- Workers must be idempotent.
- Workers must log start/end/failure.
- Workers must not hold database transactions during long provider calls.

---

## `scripts/`

Purpose:

Developer and operational scripts.

Recommended structure:

```text
scripts/
  check-env.ts
  migrate.ts
  seed-owner.ts
  verify-rls.ts
  smoke-test-phase-1.ts
```

Rules:

- Scripts should use typed config.
- Scripts should fail loudly on missing env.
- Scripts should avoid destructive behavior unless explicitly named and guarded.

---

## `tests/`

Purpose:

Tests that are not colocated with modules.

Recommended structure:

```text
tests/
  fixtures/
  unit/
  integration/
  e2e/
  rag/
```

Examples:

```text
tests/unit/env.test.ts
tests/unit/redis-keys.test.ts
tests/integration/profile.repo.test.ts
tests/integration/rag.repo.test.ts
tests/e2e/phase-1-flow.test.ts
tests/rag/onboarding-seed.test.ts
```

Rules:

- Unit tests should avoid real providers.
- Integration tests may use test database/Redis.
- RAG tests should include golden examples.
- E2E tests should verify complete user flow.

---

## File Naming Rules

Use consistent suffixes:

| Suffix | Meaning |
|--------|---------|
| `.repo.ts` | database repository |
| `.service.ts` | business/use-case service |
| `.agent.ts` | agent execution logic |
| `.prompts.ts` | prompt templates/builders |
| `.schema.ts` | Zod or database schema |
| `.types.ts` | TypeScript types |
| `.workflow.ts` | workflow orchestration |
| `.nodes.ts` | workflow node implementations |
| `.worker.ts` | background worker |
| `.test.ts` | tests |

Rules:

- Use kebab-case for folders.
- Use descriptive file names.
- Avoid vague files like `helpers.ts`, `stuff.ts`, `common.ts`.
- If `utils.ts` grows large, split it.

---

## Boundary Rules

### Frontend Boundary

Frontend can import:

- components
- client-safe types
- client-safe schemas
- frontend fetch helpers

Frontend must not import:

- `src/server/*`
- `src/db/client.ts`
- `src/lib/supabase-admin.ts`
- provider SDK wrappers with secrets

### Agent Boundary

Agents can use:

- typed inputs
- prompt builders
- provider wrappers
- services/tools passed to them

Agents must not:

- directly mutate database tables
- directly send Telegram messages
- directly use service-role clients
- return unvalidated shapes

### Repository Boundary

Repositories can:

- query database
- write database
- enforce user scope
- map rows to domain objects

Repositories must not:

- call LLMs
- call Telegram
- call ElevenLabs
- make product decisions

### Service Boundary

Services can:

- coordinate repositories
- call agents
- call provider wrappers
- enforce business rules

Services should not:

- contain UI rendering logic
- expose raw provider output
- skip validation

---

## Phase-Based File Additions

### Phase 1 Adds

```text
src/app/(auth)/*
src/app/(app)/dashboard/*
src/app/(app)/lesson/*
src/app/(app)/curriculum/*
src/app/(app)/settings/*
src/app/api/me/*
src/app/api/unlock/*
src/app/api/dashboard/*
src/app/api/lesson/*
src/app/api/goals/*
src/app/api/onboarding/*
src/app/api/curriculum/*
src/app/api/notifications/*
src/app/api/system/status/*
src/app/api/workflows/*

src/agents/architect/*
src/agents/cartographer/*
src/agents/curriculum-builder/*
src/agents/teaching/*

src/workflows/daily-learning/*
```

### Phase 2 Adds

```text
src/app/(app)/evaluation/*
src/app/(app)/concepts/*
src/app/(app)/notes/*
src/app/(app)/mastery/*
src/app/api/evaluation/*
src/app/api/mastery/*
src/app/api/notes/*
src/app/api/audio/*

src/agents/evaluation/*
src/workflows/evaluation/*
src/workers/evaluation.worker.ts
src/workers/audio.worker.ts
```

### Phase 3 Adds

```text
src/app/(app)/sources/*
src/app/(app)/news/*
src/app/(app)/system/*
src/app/api/sources/*
src/app/api/claims/*
src/app/api/news/*
src/app/api/contradictions/*
src/app/api/system/queues/*
src/app/api/system/providers/*
src/app/api/system/rag-health/*

src/agents/scout/*
src/agents/news-intelligence/*
src/agents/contradiction/*
src/workflows/daily-research/*
src/workflows/nightly-reconcile/*
src/workers/research.worker.ts
src/workers/reconcile.worker.ts
```

---

## Example Phase 1 Tree

After Phase 1, the repo should roughly look like:

```text
/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  next.config.ts
  drizzle.config.ts
  .env.example

  docs/
  handbook/
  public/
  scripts/

  src/
    app/
    agents/
      architect/
      cartographer/
      curriculum-builder/
      teaching/
    components/
    db/
      schema/
      migrations/
      rls/
      *.repo.ts
    lib/
    schemas/
    server/
    services/
    styles/
    types/
    utils/
    workflows/
      daily-learning/
    workers/

  tests/
    unit/
    integration/
    e2e/
    rag/
```

---

## Final Rule

When adding a file, ask:

```text
Is this UI, server infrastructure, business service, repository, provider wrapper, agent logic, workflow logic, schema, type, utility, worker, script, test, or documentation?
```

Then put it in the matching folder.

If a file seems to belong everywhere, it is probably doing too much.
