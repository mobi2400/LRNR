# LRNR - Redis and Database Performance Design

> **Canonical Phase 1 performance and cache correctness contract.**
> Scope: Redis, database query efficiency, cache invalidation, idempotency, locks, and DB load reduction.

---

## Verdict

**Verdict: the current design is not yet industry-ready enough for Phase 1 retry and concurrency guarantees, but its PostgreSQL-first foundation is sound and can be made ready without redesigning the product.**

Biggest risks:

1. Idempotency does not reserve execution atomically, so concurrent retries can repeat side effects.
2. Lesson completion is a multi-write operation without one transaction or resumable state machine.
3. Redis helpers exist but are mostly not wired into routes, so there is little current DB-load reduction.
4. Current lesson and curriculum reads fetch and parse a full JSONB session array; writes replace that array without optimistic revision checks.
5. Dashboard data has neither the specified API/read model nor an implemented cache-aside path.

Top improvements:

1. Make PostgreSQL idempotency reservation and lesson completion transactional before expanding cache coverage.
2. Add projected dashboard/current-lesson read models, then L2 Redis cache-aside with explicit invalidation.
3. Add optimistic curriculum revision checks and normalize sessions only when Phase 1 size/concurrency thresholds require it.
4. Add query latency, returned-row, cache-hit, invalidation, lock, and idempotency metrics before enabling L1.
5. Keep L1 disabled by default; allow it only for tiny immutable or revision-keyed read models with a 2-5 second TTL.

### Authority chain

LRNR should use this authority chain:

```text
optional L1 process cache (2-5 seconds, bounded, non-authoritative)
  -> L2 Redis/Valkey cache (shared, versioned, TTL-bound)
  -> PostgreSQL (authoritative source of truth)
```

L2 Redis is recommended now for measured read hotspots. L1 is not a default Phase 1 requirement. Add L1 only after L2 is wired, cache metrics show repeated reads inside one process, and the deployment keeps processes warm long enough to benefit.

Correctness must never depend on either cache. A cache miss, invalid value, schema-version mismatch, or Redis outage must lead to PostgreSQL or a controlled failure according to the operation class.

---

## Current Design Summary

### Good foundations

- PostgreSQL is treated as authoritative; durable jobs, RAG memory, outbox rows, and idempotency records are not Redis-only.
- Repository calls are user-scoped and validate rows at runtime.
- Mutating tables have uniqueness constraints for several duplicate-sensitive writes.
- Redis keys are built in server helpers rather than scattered through routes.
- Cache TTLs exist for the cache helpers, and job/outbox state is persisted in PostgreSQL.

### Corrected in this audit

- Lock release now performs token comparison and deletion atomically. The old `GET` then `DEL` sequence could delete a replacement owner's lock.
- Rate-limit increments now use one atomic Redis script. The old `GET` then `SET` sequence lost increments under concurrent requests.
- Cached JSON now uses a schema-versioned envelope and Zod validation; incompatible values are evicted and rebuilt.
- Job type/status filtering, ordering, and limiting now happen in PostgreSQL instead of loading all owner jobs into Node.js.
- RAG retrieval now applies metadata, expiry, supersession, and staleness predicates before `LIMIT`.
- RAG indexes now match the implemented `topic_slug` and `concept_slug` predicates, and unresolved lookup is partial.

### Repository and query audit

