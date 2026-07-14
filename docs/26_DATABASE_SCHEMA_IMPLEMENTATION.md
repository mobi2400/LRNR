# LRNR - Database Schema Implementation Plan
> **Implementation-level database blueprint.**
> This file turns the architecture docs into concrete tables, enums, indexes, RLS rules, pgvector setup, and Redis key patterns.

---

## Purpose

This file answers:

- what tables LRNR needs
- what each table owns
- what columns each table should start with
- which enums should exist
- which indexes are required
- how RLS should protect the data
- how pgvector should be configured for RAG
- what Redis/Valkey keys are allowed

This is not a replacement for `03_DATA_SCHEMA.md`.

```text
03_DATA_SCHEMA.md = ownership and responsibility rules
26_DATABASE_SCHEMA_IMPLEMENTATION.md = implementation-ready schema plan
```

---

## Core Database Choices

| Concern | Decision |
|--------|----------|
| Database | PostgreSQL through Supabase |
| ORM/migrations | Drizzle ORM |
| Validation | Zod at API and repository boundaries |
| Vector search | pgvector |
| Embedding dimension | 1536 |
| ID type | UUID |
| Timestamp type | `timestamptz` |
| JSON type | `jsonb` |
| Access control | PostgreSQL RLS + backend owner guard |
| Cache/locks | Valkey or Redis-compatible server |

Rules:

- PostgreSQL is the source of truth.
- Redis is temporary acceleration.
- Every learner-owned row must include `user_id`.
- Future team/organization rows should be able to add `tenant_id`.
- Agents must use repositories, not raw database clients.
- Raw LLM output must be validated before persistence.

---

## Required Extensions

```sql
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
```

Why:

- `pgcrypto` gives `gen_random_uuid()`.
- `vector` supports pgvector embeddings.
- `pg_trgm` supports fuzzy lexical search where useful.

Optional later:

```sql
create extension if not exists "unaccent";
```

Use `unaccent` only if search quality needs accent-insensitive matching.

---

## Enum Plan

Prefer Postgres enums for stable lifecycle states. Prefer text plus Zod validation for experimental agent-specific values.

Recommended enums:

```sql
create type topic_status as enum ('active', 'paused', 'completed', 'archived');
create type session_status as enum ('planned', 'ready', 'delivered', 'completed', 'skipped', 'rescheduled');
create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type outbox_status as enum ('pending', 'sending', 'sent', 'failed', 'cancelled');
create type notification_channel as enum ('telegram', 'in_app', 'email', 'push');
create type audio_artifact_type as enum ('generated_question', 'generated_explanation', 'voice_answer');
create type transcript_status as enum ('pending', 'transcribed', 'confirmed', 'rejected', 'expired');
create type contradiction_status as enum ('pending', 'classified', 'resolved', 'dismissed');
create type update_status as enum ('pending', 'processing', 'applied', 'rejected', 'failed');
create type rag_retrieval_mode as enum ('metadata', 'semantic', 'lexical', 'hybrid', 'hierarchical', 'graph_enhanced');
```

RAG event type can be an enum once stable:

```sql
create type rag_event_type as enum (
  'onboarding_response',
  'session_summary',
  'question_asked',
  'evaluation_response',
  'gap_detected',
  'misconception_detected',
  'misconception_corrected',
  'concept_mastered',
  'contradiction_resolved',
  'layer3_injection'
);
```

Tradeoff:

- Enums make invalid states impossible.
- Enums require migrations when values change.
- Use enums for stable product state, not experimental labels.

---

## Table Groups

### Identity and Access

- `user_profile`
- `notification_preferences`

### Learning State

- `topic_briefs`
- `curriculum_state`
- `evaluation_sessions`
- `learner_concept_mastery`
- `notes`

### Knowledge and RAG

- `topic_knowledge_base`
- `rag_memory`
- `rag_query_traces`
- `concepts`
- `concept_prerequisites`
- `session_concepts`
- `source_claims`
- `claim_sources`

### Agents and Workflows

- `agent_update_queue`
- `job_runs`
- `api_idempotency_keys`
- `delivery_outbox`

### Live Updates and Media

- `news_items`
- `contradiction_queue`
- `audio_artifacts`

---

## Shared Column Rules

Most tables should include:

```sql
id uuid primary key default gen_random_uuid(),
user_id uuid not null,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Use `updated_at` when rows are mutable.

Use `created_at` only when records are append-only.

Do not store raw secrets in any table.

---

## `user_profile`

Purpose: authoritative learner state.

```sql
create table user_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  current_goal text,
  current_topic_id uuid,
  current_topic_slug text,
  curriculum_position jsonb not null default '{}',
  learner_preferences jsonb not null default '{}',
  stable_mastery_summary jsonb not null default '{}',
  active_misconceptions jsonb not null default '[]',
  next_evaluation_due_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index user_profile_current_topic_idx on user_profile (user_id, current_topic_id);
