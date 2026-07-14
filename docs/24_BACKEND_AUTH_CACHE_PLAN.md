# LRNR - Backend, Authentication, and Redis Plan

> **Future implementation plan for the private LRNR backend.**
> LRNR is personal-first: only the owner should have access.

---

## Purpose

If LRNR has a frontend, it must also have a backend.

The backend protects secrets, verifies identity, runs agents, owns database writes, performs retrieval, and coordinates workflows.

The frontend should never directly own sensitive system behavior.

---

## Backend Responsibilities

The backend owns:

- authentication verification
- owner-only authorization
- API routes
- Supabase service-role access
- RAG retrieval
- Graph RAG later
- agent execution
- LangGraph workflows
- LLM provider calls
- embedding calls
- queue processing
- Redis caching
- rate limiting
- logging
- idempotency
- secure delivery actions
- Telegram notification triggers
- ElevenLabs voice generation
- voice answer transcription pipeline

The backend is the secure brain of LRNR.

---

## Access Model

LRNR is private.

Only the owner can access it.

Rules:

- disable public signup
- create one approved owner account
- reject every request from non-owner users
- keep RLS enabled anyway
- never expose service-role keys to the frontend
- keep backend authorization checks even if Auth.js already authenticated the user

Recommended environment variables:

```text
OWNER_USER_ID=
OWNER_EMAIL=
AUTH_SECRET=
LRNR_ACCESS_SECRET_HASH=
LRNR_ACCESS_SECRET_SALT=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
LLM_API_KEY=
EMBEDDING_API_KEY=
ELEVENLABS_API_KEY=
```

---

## Authentication Recommendation

Use:

```text
Auth.js / NextAuth
+ owner email/user id allowlist
+ private LRNR access secret
+ PostgreSQL Row Level Security
+ backend owner check
```

Flow:

```text
Frontend login
  -> Auth.js / NextAuth provider login
  -> backend verifies session
  -> backend checks OWNER_USER_ID or OWNER_EMAIL
  -> user enters private LRNR access secret
  -> backend verifies secret hash
  -> session becomes lrnr_unlocked
  -> backend allows or rejects request
```

Example owner check:

```ts
function assertOwner(user: AuthenticatedUser): void {
  if (user.id !== process.env.OWNER_USER_ID) {
    throw new UnauthorizedError('LRNR is private to the owner');
  }
}
```

This check should happen on every backend route.

### Private Access Secret Layer

Because LRNR is private, provider login is not enough.

Add one more layer:

```text
Only the owner account + correct LRNR secret can enter.
```

Behavior:

- after Auth.js login, check owner email/user ID
- ask for the LRNR access secret
- compare against a stored hash
- never store the secret in plain text
- set a short-lived `lrnr_unlocked` session claim/cookie
- require unlock for all app pages and API routes

This protects against:

- accidental provider login from the wrong account
- leaked OAuth session
- someone reaching the login page
- future misconfiguration

Do not rely on the frontend to check this. Backend middleware must enforce it.

---

## Row Level Security

Even though LRNR is single-user, RLS should remain enabled.

Why:

- protects against accidental data exposure
- keeps future multi-user option possible
- prevents frontend bugs from reading unintended rows
- reinforces the ownership model

Every learner-owned table should include:

```text
user_id
```

RLS policy idea:

```sql
create policy "owner can access own rows"
on user_profile
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

For service-role backend operations, application-level checks still matter because service role can bypass RLS.

---

## Backend API Shape

Possible route groups:

```text
/api/me
/api/dashboard
/api/lesson/current
/api/lesson/answer
/api/evaluation/start
/api/evaluation/reply
/api/curriculum/map
/api/rag/query
/api/sources
/api/notes
/api/workflows/daily-learning
/api/workflows/daily-research
/api/workflows/reconcile
/api/notifications/telegram/test
/api/notifications/preferences
/api/audio/evaluation-question
/api/audio/explanation
/api/audio/transcribe-answer
/api/evaluation/voice-reply
```

All routes must:

1. verify auth
2. assert owner
3. validate input
4. use backend services/db modules
5. return safe response shapes

---

## Redis Role

The detailed cache correctness, invalidation, atomic lock/rate-limit, and two-level cache contract is defined in `docs/36_REDIS_DATABASE_PERFORMANCE_DESIGN.md`.

Redis is recommended, but it is not the source of truth.

Use Redis for:

- rate limiting
- short-lived session cache
- dashboard cache
- temporary agent run status
- job locks
- idempotency keys
- duplicate request protection
- short-lived retrieval result cache
- safe LLM response cache for deterministic prompts
- short-lived generated audio cache metadata

Do not use Redis for:

- authoritative curriculum state
- learner mastery state
- RAG memory
- evaluation history
- source claims
- long-term notes
- permanent progress
- permanent audio archive unless explicitly needed

PostgreSQL remains the source of truth.

---

## Redis Examples

## 1. Rate Limiting

Prevent accidental rapid requests:

```text
rate:user:{ownerId}:api
rate:user:{ownerId}:agent-run
```

## 2. Job Locks

Prevent duplicate workflow execution:

```text
lock:daily-learning:{date}
lock:nightly-reconcile:{date}
```

## 3. Agent Run Status

Track short-lived UI progress:

```text
agent-run:{runId}:status
```

Example statuses:

```text
queued
running
waiting_for_model
writing_state
complete
failed
```

## 4. Dashboard Cache

Cache derived dashboard summaries:

```text
dashboard:{ownerId}
```

Use a short TTL. If cache misses, rebuild from PostgreSQL.

## 5. Audio Cache

ElevenLabs-generated audio can be cached briefly.

Example keys:

```text
audio:evaluation-question:{questionId}:{voiceVersion}
audio:explanation:{contentHash}:{voiceVersion}
```

Rules:

- cache only generated audio metadata or short-lived URLs
- do not treat audio as source of truth
- regenerate audio from stored text if needed
- expire audio aggressively unless there is a real product reason to keep it

## 6. Voice Answer Temporary Storage

Voice answers should be temporary.

Flow:

```text
audio upload
  -> temporary storage
  -> transcription
  -> owner transcript review
  -> transcript submitted
  -> temporary audio deleted or expired
```

Rules:

- do not store raw voice answers permanently by default
- store the confirmed transcript as the evaluation answer
- optionally store audio only if explicitly enabled for debugging
- attach transcription confidence if the provider returns it
- allow owner correction before scoring

---

## Backend Services

Recommended backend service modules:

```text
src/server/auth.ts
src/server/owner.ts
src/server/rate-limit.ts
src/server/cache.ts
src/server/jobs.ts

src/db/profile.ts
src/db/curriculum.ts
src/db/rag.ts
src/db/knowledge-base.ts
src/db/evaluation.ts
src/db/queue.ts
src/db/news.ts

src/lib/llm.ts
src/lib/embeddings.ts
src/lib/redis.ts
src/lib/elevenlabs.ts
src/lib/supabase-admin.ts
```

Agents should depend on these wrappers, not raw clients.

---

## Security Rules

- Never expose service-role key to frontend.
- Never expose LLM keys to frontend.
- Never expose ElevenLabs keys to frontend.
- Do not store raw voice answers permanently by default.
- Do not evaluate unconfirmed transcripts.
- Never trust frontend-only authorization.
- Validate every request body with Zod.
- Keep RLS enabled.
- Check owner identity on every route.
- Log auth failures without leaking secrets.
- Do not log private answers unless explicitly needed for debugging.
- Keep Redis values short-lived unless there is a strong reason.

---

## Backend Build Order

## Slice 1 Backend

Build:

- Auth.js / NextAuth setup
- owner allowlist
- private LRNR access secret layer
- owner-only middleware
- RLS policies
- dashboard API
- current lesson API
- answer submission API
- Telegram lesson-ready notification
- basic Redis rate limit
- basic Redis job lock

## Slice 2 Backend

Build:

- evaluation APIs
- mastery APIs
- remediation queue APIs
- agent run status cache
- stronger idempotency keys
- ElevenLabs audio generation API for evaluation prompts and feedback
- voice answer upload/transcription API
- transcript confirmation flow before Evaluation Agent scoring

## Slice 3 Backend

Build:

- source explorer APIs
- news/digest APIs
- Layer 3 APIs
- Graph RAG relational traversal APIs
- advanced dashboard cache

---

## Final Rule

For personal LRNR:

```text
Only the owner can enter.
PostgreSQL is the truth.
Redis is temporary acceleration.
Backend owns all sensitive logic.
Frontend only displays and collects.
Telegram only notifies and links back.
```

This keeps LRNR private now and expandable later.