| Area | Current implementation | Assessment | Required direction |
| --- | --- | --- | --- |
| Ownership filters | Repository reads and writes include `user_id` | Good Phase 1 and future multi-user habit | Keep actor scope mandatory in every repository method |
| Point lookups | Profile, topic, curriculum, knowledge, idempotency, and job ID reads use indexed predicates plus `LIMIT 1` | Good | Prefer projected columns on UI read paths instead of full rows |
| Job history | Filtering/order/limit now execute in SQL | Corrected | Add cursor pagination before exposing history lists |
| Latest workflow status | System status calls the job repository once for each of four job types | Query fan-out, not a classic N+1, but unnecessary | One `job_type IN (...) ORDER BY created_at DESC LIMIT 1` query |
| Current lesson | Reads full profile, then full curriculum row and parses every JSONB session | Acceptable for tiny curricula, wasteful as sessions grow | One dedicated projected query returning topic, revision, current session, and lesson only |
| Curriculum map | Reads full profile and full curriculum JSONB | Bounded in Phase 1 but payload grows with all lessons | Project map fields and omit lesson bodies from the map read model |
| Dashboard | Contract exists, but route/read model/cache are absent | Missing implementation | Two or three bounded queries in parallel, then cache the assembled summary |
| RAG memory | User/topic/concept/event/freshness filters now run before `LIMIT` | Corrected for metadata retrieval | Add cursor pagination and a separate explicit vector-search method |
| RAG vector search | Vector column exists, but production vector retrieval and ANN index are not implemented | Not yet a Phase 1 optimized path | Start with filtered exact search for the small owner corpus; add HNSW only after recall/latency measurements |
| Concepts | Topic-scoped query uses a matching index but has no limit or cursor | Unbounded | Require a limit and stable `(created_at, id)` or `(slug, id)` cursor |
| Topic briefs | Recent list is limited and ordered, but has no cursor | Safe for internal Phase 1 calls | Add cursor only when the list becomes user-facing or can exceed one page |
| Outbox claim | Indexed by status and next-attempt time; claim update checks pending state | Reasonable MVP, but competing workers perform select then conditional update | Use `FOR UPDATE SKIP LOCKED` in a short transaction when multiple workers are enabled |
| Idempotency cleanup | Lookup has a unique index; expired rows are not excluded or efficiently swept | Correctness and growth risk | Add authoritative reservation states plus an `expires_at` cleanup index/job |
| Onboarding RAG writes | One insert per planned memory inside a loop | Query fan-out | Batch rows in one repository call and transaction while preserving per-row idempotency |
| JSONB use | Flexible curriculum and knowledge documents are stored as JSONB | Suitable for bounded documents, not frequently patched collections | Keep roadmap/agent documents in JSONB; normalize sessions before concurrent edits or large curricula |

### Index findings

Keep or add indexes only for demonstrated query shapes:

- Keep unique `(user_id, topic_slug)` indexes for topic brief, curriculum, and knowledge point lookups.
- Keep `(user_id, job_type, created_at)` for latest job-by-type reads.
- Keep RAG `(user_id, topic_slug, event_type, created_at)` and `(user_id, concept_slug, event_type, created_at)` indexes.
- Keep the partial unresolved RAG index because it targets a small active subset.
- Add `api_idempotency_keys(expires_at)` only when the cleanup worker is implemented.
- Consider a partial outbox index on `(next_attempt_at, created_at) WHERE status = 'pending'` when multiple workers or meaningful backlog exists.
- Do not add a JSONB metadata GIN index during the owner-only MVP unless query traces show metadata containment is a hotspot.
- Do not add HNSW merely because an embedding column exists. For a small owner corpus, filtered exact search is simpler and can have better predictable recall.

### Over-fetching and join policy

Most repositories currently call `select()` for whole rows. This is harmless for small scalar rows but expensive for `curriculum_state`, `topic_knowledge_base`, and `rag_memory`, which contain large JSONB/text/vector fields.

Use dedicated read models for UI paths:

- Dashboard: query only topic title/status, current session summary, progress counts, bounded alerts, and latest workflow status. Avoid one giant join that multiplies curriculum, alert, and job rows; use two or three bounded queries in parallel and assemble in the service.
- Current lesson: use one user-scoped join from profile to curriculum and project `topic_slug`, `revision`, status/pointer fields, and only the current JSONB session element. Do not return every session or the knowledge base.
- Curriculum map: project roadmap and session summaries without embedded lesson bodies.
- Workflow status: query by `(user_id, run_id)` for a specific run; query latest across allowed types with one `IN` query.
- System status: run PostgreSQL and Redis health probes in parallel with strict timeouts, plus one latest-job query. Never call LLM, embeddings, or Telegram providers during this page load.

### Pagination and cursor contract

Use keyset cursors rather than offset pagination for growing tables:

```text
ORDER BY created_at DESC, id DESC
WHERE (created_at, id) < (:cursorCreatedAt, :cursorId)
LIMIT :limit
```

Require cursors for job history, RAG memories, outbox administration, alerts, and eventually topic briefs. Use a deterministic slug/id cursor for concept lists when alphabetical order is the product requirement. Limits remain mandatory even when a cursor is omitted for the first page.

## Gaps/Risks

