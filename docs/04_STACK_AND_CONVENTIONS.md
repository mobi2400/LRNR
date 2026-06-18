# LRNR - Stack & Conventions
> **This file is a foundation document. It must be included in every coding session as primary context.**
> **Consistency across agents and workflows is what keeps the system debuggable.**

---

## Tech Stack

| Layer | Technology | Purpose |
|------|------------|---------|
| Language | TypeScript | Entire application codebase |
| Runtime | Node.js 20 LTS | Local development and workflows |
| Orchestration | LangGraph JS | Graph-based workflow control |
| LLM - Reasoning | Groq `llama-3.3-70b-versatile` | Architect, Teaching, Evaluation, Contradiction |
| LLM - Fast/Volume | Groq `llama-3.1-8b-instant` | Scout, Curriculum Builder, ranking, classification |
| Database | Supabase | PostgreSQL + pgvector |
| Scraping | Firecrawl | Topic and article extraction |
| Frontend | Next.js | Primary learning cockpit |
| Notifications | Telegraf | Telegram alerts, reminders, and deep links |
| Package Manager | pnpm | Dependency management |
| Validation | zod | Runtime validation of external and generated data |
| Testing | vitest | Unit and integration tests |

---

## Project Structure

Target structure is defined in:

```text
docs/31_REPOSITORY_STRUCTURE.md
```

High-level shape:

```text
/
  AGENTS.md
  docs/
  handbook/
  public/
  scripts/
  src/
    app/
    agents/
    components/
    db/
    lib/
    schemas/
    server/
    services/
    types/
    utils/
    workflows/
    workers/
  tests/
```

### Boundary rules

- `agents/` owns agent business logic
- `graphs/` owns graph wiring
- `nodes/` owns graph execution units where separate from agent modules
- `db/` owns persistence logic
- `lib/` owns third-party service wrappers
- `prompts/` owns prompt builders only
- `types/` owns shared contracts
- `utils/` owns pure helpers
- `workflows/` owns runnable entry points

---

## LLM Abstraction Rule

All model calls go through one abstraction layer.

Agents must never call provider SDKs directly.

Example shape:

```ts
export async function reasoningLLM(...) { /* ... */ }
export async function fastLLM(...) { /* ... */ }
```

Responsibilities of the abstraction layer:

- model selection
- retry behavior
- timeout behavior
- json mode
- token and latency logging
- mock-mode support

---

## TypeScript Rules

These rules are mandatory:

- `strict: true`
- no `any` unless there is an explicit, temporary reason
- exported functions must have explicit parameter and return types
- domain states should use unions instead of free-form strings
- external and LLM data must be validated before trusted usage

Recommended important compiler options:

- `noImplicitAny`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`

---

## Validation Rules

Use `zod` or equivalent runtime validation for:

- environment variables
- LLM JSON outputs
- database JSONB structures
- scraped source payloads
- queue payloads

No LLM output should directly become domain logic without validation.

---

## Agent Conventions

Every agent file should make these things obvious:

- what it owns
- what it reads
- what it writes
- what it must never do
- what side effects it is allowed to trigger

Agents should not bypass shared wrappers.

Examples:

- no direct Groq SDK calls from agent files
- no direct Supabase client logic scattered in agents
- no raw Telegram send logic in unrelated modules

If a repeated action appears across agents, wrap it in a project-owned helper or tool.

Examples:

- `enqueueCurriculumUpdate()`
- `writeLearningEventToRag()`
- `scoreSourceCredibility()`
- `appendLayer3Item()`

---

## Readability Rules

Code must optimize for comprehension first.

Required habits:

- descriptive names
- short focused functions where possible
- comments for non-obvious logic
- file-level orientation comments on important modules
- explicit branch logic for priority rules and reconciliation

Comments should explain **intent**, not syntax.

---

## Error Handling Rules

All important workflows must:

- fail loudly on contract violations
- include context in errors
- separate user-facing failure from system failure
- log retries and final failure clearly

Useful context to include:

- agent name
- node name
- user id
- topic id
- workflow name

---

## Retry And Idempotency Rules

This project uses scheduled jobs and external APIs. Retry safety is not optional.

Implementation must account for:

- duplicate workflow execution
- repeated queue processing
- duplicate Telegram delivery
- partial writes after external success
- retries after network failure

Rules:

1. Important writes should be idempotent or guarded by versioning/locks.
2. Queue items must track processing state.
3. Delivery actions should have duplicate protection.
4. Scheduled workflows should be safe to rerun.

---

## Session Semantics Rule

Do not assume that calendar days equal completed learning progress.

The codebase must distinguish:

- scheduled session
- delivered session
- completed session
- evaluation checkpoint
- learner's current curriculum position

This rule should shape both db logic and workflow logic.

---

## Logging Rules

Use structured logging.

Logging stack:

- Morgan for HTTP access logs
- Winston for structured application, worker, provider, agent, and RAG logs
- OpenTelemetry for traces
- Prometheus for metrics

Morgan should log:

- HTTP method
- route
- status code
- response time
- response size
- request id
- user id hash if available

Winston should log:

- timestamp
- level
- service
- environment
- request id
- user id hash
- job id when available
- agent name when available
- event name
- duration
- error code
- safe metadata

Log at least:

- workflow start
- workflow finish
- node start
- node finish
- duration
- item counts
- retry attempts
- important decisions

Never log:

- secrets
- auth headers
- cookies
- raw voice transcripts
- raw private RAG context
- full prompts containing sensitive learner/source content

Do not rely on logs alone.

```text
Logs explain events.
Metrics show health over time.
Traces show where time went.
Dashboards show the operating picture.
```

---

## Performance Rules

AI-written code should actively consider:

- time complexity
- space complexity
- API call volume
- LLM token usage
- scraping cost
- duplicate work

Prefer:

- batching where reasonable
- bounded concurrency with `p-limit`
- retries with `p-retry`
- avoiding repeated refetching or re-embedding

---

## Testing Rules

Priority tests:

- dependency ordering
- Layer 2 N+2 enforcement
- queue reconciliation priority
- evaluation scheduling logic
- date/session progression helpers
- validation/parsing helpers
- idempotent write behavior

Mock expensive systems carefully:

- LLMs
- scraping
- embeddings
- Telegram alerting/deep links

---

## Package Baseline

When the repo scaffold is created, this is the baseline package set:

```bash
pnpm add @langchain/langgraph @langchain/core @supabase/supabase-js telegraf groq-sdk zod p-retry p-limit rss-parser date-fns @mobasshirkhan/docguard drizzle-orm postgres next-auth winston morgan ioredis
pnpm add -D typescript tsx @types/node eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin vitest
```

### Why these packages

- `@langchain/langgraph` for workflow orchestration
- `@supabase/supabase-js` for data access
- `drizzle-orm` and `postgres` for typed database access and migrations
- `next-auth` / Auth.js for owner login
- `telegraf` for Telegram alerts and deep links
- `winston` for structured application logs
- `morgan` for HTTP access logs
- `ioredis` for Redis/Valkey cache, locks, and rate limits
- `groq-sdk` for Groq provider access
- `zod` for runtime validation
- `p-retry` for retries
- `p-limit` for concurrency control
- `rss-parser` for feed parsing
- `date-fns` for predictable date logic
- `@mobasshirkhan/docguard` for documentation guardrails and keeping implementation aligned with docs
- `tsx` for local TypeScript execution
- `vitest` for testing

---

## MOCK_LLM Mode

Local development should support `MOCK_LLM=true`.

Use it for:

- graph logic
- queue logic
- db flow testing
- Telegram formatting checks

Do not use it when validating real reasoning quality.

---

## Final Rule

This codebase should feel like a well-run system, not a pile of generated files.

That means:

- clarity over cleverness
- explicitness over hidden magic
- validation over trust
- strong typing over guesswork
- documentation over silence
- bounded side effects over chaos