```

Rules:

- Do not store raw session transcripts here.
- Do not store long RAG memory here.
- Keep this as the fast profile summary for dashboard and agents.

---

## `topic_briefs`

Purpose: Architect handoff for a learning topic.

```sql
create table topic_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text not null,
  title text not null,
  goal text not null,
  required_depth text not null,
  learner_context jsonb not null default '{}',
  prerequisite_map jsonb not null default '[]',
  concept_outline jsonb not null default '[]',
  mastery_intent jsonb not null default '{}',
  source_agent text not null default 'architect_node',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_slug)
);
```

Indexes:

```sql
create index topic_briefs_user_created_idx on topic_briefs (user_id, created_at desc);
```

---

## `curriculum_state`

Purpose: authoritative curriculum state.

```sql
create table curriculum_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_brief_id uuid references topic_briefs(id),
  topic_slug text not null,
  status topic_status not null default 'active',
  layer_1_roadmap jsonb not null default '{}',
  layer_2_sessions jsonb not null default '[]',
  layer_3_live_queue jsonb not null default '[]',
  current_session_id text,
  current_session_index int not null default 0,
  revision int not null default 1,
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_slug)
);
```

Indexes:

```sql
create index curriculum_state_user_status_idx on curriculum_state (user_id, status, updated_at desc);
create index curriculum_state_current_session_idx on curriculum_state (user_id, current_session_id);
```

Rules:

- Layer 1 is written by Architect.
- Layer 2 is written by Curriculum Builder.
- Layer 3 is appended by approved update agents.
- Use `revision` for optimistic concurrency.

---

## `topic_knowledge_base`

Purpose: researched topic authority.

```sql
create table topic_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_brief_id uuid references topic_briefs(id),
  topic_slug text not null,
  source_inventory jsonb not null default '[]',
  concept_map jsonb not null default '[]',
  claims jsonb not null default '[]',
  limitations jsonb not null default '[]',
  code_patterns jsonb not null default '[]',
  version_notes jsonb not null default '[]',
  interview_patterns jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_slug)
);
```

Indexes:

```sql
create index topic_kb_user_topic_idx on topic_knowledge_base (user_id, topic_slug);
```

Rules:

- Important factual claims must preserve provenance.
- Large source documents should not be dumped here as raw text.
- Source-backed claim tables can normalize high-value claims later.

---

## `rag_memory`

Purpose: learner-memory RAG.

```sql
create table rag_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_id uuid,
  topic_slug text,
  concept_id uuid,
  concept_slug text,
  event_type rag_event_type not null,
  content text not null,
  retrieval_text text,
  synthesis_text text,
  embedding vector(1536),
  embedding_version text not null default 'v1',
  lexical_search_text text,
  source_agent text not null,
  source_id uuid,
  source_uri text,
  parent_document_id uuid,
  chunk_ordinal int,
  token_count int,
  confidence numeric not null default 0.8,
  quality_score numeric,
  is_resolved boolean not null default false,
  superseded_by_id uuid,
  freshness_at timestamptz,
  expires_at timestamptz,
  staleness_reason text,
  metadata jsonb not null default '{}',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index rag_memory_user_topic_event_idx
  on rag_memory (user_id, topic_id, event_type, created_at desc);

create index rag_memory_user_concept_idx
  on rag_memory (user_id, concept_id, event_type, created_at desc);

create index rag_memory_unresolved_idx
  on rag_memory (user_id, topic_id, event_type, created_at desc)
  where is_resolved = false;

create unique index rag_memory_idempotency_idx
  on rag_memory (user_id, idempotency_key)
  where idempotency_key is not null;

create index rag_memory_lexical_idx
  on rag_memory using gin (to_tsvector('english', coalesce(lexical_search_text, content)));
```

pgvector index:

```sql
create index rag_memory_embedding_hnsw_idx
  on rag_memory
  using hnsw (embedding vector_cosine_ops);
```

If HNSW is not available or too heavy initially:

```sql
create index rag_memory_embedding_ivfflat_idx
  on rag_memory
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

Rules:

- Filter by `user_id` before vector search.
- Filter by topic/concept/event type whenever possible.
- Do not store raw chat transcripts by default.
- Do not mix embedding dimensions or incompatible embedding versions.
- Use RAG for meaningful learning events, not generic logs.