1. API idempotency is `read -> execute -> upsert`. Two concurrent requests with the same key can both execute side effects.
2. `mark-complete` requires the header but does not reserve or replay the idempotency record.
3. Lesson completion updates curriculum, writes RAG memory, and advances the pointer without one transaction or resumable state machine.
4. Onboarding completion performs several durable writes plus sequential RAG inserts without one transaction/batch boundary.
5. Redis cache, lock, and rate-limit helpers are not yet wired into normal routes, so Redis currently provides almost no DB load reduction.
6. `GET /api/dashboard` is specified but not implemented; the dashboard page does not load a backend summary.
7. Curriculum sessions live in one JSONB array. Reads parse the full array and writes replace it, which risks lost updates and increasing row-write cost.

These gaps should be handled before describing Phase 1 retries or horizontal scaling as production-safe.

---

## Cache Key Plan

All application-owned keys must use:

```text
lrnr:v1:{environment}:{kind}:{scope...}
```

Examples:

```text
lrnr:v1:prod:cache:dashboard:{userId}:g{generation}
lrnr:v1:prod:cache:current-lesson:{userId}:{sessionId}:r{revision}
lrnr:v1:prod:cache:curriculum-map:{userId}:{topicSlug}:r{revision}
lrnr:v1:prod:cache:rag-query:{userId}:g{generation}:{queryHash}:{filterHash}
lrnr:v1:prod:lock:workflow:{userId}:{workflow}:{logicalDate}
lrnr:v1:prod:rate-limit:{scope}:{actorHash}
lrnr:v1:prod:run-status:{userId}:{runId}
lrnr:v1:prod:gen:{userId}:{domain}
```

Rules:

- Build keys with typed helpers only.
- Include environment to prevent local/staging/production collisions on shared infrastructure.
- Include user scope before any private cached data.
- Hash free-form prompts, filters, URLs, and idempotency keys before putting them in keys.
- Never use `KEYS` or production-wide `SCAN` for invalidation.
- Every application key has a TTL. BullMQ-owned keys follow BullMQ retention settings.

Cache values use:

```ts
interface CacheEnvelope<T> {
  schemaVersion: number;
  cachedAt: string;
  sourceRevision?: number;
  value: T;
}
```

---

## Invalidation Plan

| Data                          |             L1 |              L2 TTL | Invalidation authority                                  | Stale serving                                   |
| ----------------------------- | -------------: | ------------------: | ------------------------------------------------------- | ----------------------------------------------- |
| Dashboard summary             |  optional 2-5s |  30-60s plus jitter | lesson, curriculum, alert, evaluation writes            | up to 30s only during rebuild failure           |
| Current lesson                |    optional 2s | 60-120s plus jitter | lesson generation, status, pointer, curriculum revision | no stale value after a successful mutation      |
| Curriculum map                |    optional 5s |               5-15m | revision embedded in key                                | old revisions expire naturally                  |
| Workflow status               |           none |              10-15s | job transition overwrites key                           | PostgreSQL fallback on miss                     |
| RAG query/context             | none initially |                1-5m | user/topic RAG generation increment                     | never bypass freshness/permission filters       |
| Provider deterministic result |           none |   provider-specific | model/prompt/tool version in key                        | only for deterministic, privacy-approved inputs |
| Rate limit                    |           none |              window | automatic expiry                                        | not applicable                                  |
| Lock                          |           none |       bounded lease | token-owned release or expiry                           | not applicable                                  |

Add 5-15 percent TTL jitter to high-traffic read caches to avoid synchronized expiry.

### Write invalidation order

```text
begin database transaction
  -> update authoritative rows
  -> write outbox/domain event if cross-process invalidation is needed
commit
  -> delete known L2 keys or increment the domain generation
  -> evict local L1 entries
```

If cache invalidation fails after commit, log and measure it; TTL is the final safety net. Never roll back a successful authoritative write because cache deletion failed.

Use direct `DEL` for a small known key set. Use revisioned keys for curriculum. Use a generation counter for broad RAG dependencies. Do not maintain large per-user Redis sets solely to discover cache keys unless measurements prove generation keys insufficient.

### Stampede control

For dashboard or similarly expensive derived reads:

1. Read L1 if enabled.
2. Read and validate L2.
3. On miss, acquire a 2-5 second rebuild lease with `SET NX PX`.
4. Lease owner queries PostgreSQL, fills L2, then L1.
5. Other callers briefly retry with jitter or query PostgreSQL when latency budget allows.

The rebuild lease reduces duplicate work; it is not a correctness lock.

