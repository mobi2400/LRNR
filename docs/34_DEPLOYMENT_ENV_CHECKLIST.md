# LRNR - Deployment and Environment Checklist
> **Private deployment readiness guide.**
> Use this before deploying Phase 1 and before running smoke tests.

---

## Purpose

This file defines:

- required services
- required environment variables
- setup order
- deployment checks
- smoke tests
- rollback expectations
- secret safety rules

Phase 1 deployment target:

```text
Private owner-only alpha.
Usable by the owner for real learning and testing.
Not public product launch.
```

---

## Required Services

Phase 1 needs:

| Service | Purpose |
|--------|---------|
| Next.js hosting | frontend + route handlers |
| PostgreSQL/Supabase | source of truth |
| pgvector | RAG embeddings |
| Redis/Valkey | cache, locks, rate limits, temporary run status |
| LLM provider | agents and lesson generation |
| Embedding provider | RAG embeddings |
| Telegram Bot API | alerts and deep links |
| Auth.js / NextAuth provider | login |

Optional Phase 1:

| Service | Purpose |
|--------|---------|
| ElevenLabs | audio explanations/questions |
| OpenTelemetry collector | traces |
| Prometheus/Grafana | metrics/dashboard |
| Phoenix or Langfuse | RAG/LLM trace inspection |

---

## Required Environment Variables

### App

```text
NODE_ENV=
APP_URL=
ACCESS_MODE=owner_only
```

### Owner Access

```text
OWNER_USER_ID=
OWNER_EMAIL=
AUTH_SECRET=
LRNR_ACCESS_SECRET_HASH=
LRNR_ACCESS_SECRET_SALT=
```

### Database

```text
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Redis

```text
REDIS_URL=
```

### AI Providers

```text
LLM_API_KEY=
EMBEDDING_API_KEY=
```

If provider-specific names are used, document them in `.env.example`.

### Telegram

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=
```

### ElevenLabs Optional

