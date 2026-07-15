# LRNR RAG Industry Readiness Implementation Plan

> Phase 0 baseline created before runtime changes. This document tracks the RAG hardening sequence from the July 2026 readiness instructions and should be updated when implementation reality changes.

## Baseline Status

- Git status before Phase 0 changes: clean tracked tree, with unrelated untracked `pnpm-workspace.yaml` left untouched.
- Baseline verification: `npm run typecheck` passed.
- Code graph discovery was attempted first. The graph is currently sparse for newer RAG code, so targeted file reads were used for exact repository/schema details.
- Current learner-memory RAG centers on `rag_memory` in `src/db/schema/knowledge.schema.ts` and `src/db/rag.repo.ts`.
- Current source knowledge is stored mostly as JSON in `topic_knowledge_base`; Phase 1 adds normalized `source_documents` and `source_chunks` schema plus pure ingestion/chunking drafts for future repository wiring.

## Current RAG Call Path Map

| Path | Current implementation | Gap for readiness |
| --- | --- | --- |
| Onboarding memory writes | Architect onboarding writes compact `onboarding_response` events through the RAG repository. | Embeddings are not produced during write, and write input does not carry controlled embedding model metadata. |
| Lesson-summary writes | Teaching flow writes compact `session_summary` style memory instead of raw lesson dumps. | No embedding pipeline, citation evidence model, or claim verification is connected to the summary. |
| Follow-up questions | Teaching follow-up behavior can retrieve memory context and produce deterministic/source-linked answers. | It is not yet a grounded generation pipeline with claim-level citation verification and safe refusal. |
| Topic research | Cartographer/topic knowledge persists structured research in topic knowledge tables. | External source ingestion is not yet normalized, SSRF-hardened, chunked, embedded, and quality-gated. |
| Topic knowledge persistence | `topic_knowledge_base` stores source inventory, claims, concept map, limitations, and patterns as JSON. | Source documents/chunks/claims are not yet queryable with citation-preserving relational retrieval units. |
| RAG queries | `queryMemory()` provides owner-scoped, bounded chronological retrieval; `retrieveContext()` does scoped lexical/vector candidate retrieval. | No central retrieval controller, deterministic RRF fusion, reranking module, confidence gate, or context pack builder. |
| Cache access | Shared L2 Redis helpers exist and selected dashboard/lesson/curriculum reads use cache-aside. | RAG-specific cache namespace, safe invalidation, and query-result cache policy are not complete. |
| Observability | Metrics helper records cache/query/RAG candidate metrics in memory; Winston logger exists. | RAG stage spans, low-cardinality stage metrics, redacted trace IDs, and eval/report integration are incomplete. |
| Tests/evals | Unit tests cover repository structure, metrics, cache helpers, and Phase 1 eval contract. | Eval harness still needs golden examples that measure retrieval, grounding, refusal, citation support, and cross-user isolation. |

## Implementation Matrix