---

## Data Structure Plan

| Structure  | LRNR use                                              | Decision                                                                       |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| String     | versioned JSON cache, lock token, counter, generation | default and sufficient for Phase 1                                             |
| Hash       | frequently patched run-status fields                  | optional later; PostgreSQL remains durable truth                               |
| Set        | membership/index replication                          | avoid; query PostgreSQL rather than duplicate relational indexes               |
| Sorted set | custom delayed scheduling or sliding-window log       | use only if BullMQ does not already own the scheduling need                    |
| Stream     | durable event processing                              | do not add beside BullMQ plus PostgreSQL outbox without a distinct requirement |

Do not manually edit or share BullMQ's Redis keys. Use a dedicated prefix and retention policy for queues.

### Use-case data structure plan

| Use case | Source of truth | Cache key / Redis structure | Invalidation trigger | TTL | Complexity expectation | Failure mode |
| --- | --- | --- | --- | ---: | --- | --- |
| Dashboard summary | PostgreSQL-derived read model | `cache:dashboard:{userId}:g{generation}` as a versioned string | Lesson status/pointer, curriculum, evaluation, alert, or relevant preference write | 30-60s plus jitter | Warm O(1); cold two or three indexed bounded queries | On Redis failure query DB; if DB fails return an explicit unavailable state, not fabricated empty data |
| Current lesson | PostgreSQL curriculum/session state | `cache:current-lesson:{userId}:{sessionId}:r{revision}` as a versioned string | Lesson generation, delivery/completion, pointer, curriculum revision | 60-120s plus jitter | Warm O(1); cold one indexed projected lookup and one JSONB element extraction | Bypass/evict cache after mutation; on Redis failure read DB; never serve a known old lesson |
| Curriculum map | PostgreSQL curriculum state | `cache:curriculum-map:{userId}:{topicSlug}:r{revision}` as a versioned string | Revision changes; old revision keys expire naturally | 5-15m | Warm O(1); cold O(number of sessions) to validate/serialize summaries | Read DB on cache failure; omit lesson bodies to keep payload bounded |
| Job status | PostgreSQL `job_runs` | `run-status:{userId}:{runId}` as a small versioned string; hash is unnecessary in Phase 1 | Every durable job transition overwrites the key | 10-15s active; up to 1h terminal | O(1) Redis; O(log n) indexed DB point lookup | Fall back to DB; if both fail show unknown/degraded, never assume success |
| Delivery outbox | PostgreSQL `delivery_outbox` | No application cache; BullMQ may carry a job reference, not delivery truth | Not applicable | Not applicable | Indexed pending claim O(log n); constant-size batch | Retry from DB with backoff; unique delivery key prevents duplicate logical rows |
| Idempotency | PostgreSQL `api_idempotency_keys` state machine | Optional completed-response string keyed by hashed user/route/key | Reservation, completion, terminal failure, expiry cleanup | No longer than DB record, initially 24h | Unique indexed claim O(log n); replay O(1) in Redis or indexed DB | Redis failure uses DB; processing owner remains authoritative; conflicting hash returns 409 |
| RAG memory | PostgreSQL `rag_memory` | Optional `cache:rag-query:{userId}:g{generation}:{queryHash}:{filterHash}` versioned string | Memory insert, resolve, supersede, expire, embedding/filter-version change | 1-5m | Metadata lookup O(log n + k); exact vector scan acceptable only for small filtered corpus; ANN target sublinear candidate search | Recompute from DB; apply permissions/freshness again; refuse when evidence is weak |
| Notification preferences | PostgreSQL `notification_preferences` | Optional shared versioned string for UI/read decisions; no L1 for send authorization | Any preference update | 30-60s | O(1) warm; indexed unique DB lookup cold | Read DB before a sensitive send when cache is unavailable or invalid; default to no send on ambiguity |
| Workflow locks | PostgreSQL job state/uniqueness is final correctness guard | Redis string containing random owner token with `NX PX` | Token-owned release, lease expiry, or safe renewal | Measured p99 step duration plus margin | O(1) Redis commands | If Redis fails, use safe DB uniqueness/advisory guard or reject duplicate-prone start; never continue assuming a lock |
| System status | Live bounded health probes plus latest durable `job_runs` row | Optional `cache:system-status:{userId}` versioned string | Natural expiry; explicit overwrite after known dependency/job change is optional | 2-5s | Parallel constant-count probes plus one indexed job query | Return per-dependency degraded/down states within a strict response deadline |