---

## `rag_query_traces`

Purpose: safe RAG observability and evaluation traces.

```sql
create table rag_query_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id text not null,
  agent text not null,
  intent text not null,
  retrieval_mode rag_retrieval_mode not null,
  original_query_hash text,
  rewritten_query_count int not null default 0,
  inferred_filters jsonb not null default '{}',
  lexical_candidate_count int not null default 0,
  vector_candidate_count int not null default 0,
  final_context_count int not null default 0,
  final_context_tokens int not null default 0,
  reranker_top_score numeric,
  confidence_threshold numeric,
  confidence_gate_decision text,
  citation_verification_result text,
  latency_ms int,
  error_code text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

Indexes:

```sql
create index rag_query_traces_user_created_idx on rag_query_traces (user_id, created_at desc);
create index rag_query_traces_mode_created_idx on rag_query_traces (retrieval_mode, created_at desc);
```

Rules:

- Store hashes and counts by default.
- Do not store raw private prompts or raw learner memory unless debugging mode is explicitly enabled.

---

## `evaluation_sessions`

Purpose: durable evaluation record.

```sql
create table evaluation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  curriculum_state_id uuid references curriculum_state(id),
  topic_slug text not null,
  session_id text,
  status text not null default 'started',
  concepts_evaluated jsonb not null default '[]',
  question_answer_log jsonb not null default '[]',
  confirmed_transcripts jsonb not null default '[]',
  gaps_found jsonb not null default '[]',
  misconceptions_found jsonb not null default '[]',
  misconceptions_cleared jsonb not null default '[]',
  mastery_delta jsonb not null default '{}',
  remediation_requests jsonb not null default '[]',
  score numeric,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index evaluation_sessions_user_topic_idx
  on evaluation_sessions (user_id, topic_slug, created_at desc);

create index evaluation_sessions_status_idx
  on evaluation_sessions (user_id, status, created_at desc);
```

Rules:

- Do not score unconfirmed voice transcripts.
- Store evaluation evidence here; write compact useful memory into `rag_memory`.

---

## `agent_update_queue`

Purpose: deferred curriculum and knowledge updates.

```sql
create table agent_update_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_agent text not null,
  update_type text not null,
  priority int not null default 50,
  topic_slug text,
  concept_id uuid,
  payload jsonb not null,
  status update_status not null default 'pending',
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  idempotency_key text,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index agent_update_queue_ready_idx
  on agent_update_queue (user_id, status, priority, available_at);

create unique index agent_update_queue_idempotency_idx
  on agent_update_queue (user_id, idempotency_key)
  where idempotency_key is not null;
```

---

## `news_items`

Purpose: stored news intelligence and digest history.

```sql
create table news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text,
  source_name text not null,
  source_url text,
  title text not null,
  summary text not null,
  relevance_score numeric not null default 0,
  novelty_score numeric not null default 0,
  impact_score numeric not null default 0,
  connected_concept_ids jsonb not null default '[]',
  digest_status text not null default 'pending',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
```

Indexes:

```sql
create index news_items_user_topic_created_idx on news_items (user_id, topic_slug, created_at desc);
create index news_items_digest_status_idx on news_items (user_id, digest_status, created_at desc);
```

---

## `contradiction_queue`

Purpose: claim conflicts and resolution lifecycle.

```sql
create table contradiction_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text,
  concept_id uuid,
  claim_a jsonb not null,
  claim_b jsonb not null,
  classification text,
  resolution text,
  status contradiction_status not null default 'pending',
  resolved_by_agent text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index contradiction_queue_user_status_idx on contradiction_queue (user_id, status, created_at desc);
```

---

## Graph and Concept Tables

### `concepts`

```sql
create table concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text not null,
  slug text not null,
  name text not null,
  summary text,
  difficulty int,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_slug, slug)
);
```

### `concept_prerequisites`

```sql
create table concept_prerequisites (
  user_id uuid not null,
  topic_slug text not null,
  concept_id uuid not null references concepts(id) on delete cascade,
  prerequisite_concept_id uuid not null references concepts(id) on delete cascade,
  strength text not null default 'required',
  reason text,
  created_at timestamptz not null default now(),
  primary key (concept_id, prerequisite_concept_id)
);
```

### `session_concepts`

```sql
create table session_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  curriculum_state_id uuid references curriculum_state(id) on delete cascade,
  session_id text not null,
  concept_id uuid not null references concepts(id) on delete cascade,
  role text not null default 'primary',
  created_at timestamptz not null default now(),
  unique (user_id, session_id, concept_id)
);
```

### `learner_concept_mastery`

```sql
create table learner_concept_mastery (
  user_id uuid not null,
  concept_id uuid not null references concepts(id) on delete cascade,
  can_solve numeric not null default 0,
  can_explain numeric not null default 0,
  can_decide numeric not null default 0,
  confidence numeric not null default 0,
  last_evidence_at timestamptz,
  next_probe_due_at timestamptz,
  evidence_summary jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);