| Requirement | Current implementation | Gap | Proposed module/change | Schema impact | Test requirement | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Secure source ingestion | Phase 1 adds an injectable ingestion planner with URL/network/content controls, HTML stripping, normalization, hashing, prompt-injection neutralization, and chunk draft creation. | Repository persistence and embedding handoff still need later phase wiring. | `src/rag/ingestion/source-ingestion.ts`. | Adds normalized source document/chunk tables. | URL policy, redirect, content type, and chunk plan tests. | P1 |
| Citation-preserving chunks | Phase 1 adds deterministic heading-aware chunk drafts with anchors, hashes, section paths, token estimates, and quality diagnostics. | Transcript/code/claim specialized chunkers can be refined after measured baseline. | `src/rag/ingestion/chunking.ts`. | Adds explicit `source_chunks` columns for citation and embedding metadata. | Deterministic chunking and boundary-preservation tests. | P1 |
| Embedding wrapper | Phase 2 adds a server-only deterministic embedding wrapper with model/dimension/version registry, canonicalization, dedupe, timeout/retry, metrics, safe logs, cache, query-vector validation, and a dry-run backfill plan. | Real provider adapter and DB write integration are still later wiring. Exact pgvector search is preferred until corpus size/latency justifies HNSW. | `src/lib/embeddings.ts` and `scripts/backfill-rag-embeddings.ts`. | Source chunks already have model/version/dimension columns. | Wrapper metadata, dedupe, and query-version validation tests. | P1 |
| Hybrid retrieval controller | Phase 3 adds a typed central controller with request/filter schemas, deterministic intent inference, query normalization, embedding-version selection, repository-scoped retrieval, RRF diagnostics, and context-pack traces. | PostgreSQL full-text ranking/source-chunk repository integration, reranking, confidence, and token packing are still later phases. | `src/rag/retrieval/controller.ts`. | No new schema change. | Intent, RRF, and repository-boundary tests. | P1 |
| Lexical ranking | GIN index exists for `rag_memory`; runtime lexical query uses `ilike`. | GIN index is not used for ranking. | PostgreSQL full-text query helpers with ts_rank. | Add matching indexes for source chunks. | Query SQL/source tests and ranking fixtures. | P1 |
| Reranking and confidence | Phase 4 adds deterministic reranking over RRF, quality, recency, and citation signals plus categorical confidence decisions. | Cross-encoder reranking remains deferred until eval baselines exist. | `src/rag/retrieval/rerank.ts` integrated into the controller. | None expected. | Rerank ordering, high-risk clarification, missing-citation refinement, and controller confidence tests. | P1 |
| Context packing | Phase 5 adds a pure context packer with hard token budget, dedupe, source diversity, citation labels, lost-in-the-middle-aware ordering, and untrusted evidence separation. | Parent-child expansion and adjacent chunk inclusion need source-chunk repository wiring. | `src/rag/context-pack.ts`. | None expected. | Budget, dedupe, citation, untrusted evidence, and source diversity tests. | P1 |
| Grounded answer generation | Phase 6 adds Zod-validated grounded answer/citation structures, deterministic context-only drafting, safe refusal, and structural/lexical citation verification. | Provider generation and one-shot retrieval refinement loop remain later wiring. | `src/rag/generation/grounded-answer.ts`. | None expected. | Valid citation, fake citation, support, and empty-context refusal tests. | P1 |
| Query routing/refinement | Phase 7 adds deterministic route classification, safe query normalization, identifier preservation, acronym expansion, bounded subqueries, safe query hashes, and bounded refinement metadata. | Controller refinement execution remains later wiring. | `src/rag/query-routing.ts`. | None expected. | Route, rewrite, acronym, hash, subquery, and bounded refinement tests. | P1 |
| RAG cache policy | Phase 8 adds typed RAG cache keys, schema-versioned envelopes, safe query/filter hashes, embedding/reranker/corpus isolation, TTL policy, and per-user invalidation prefixes. | Redis stampede protection and cache-aside runtime wiring remain later integration. | `src/rag/rag-cache.ts`. | None expected. | Key privacy, envelope, TTL, and invalidation-prefix tests. | P2 |
| RAG observability | Phase 9 adds redacted RAG stage event schemas, hashed user trace metadata, low-cardinality metrics, citation failure/refusal counters, and Winston trace logging without raw evidence text. | OpenTelemetry exporter/Grafana dashboard wiring remains deployment work. | `src/rag/observability.ts`. | None expected. | User hashing and metric emission tests. | P1 |
| Golden eval harness | Phase 10 adds a fixture-based RAG eval harness with Recall@k, Precision@k, MRR, citation precision/completeness, refusal rates, latency summary, thresholds, versions, and failed fixture reporting. | Larger golden dataset coverage should grow as source repositories and E2E follow-up are wired. | `src/evals/rag-golden-eval.ts`. | None expected. | Metric calculation and failed-fixture tests. | P1 |
| Graph RAG readiness | Phase 11 adds PostgreSQL-first source claims, claim sources, contradiction claims, chunk-concept links, and bounded traversal-plan helpers. | No graph database, entity extraction, community detection, graph embeddings, or large graph infra added. | `src/rag/graph-compat.ts` plus Drizzle relationship schema. | Adds Graph RAG-compatible relationship tables. | Migration generation and traversal-plan tests. | P2 |
| Backfill and rollout safety | Phase 12 adds shadow-mode runtime config, retrieval config versioning, final-answer cache disable switch, mixed embedding-version guard, and checkpointed backfill progress with per-row failure recording. | Production switch-over still requires live shadow eval and monitoring. | `src/rag/rollout-safety.ts`. | Additive migrations already generated for Phase 1 and Phase 11. | Rollout defaults, mixed-version guard, and checkpoint tests. | P1 |

## Delivery Sequence

1. Phase 1: add secure ingestion and deterministic chunking foundations.
2. Phase 2: add server-only embedding wrapper and model/version registry.
3. Phase 3: add the central retrieval controller with scoped lexical/vector retrieval and RRF.
4. Phase 4: add deterministic reranking and confidence gates.
5. Phase 5: add pure context packing with token/evidence budgets.
6. Phase 6: replace canned follow-up answers with grounded generation and citation verification.
7. Phase 7: add deterministic query routing, rewriting, and refinement.
8. Phase 8: add safe RAG cache keys and performance policies.
9. Phase 9: add RAG-specific redacted observability.
10. Phase 10: add golden eval harness coverage.
11. Phase 11: add PostgreSQL-first Graph RAG compatibility surfaces.
12. Phase 12: add migration/backfill/rollout safety checks.

## Safety Notes

- `rag_memory` remains for compact learner events, not raw document archives.
- Source documents and chunks should be normalized separately before retrieval grows further.
- PostgreSQL/pgvector remains authoritative for Phase 1; do not add a graph DB or separate vector DB without measured evidence.
- Every retrieval query must apply authenticated user scope inside the repository/query, not only at caller level.
- Never log raw learner memory, private prompts, full source text, secrets, cookies, or authorization headers.