Hashes, sets, sorted sets, and streams are not automatically more efficient. Phase 1 mostly needs strings plus PostgreSQL indexes. Introduce another Redis structure only when its operations match a measured access pattern and do not duplicate PostgreSQL authority.

---

## Locks and Workflow Safety

Redis locks reduce duplicate work; they do not prove a business transition is valid.

Required lock behavior:

- acquire with a random token and `SET key token NX PX ttl`
- release with atomic compare-and-delete
- renew only with atomic compare-and-expire and only while the token matches
- set TTL from measured p99 work duration plus margin
- stop or fence writes if the lease is lost
- keep the database uniqueness constraint or state transition as the final correctness guard

For long workflows, do not hold one fixed Redis lease across LLM/provider work. Persist a `job_runs` state machine and use step-level idempotency. If concurrent writers can corrupt the same curriculum revision, use optimistic concurrency (`WHERE revision = expectedRevision`) or a PostgreSQL advisory/row lock around the short write transaction.

---

## Idempotency Contract

PostgreSQL must be the authoritative idempotency store. Redis may cache completed responses but must not be the only record.

Required state machine:

```text
reserved -> processing -> completed
                       -> failed_retryable
                       -> failed_terminal
```

Claim algorithm:

1. Hash the canonical route, authenticated user, and validated body.
2. Insert `(user_id, key, route, request_hash, status=processing)` with a unique constraint.
3. If inserted, this request owns execution.
4. If an existing row has a different route/hash, return `409 IDEMPOTENCY_CONFLICT`.
5. If completed, replay the stored status code and response.
6. If processing, return a stable in-progress response; do not execute again.
7. Complete the business write and idempotency response in one transaction when possible.
8. Reclaim expired processing rows only through an explicit, audited timeout policy.

Never use an upsert that overwrites another request's route or request hash.

---

## Rate Limiting and Failure Policy

The Phase 1 fixed window is acceptable after making increment and TTL atomic. Use token bucket or GCRA later only when burst smoothing is actually required.

Suggested owner-mode scopes:

| Scope             | Initial policy | Redis outage behavior                        |
| ----------------- | -------------: | -------------------------------------------- |
| normal read       |        120/min | fail open, log degraded protection           |
| normal write      |         30/min | fail open only if DB idempotency is active   |
| workflow start    |          5/10m | fail closed or use DB job uniqueness         |
| RAG query         |         30/min | fail closed if provider cost is material     |
| notification test |         5/hour | fail closed; outbox uniqueness still applies |

Use a hashed actor identifier in rate-limit keys and expose `Retry-After` on rejection.

---

## Recommended DB Query/Index Improvements

- Push filters, ordering, aggregation, and limits into PostgreSQL.
- Select only columns needed by read models; avoid `select *` on JSONB-heavy tables for dashboard summaries.
- Use stable cursor pagination on `(created_at, id)` for growing lists.
- Make composite indexes match equality predicates first, then range/order columns.
- Use partial indexes for small active subsets such as unresolved RAG rows and ready outbox rows.
- Validate index value with `EXPLAIN (ANALYZE, BUFFERS)` on production-like cardinality before keeping it.
- Remove redundant indexes after measuring write amplification and index usage.
- Batch independent inserts and use transactions for multi-row state transitions.
- Never hold a DB transaction open during LLM, scraping, Telegram, or embedding calls.

### Phase 1 query priorities

1. Replace application-side job filtering with indexed SQL. Completed in this audit.
2. Align RAG slug filters and indexes. Completed in this audit.
3. Add a dashboard read model/query that projects only the summary fields.
4. Implement current lesson as one joined/projected query or a revision-keyed L2 cache.
5. Batch onboarding RAG seed inserts.
6. Add optimistic revision checks to curriculum writes.
7. Normalize `curriculum_sessions` before session count or concurrent writes make the JSONB document expensive.
8. Add cursor pagination to RAG memories, job history, briefs, concepts, and outbox admin views.

---

## Recommended Redis Architecture

### Phase 1 deployment shape

Use one shared L2 Redis/Valkey service for the owner-only MVP, with explicit TTLs, memory headroom, monitoring, and `noeviction` if locks/rate limits/queue keys share the instance. This is operationally simpler and avoids pretending that an evictable cache key and a correctness-sensitive lease have the same failure tolerance.