```

Indexes:

```sql
create index concepts_user_topic_idx on concepts (user_id, topic_slug);
create index concept_prereq_user_topic_idx on concept_prerequisites (user_id, topic_slug);
create index session_concepts_user_session_idx on session_concepts (user_id, session_id);
create index learner_mastery_probe_idx on learner_concept_mastery (user_id, next_probe_due_at);
```

Rules:

- Use `concept_prerequisites` for topological sort.
- Use `learner_concept_mastery` for adaptive evaluation.
- Use these tables as Phase 1 Graph RAG foundations.

---

## Source and Claim Tables

### `source_claims`

```sql
create table source_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text,
  concept_id uuid references concepts(id),
  claim text not null,
  normalized_claim text,
  confidence numeric not null default 0.8,
  effective_at timestamptz,
  superseded_by_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `claim_sources`

```sql
create table claim_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  claim_id uuid not null references source_claims(id) on delete cascade,
  source_name text,
  source_url text,
  source_type text,
  quote text,
  retrieved_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

Indexes:

```sql
create index source_claims_user_topic_idx on source_claims (user_id, topic_slug, created_at desc);
create index source_claims_concept_idx on source_claims (user_id, concept_id);
create index claim_sources_claim_idx on claim_sources (claim_id);
```

Rules:

- Use these when citations and claim traceability matter.
- Do not rely only on JSON blobs for long-term claim provenance.

---

## Notes

```sql
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_slug text,
  concept_id uuid references concepts(id),
  title text,
  body text not null,
  tags jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index notes_user_topic_idx on notes (user_id, topic_slug, updated_at desc);
```

---

## Backend Control Tables

### `job_runs`

```sql
create table job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_type text not null,
  status job_status not null default 'queued',
  input jsonb not null default '{}',
  output jsonb,
  error jsonb,
  idempotency_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index job_runs_user_status_idx on job_runs (user_id, status, created_at desc);
create unique index job_runs_idempotency_idx on job_runs (user_id, idempotency_key)
where idempotency_key is not null;
```

### `api_idempotency_keys`

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

### `delivery_outbox`

```sql
create table delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channel notification_channel not null,
  delivery_key text not null,
  payload jsonb not null,
  status outbox_status not null default 'pending',
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, delivery_key)
);
```

Indexes:

```sql
create index delivery_outbox_ready_idx on delivery_outbox (status, next_attempt_at);
```

### `notification_preferences`

```sql
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  telegram_enabled boolean not null default true,
  telegram_chat_id text,
  daily_learning_alert_enabled boolean not null default true,
  evaluation_alert_enabled boolean not null default true,
  digest_alert_enabled boolean not null default true,
  quiet_hours jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `audio_artifacts`

```sql
create table audio_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  artifact_type audio_artifact_type not null,
  source_text_hash text,
  voice_id text,
  voice_version text,
  storage_path text,
  transcript text,
  transcript_status transcript_status not null default 'pending',
  transcription_confidence numeric,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Indexes:

```sql
create index audio_artifacts_user_type_idx on audio_artifacts (user_id, artifact_type, created_at desc);
create index audio_artifacts_expiry_idx on audio_artifacts (expires_at);
```

Rules:

- Raw voice answer audio expires by default.
- Confirmed transcript belongs in `evaluation_sessions`.
- Generated audio can be regenerated from stored text.

---

## RLS Policy Pattern

Enable RLS on every learner-owned table:

```sql
alter table table_name enable row level security;
```

Owner/user access policy:

```sql
create policy "owner can access own rows"
on table_name
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

For tables where `user_id` is part of a composite primary key, use the same policy.

Important:

- Supabase service role can bypass RLS.
- Backend repositories must still enforce owner checks.
- Public frontend clients must never receive service-role keys.
- Future public product mode can replace owner-only checks with tenant/user authorization.

Tables requiring RLS:

- `user_profile`
- `topic_briefs`
- `curriculum_state`
- `topic_knowledge_base`
- `rag_memory`
- `rag_query_traces`
- `evaluation_sessions`
- `agent_update_queue`
- `news_items`
- `contradiction_queue`
- `concepts`
- `concept_prerequisites`
- `session_concepts`
- `learner_concept_mastery`
- `source_claims`
- `claim_sources`
- `notes`
- `job_runs`
- `api_idempotency_keys`
- `delivery_outbox`
- `notification_preferences`
- `audio_artifacts`