```text
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

### Observability Optional

```text
OTEL_EXPORTER_OTLP_ENDPOINT=
PROMETHEUS_ENABLED=
PHOENIX_ENDPOINT=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=
```

Only include observability provider variables if that provider is actually used.

---

## Secret Safety Rules

- Never commit `.env`.
- Keep `.env.example` blank or fake.
- Never expose service-role key to frontend.
- Never expose LLM, embedding, Telegram, or ElevenLabs keys to frontend.
- Never log raw secrets.
- Never send raw private prompts or learner memory to third-party observability by default.
- Rotate keys if accidentally exposed.

Client-safe variables must be explicitly prefixed according to the frontend framework convention.

Server secrets must stay server-only.

---

## Setup Order

### 1. Create Auth Provider

Setup:

- Auth.js / NextAuth provider
- approved owner email/account
- `AUTH_SECRET`
- callback URLs for local and deployed app

Verify:

- owner can log in
- non-owner cannot access app

### 2. Create Database

Setup:

- Supabase/Postgres project
- pgvector extension
- service role key stored server-side
- anon key stored only where safe

Run:

```text
npm run db:migrate
```

Verify:

- tables exist
- indexes exist
- RLS enabled
- owner profile can be seeded or created

### 3. Create Redis/Valkey

Setup:

- Redis URL
- TLS if required by provider
- one shared Phase 1 Redis instance may serve cache, locks, rate limits, and queues only when it is sized with headroom and uses `noeviction`; an evicted lock or queue key is a correctness risk
- if cache memory pressure later requires eviction, use a separate cache instance with an eviction policy such as `allkeys-lfu`; keep coordination/queue Redis on `noeviction`
- application keys use the environment-scoped `lrnr:v1:{environment}` namespace and explicit TTLs
- memory usage and rejected writes are alerted before the shared instance reaches its limit

Verify:

- app can connect
- rate limit key can be written
- lock key can be acquired/released
- lock release is token-owned and atomic
- rate-limit increments are atomic under concurrency
- malformed/version-mismatched cache values are evicted and rebuilt from PostgreSQL

### 4. Setup LLM and Embeddings

Setup:

- LLM API key
- embedding API key
- model names in config if needed

Verify:

- simple completion works
- embedding dimension matches schema
- failures are logged safely

### 5. Setup Telegram

Setup:

- bot token
- owner chat id
- notification preferences row

Verify:

- test alert queues
- outbox sends once
- duplicate delivery key does not resend

### 6. Optional ElevenLabs

Setup:

- API key
- voice id

Verify:

- backend can generate short audio sample
- frontend can play returned short-lived URL
- generated audio metadata expires

---

## Required Scripts

Recommended scripts:

```json
{
  "typecheck": "tsc --noEmit",
  "build": "next build",
  "lint": "next lint",
  "test": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:status": "drizzle-kit check",
  "check:env": "tsx scripts/check-env.ts",
  "smoke:phase1": "tsx scripts/smoke-test-phase-1.ts"
}
```

Exact commands may change based on final tooling.

Keep the intent.

---

## Pre-Deploy Checklist

Before deploy:

- [ ] `AGENTS.md` followed
- [ ] Phase part completed and committed
- [ ] env validation passes
- [ ] typecheck passes
- [ ] build passes
- [ ] migrations applied
- [ ] RLS enabled
- [ ] owner auth works locally
- [ ] private unlock works locally
- [ ] Redis health check passes
- [ ] Telegram test alert works
- [ ] no secrets in git
- [ ] no raw private data in logs

---

## Phase 1 Smoke Test

Run after deployment.

### Auth Smoke Test

1. Open deployed app.
2. Login as owner.
3. Unlock with private LRNR access secret.
4. Confirm dashboard loads.
5. Try non-owner login if possible.
6. Confirm non-owner is blocked.

### Backend Smoke Test

Check:

```text
GET /api/me
GET /api/dashboard
GET /api/system/status
```

Expected:

- owner sees safe data
- no secrets returned
- system status reports service health

### Workflow Smoke Test

1. Submit a learning goal.
2. Complete onboarding.
3. Verify initial Phase 1 preparation runs automatically; if it failed or onboarding predates the handoff, use the dashboard recovery action.
4. Run daily learning workflow for subsequent sessions.
5. Verify job run status.
6. Verify topic brief exists.
7. Verify topic knowledge base exists.
8. Verify curriculum state exists.
9. Verify current lesson exists.
10. Verify RAG onboarding seed exists.
11. Verify Telegram alert sends.
12. Rerun workflow.
13. Verify duplicate lesson/alert is not created.

### Frontend Smoke Test

Check pages:

- login
- unlock
- dashboard
- current lesson
- lesson review
- curriculum map
- settings

Expected:

- no blank pages
- no raw stack traces
- mobile layout usable
- loading/error states visible

---

## Rollback Expectations

Phase 1 rollback should be simple.

If deploy fails:

- revert app deployment to previous build
- do not delete database data
- do not reset production database
- inspect `job_runs`
- inspect logs
- inspect outbox status
- repair failed job if needed

Database rollback:

- avoid destructive rollback in private production
- prefer forward migration fix
- backup before risky migrations

---

## Monitoring After Deploy

Watch:

- API error rate
- auth failures
- workflow failures
- Redis connection errors
- Postgres connection errors
- Telegram send failures
- LLM provider failures
- embedding provider failures
- duplicate delivery attempts

Minimum alerts:

- daily learning workflow failed
- Telegram delivery failed
- database unavailable
- Redis unavailable
- provider key missing/invalid

---

## Final Deployment Rule

Phase 1 is deployable when:

```text
Owner can log in, unlock, submit a goal, complete onboarding, generate curriculum, open first lesson, receive Telegram alert, and rerun without duplicate delivery.
```

If that sentence is false, deployment is not ready.

## Scheduled runtime deployment

Configure the repository Actions secrets used by `.github/workflows/daily-learning.yml` and `.github/workflows/delivery-outbox.yml`, including `OWNER_USER_ID`. Verify `REDIS_URL` is a valid reachable Redis URL because the daily runner fails safely when it cannot acquire its fenced lock. Run `pnpm deploy:check`, then manually dispatch both workflows once before relying on their schedules.