Split Redis later only when measurements require different memory or availability policies:

```text
cache Redis: evictable, cache-only keys, allkeys-lfu acceptable
coordination Redis: locks, rate limits, BullMQ, noeviction
```

This split is independent of L1/L2 terminology: both services are still shared L2 infrastructure. L1 remains optional process memory.

### Exactly where L1 is safe

L1 means a bounded in-process memory cache. It is safe only when a stale or missing value cannot authorize an action, duplicate a side effect, or hide an important state transition.

| L1 use | Safe conditions | Maximum Phase 1 TTL | Why it is safe |
| --- | --- | ---: | --- |
| Request-local memoization | Lives only for one request/workflow invocation | request lifetime | Eliminates duplicate repository calls without cross-request staleness |
| Dashboard read model | Read-only, schema-validated, bounded, L2 already authoritative for cache sharing | 2-5s | A brief summary delay is tolerable if mutations evict local entries and L2/DB remain fallback |
| Curriculum map summary | Key includes the durable curriculum revision; lesson bodies are excluded | 2-5s | Old revisions cannot overwrite or masquerade as the new revision |
| Static server configuration | Value is immutable for the process lifetime and contains no rotating authorization decision | process lifetime | It is configuration memoization, not learner-state caching |
| System health summary | UI display only, each probe has its own timeout, stale age is shown or bounded | 2-5s | Prevents probe storms while limiting how long an outage can be hidden |

The safest useful L1 is request-local memoization. It requires no distributed invalidation and should be implemented before any cross-request L1.

### Exactly where L1 is dangerous

Do not use process memory for:

| Data/operation | Why L1 is dangerous |
| --- | --- |
| Current lesson under a stable `userId` key | Another instance can complete or advance the lesson while this process continues serving the old lesson. Use request-local memoization or a revision-keyed value only when the caller already knows the current durable revision. |
| Job/workflow status | Stale `running`, `failed`, or `succeeded` values confuse progress UI and retry decisions; shared L2 plus PostgreSQL fallback is sufficient. |
| Idempotency ownership or replay | Separate processes cannot see each other's claims, so duplicate side effects remain possible. |
| Locks, leases, fencing tokens | Process memory provides no distributed exclusion. |
| Rate limits and quotas | Limits would apply independently per process and become bypassable during scaling. |
| Authentication, unlock, owner, permission, or notification-send decisions | Stale security/preferences state can allow access or send a message after the owner disabled it. |
| Outbox claim/delivery state | Two workers can act on different local views and send duplicates. |
| RAG permission/freshness filters | Cached private context can outlive a permission, resolution, supersession, or freshness change. |
| Mutable current curriculum without a revision in the key | Local invalidation reaches only one process and cannot prevent lost or stale state elsewhere. |
| Unbounded lesson, RAG, or knowledge documents | Creates process memory pressure and unpredictable eviction or restarts. |

L1 becomes unsafe when correctness assumes that local eviction reaches every server. If cross-process invalidation is required, use L2 generation/revision keys or an explicit invalidation event; never treat pub/sub delivery as the only correctness mechanism.

### L1 operational rules

- Bound both entry count and estimated bytes.
- Store only schema-validated read models, never raw database/provider objects.
- Do not refresh TTL on every hit; entries must age out.
- Record hit, miss, eviction, entry-count, and byte estimates.
- Clear the entire L1 safely on deploy; PostgreSQL/L2 rebuild the values.
- If L1 is lost, latency may rise but behavior must remain correct.
- Serverless or short-lived processes may have near-zero L1 hit rate; skip L1 rather than adding complexity without measured benefit.

Enable L1 only when all are true:

- L2 is already serving the read path.
- Metrics show repeated reads within one process during the L1 TTL.
- The process is long-lived enough to retain entries.
- The cache is bounded by entry count and estimated bytes.
- L1 keys include the same revision/generation as L2.
- Every local mutation evicts related L1 entries.

Do not use L1 for locks, rate limits, idempotency, permissions, or workflow ownership. A serverless process cache is an opportunistic micro-optimization, not a shared system layer.

---

## UX Performance