---

## Redis/Valkey Key Plan

Redis is not source of truth.

The canonical namespace, TTL/invalidation matrix, atomic primitive rules, and L1/L2 decision gate are maintained in `docs/36_REDIS_DATABASE_PERFORMANCE_DESIGN.md`. The examples below are logical key families; implementations must add the canonical `lrnr:v1:{environment}` prefix.

All keys must have TTL unless explicitly documented.

### Rate limits

```text
rate:user:{userId}:api
rate:user:{userId}:agent-run
rate:user:{userId}:rag-query
rate:user:{userId}:audio-generation
rate:user:{userId}:workflow-trigger
```

### Job locks

```text
lock:workflow:daily-learning:{date}
lock:workflow:daily-research:{date}
lock:workflow:nightly-reconcile:{date}
lock:job:{jobType}:{idempotencyKey}
```

### Job status

```text
job:{jobRunId}:status
agent-run:{runId}:status
```

### Dashboard cache

```text
cache:dashboard:{userId}
cache:dashboard-summary:{userId}
cache:current-lesson:{userId}:{sessionId}
```

### RAG cache

```text
cache:rag-query:{userId}:{queryHash}:{filterHash}
cache:rag-context-pack:{userId}:{requestHash}
cache:learner-question:{userId}:{questionHash}
```

### Audio cache

```text
cache:audio:question:{questionId}:{voiceVersion}
cache:audio:explanation:{contentHash}:{voiceVersion}
cache:transcription:{audioArtifactId}
```

### Idempotency

```text
idem:api:{userId}:{idempotencyKey}
idem:telegram:{userId}:{deliveryKey}
idem:rag-write:{userId}:{idempotencyKey}
```

Rules:

- Redis keys should be generated by typed helper functions.
- Do not hand-build Redis keys across the codebase.
- Do not store private raw content unless the key is short-lived and explicitly approved.
- Cache values should include `schemaVersion` where shape may evolve.

---

## Migration Order

Recommended Drizzle/Supabase migration sequence:

1. Extensions and enums
2. Identity/base tables
3. Topic and curriculum tables
4. Concept graph tables
5. Knowledge/source/claim tables
6. RAG memory table and indexes
7. Evaluation and agent update tables
8. Backend control tables
9. Notification/audio tables
10. RLS enablement and policies
11. Seed owner profile if needed

Do not create pgvector indexes before the table exists and data shape is final.

---

## Repository Modules

Recommended modules:

```text
src/db/profile.repo.ts
src/db/topic-briefs.repo.ts
src/db/curriculum.repo.ts
src/db/knowledge.repo.ts
src/db/rag.repo.ts
src/db/rag-traces.repo.ts
src/db/evaluation.repo.ts
src/db/agent-update-queue.repo.ts
src/db/news.repo.ts
src/db/contradictions.repo.ts
src/db/concepts.repo.ts
src/db/claims.repo.ts
src/db/notes.repo.ts
src/db/jobs.repo.ts
src/db/outbox.repo.ts
src/db/audio.repo.ts
src/db/notification-preferences.repo.ts
```

Repository rules:

- accept an authenticated actor/context
- validate input with Zod
- enforce user ownership
- use transactions for multi-table writes
- return domain objects, not raw database rows
- never call LLMs from repository code

---

## Open Decisions For Implementation

These should be finalized when writing Drizzle migrations:

- exact Auth.js user table strategy
- whether to store `topic_id` as UUID everywhere or use `topic_slug` in early MVP
- exact pgvector index choice: HNSW vs IVFFlat
- exact embedding model name and embedding version string
- exact retention period for `rag_query_traces`
- exact retention period for `audio_artifacts`
- whether `topic_knowledge_base.claims` remains JSONB or is fully normalized earlier

Recommended MVP choice:

```text
Use topic_slug for simple early routing.
Use UUID primary keys for durable relationships.
Keep claims JSONB initially, but normalize high-value source claims into source_claims/claim_sources.
Use HNSW if supported by deployed Postgres; otherwise start without vector index until data volume requires it.
```

---

## Final Schema Rule

The schema must make the correct behavior easy:

```text
Owner isolation is default.
RAG is scoped before search.
Curriculum writes are controlled.
Evaluation evidence is durable.
Redis is temporary.
Claims keep provenance.
Voice data is temporary unless confirmed as text.
Every important write is idempotent.
```