| UX requirement | Current state | Phase 1 target and design |
| --- | --- | --- |
| Dashboard fast load | Dashboard shell renders, but the specified summary API/read model is absent | Add a projected read model; target warm cache under 150 ms and cold indexed DB under 600 ms |
| Current lesson fast load | Correctly avoids an LLM call, but performs two sequential full-row reads and parses all sessions | One projected DB query or L2 hit; never generate a lesson during normal page load |
| No LLM on page load | Current lesson read satisfies this | Keep all generation in explicit workflow/mutation paths |
| System status responsive | Probes run in parallel, but latest job uses four queries and dependency probes lack explicit short deadlines | One latest-job query; 250-500 ms dependency timeouts; optional 2-5 second shared/UI cache |
| Workflow progress visible | Durable `job_runs` exists, but the workflow status route and shared status cache are not fully wired | DB remains truth; overwrite a short-lived L2 status after every durable transition; poll with backoff |
| No stale confusing lesson state | No active lesson cache means no cache staleness today | When caching is added, use revision/session keys and hard invalidation after completion/pointer changes; do not use a stable L1 user key |
| No duplicate Telegram alerts | Unique delivery keys and the outbox prevent duplicate logical rows | Use transactional state-plus-outbox writes and safe worker claims; track chunk-level delivery if multi-chunk retry must avoid resending earlier chunks |
| Safe retry behavior | Some mutations require keys, but reservation/replay is incomplete | Atomic DB reservation, in-progress response, exact replay, and transactionally stored result before claiming retry safety |

The frontend should render explicit `loading`, `degraded`, `not ready`, and `failed` states. Cache or dependency failure must not be translated into an empty curriculum, missing lesson, or successful workflow.

---

## Industry-Level Comparison

| Pattern | Production expectation | LRNR status | Recommendation |
| --- | --- | --- | --- |
| Cache-aside | Read cache, fall back to DB, validate/fill cache, invalidate after writes | Helpers exist; route/service wiring is largely absent | Use for dashboard, current lesson, curriculum map, and selected RAG results |
| Read-through cache | Cache library loads DB values implicitly | Not implemented | Avoid for Phase 1; it hides repository calls and invalidation ownership |
| Write-through cache | Writes pass through cache before/with DB | Not implemented | Avoid for learner state; DB-first plus post-commit invalidation is easier to debug |
| Stale-while-revalidate | Serve bounded stale data while one caller rebuilds | Not implemented | Allow only dashboard/system summaries with explicit maximum staleness; never lesson pointer, job terminal state, permissions, or idempotency |
| Dogpile prevention | One short rebuild lease, bounded wait/jitter, DB fallback | Not implemented | Add only after a real cached read path shows concurrent cold misses |
| Distributed locks | Token ownership, atomic release/renewal, bounded lease, DB fencing/constraint | Atomic release exists; renewal/fencing and route wiring remain | Use for duplicate-work reduction; DB state remains correctness guard |
| Idempotency records | Atomic claim, same-hash replay, different-hash conflict, in-progress state, expiry cleanup | Durable table exists; execution claim is race-prone | Highest-priority correctness fix |
| Transactional outbox | Business state and delivery row commit together; workers claim safely and retry | Outbox/unique keys exist; all producing writes are not proven transactional | Put state change and outbox insert in one DB transaction |
| Queue/job status | Durable job state, bounded retries, visible progress, queue payload references durable run | `job_runs` exists; complete queue/worker/status-route behavior is incomplete | Keep queue payload small and update DB before L2 status |
| Observability | Cache hit ratio, query latency/rows, lock/idempotency/outbox metrics, safe traces | Structured logging and health checks exist; performance metrics are missing | Add named low-cardinality metrics before tuning TTLs/indexes |
| Redis failure fallback | Reads fall back to DB; costly/duplicate-prone mutations fail safely | Cache parser fails open to DB conceptually; route policies are not wired | Define failure behavior per operation as in the data-structure table |
| Graceful degradation | Partial dependency failure produces bounded, honest UX | System status can report down, but other read/write paths lack a shared policy | Centralize degraded cache/provider behavior and never fabricate success |

The production goal for Phase 1 is not maximum cache coverage. It is deterministic database correctness, bounded queries, explicit cache ownership, and honest degradation.

---

## Observability Metrics

Track by cache/query name, never by raw private key:

- L1 and L2 hit/miss/error/invalid-value counts
- cache fill duration and payload bytes
- invalidation failures
- DB query duration and returned row count
- Redis command latency and errors
- lock acquire failures, lease loss, and duration
- rate-limit decisions by scope
- idempotency replay, conflict, in-progress, and stale-claim counts
- outbox claim/send/retry counts
- RAG candidate counts before and after filters

Optimization is complete only when it reduces measured latency or DB work without weakening correctness.

---

## Implementation Tasks Ordered by Priority

### P0 - correctness before caching

1. Implement atomic PostgreSQL idempotency reservation, in-progress handling, exact status/body replay, and expiry cleanup.
2. Make lesson completion one transaction or explicit resumable state machine covering curriculum status, next pointer, RAG summary, and idempotency completion.
3. Put workflow state changes and Telegram outbox insertion in the same transaction.
4. Add optimistic `revision = expectedRevision` checks to curriculum document writes.
5. Wire workflow start to a Redis lease plus a durable DB uniqueness/state guard; do not hold one lease across long provider calls.

### P1 - bounded low-latency reads

6. Add the dashboard API/read model using two or three projected, bounded queries; then add L2 cache-aside and explicit invalidation.
7. Add a projected current-lesson query and revision-keyed L2 cache; invalidate after generation, completion, or pointer changes.
8. Replace four latest-workflow queries in system status with one `IN` query and add strict dependency timeouts.
9. Add limit/cursor contracts to concepts, RAG memories, job history, outbox administration, and any user-facing brief list.
10. Batch onboarding RAG seed inserts while preserving uniqueness and validation.
11. Expose workflow progress from durable `job_runs`, using L2 only as a short-lived acceleration copy.

### P2 - measured optimization

12. Add low-cardinality query/cache/Redis/idempotency/outbox metrics and establish baseline p50/p95/p99 latency.
13. Implement filtered exact RAG vector search first; add HNSW only when corpus size and measured latency require it and recall tests pass.
14. Add dogpile protection only to proven expensive cache fills.
15. Add bounded L1 only when measured process-local reuse justifies it.
16. Normalize curriculum sessions when session count, payload size, or concurrent write metrics cross the documented threshold; do not pre-emptively redesign Phase 1.

This order reduces DB load while keeping PostgreSQL authoritative and avoiding cache complexity before there is a demonstrated hotspot.

---

## Exact Docs/Files to Update

### Updated by this audit

- `docs/24_BACKEND_AUTH_CACHE_PLAN.md` - points cache implementation to this canonical contract.
- `docs/25_BACKEND_SYSTEM_DESIGN.md` - points caching architecture to this canonical contract.
- `docs/26_DATABASE_SCHEMA_IMPLEMENTATION.md` - aligns logical Redis keys with the canonical namespace and rules.
- `docs/32_PHASE_1_API_CONTRACT.md` - defines atomic idempotency reservation, in-progress behavior, and lesson-completion requirements.
- `docs/34_DEPLOYMENT_ENV_CHECKLIST.md` - defines safe shared-Redis memory policy and verification checks.
- `docs/36_REDIS_DATABASE_PERFORMANCE_DESIGN.md` - canonical audit, target design, and implementation order.

### P0 implementation files

- `src/db/api-idempotency.repo.ts`
- `src/server/idempotency.ts`
- `src/services/onboarding.service.ts`
- `src/services/lesson.service.ts`
- `src/app/api/lesson/[sessionId]/mark-complete/route.ts`
- `src/db/curriculum.repo.ts`
- `src/db/outbox.repo.ts`
- `src/services/delivery.service.ts`
- `src/lib/redis.ts`
- `src/server/locks.ts`
- `src/server/rate-limit.ts`
- corresponding schema migration and focused concurrency/integration tests

### P1 implementation files

- `src/services/dashboard.service.ts` (new)
- `src/app/api/dashboard/route.ts` (new)
- a projected dashboard/current-lesson read repository under `src/db/`
- `src/services/lesson.service.ts`
- `src/services/curriculum.service.ts`
- `src/services/system-status.service.ts`
- `src/db/jobs.repo.ts`
- `src/db/rag.repo.ts`
- `src/db/concepts.repo.ts`
- `src/server/cache.ts`
- workflow status route/service files defined by `docs/31_REPOSITORY_STRUCTURE.md`
- route, repository, cache-invalidation, pagination, and Redis-failure tests

### Documentation/commit boundary

This audit's documentation must be committed separately from implementation changes. Atomic Redis/query corrections already prepared in the working tree belong in a later code commit after their migration and tests are reviewed; they are intentionally excluded from the documentation commit.
