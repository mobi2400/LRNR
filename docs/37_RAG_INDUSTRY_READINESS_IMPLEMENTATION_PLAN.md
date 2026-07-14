# LRNR RAG Industry Readiness Implementation Plan

> Phase 0 baseline created before runtime changes. This document tracks the RAG hardening sequence from the July 2026 readiness instructions and should be updated when implementation reality changes.

## Baseline Status

- Git status before Phase 0 changes: clean tracked tree, with unrelated untracked `pnpm-workspace.yaml` left untouched.
- Baseline verification: `npm run typecheck` passed.
- Code graph discovery was attempted first. The graph is currently sparse for newer RAG code, so targeted file reads were used for exact repository/schema details.
- Current learner-memory RAG centers on `rag_memory` in `src/db/schema/knowledge.schema.ts` and `src/db/rag.repo.ts`.
- Current source knowledge is stored mostly as JSON in `topic_knowledge_base`; normalized `source_documents` and `source_chunks` tables are not present yet.

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
| Secure source ingestion | No dedicated ingestion pipeline. | URL/network/content controls, parsing, normalization, dedupe, prompt-injection handling absent. | `src/rag/ingestion/*` service plus repository writes. | Add normalized source document/chunk tables. | URL policy, content limits, parser, dedupe, and injection-neutralization tests. | P1 |
| Citation-preserving chunks | `rag_memory` has chunk-ish fields but no source chunk table. | Source boundaries, anchors, heading paths, and chunk strategy metadata are missing. | Chunker modules for markdown/article/transcript/code/claim inputs. | Add explicit `source_chunks` columns for citation and embedding metadata. | Deterministic chunking and boundary-preservation tests. | P1 |
| Embedding wrapper | Env has `EMBEDDING_API_KEY`; no production wrapper/model registry. | No timeout/retry/version/dimension guard. | `src/server/embeddings/*` server-only provider wrapper and registry. | Store model/version/dimensions on source chunks and memory writes as needed. | Wrapper validation and incompatible-version tests. | P1 |
| Hybrid retrieval controller | Repository has `retrieveContext()` with scoped lexical/vector queries. | No central controller, RRF, rerank, confidence, refinement, or context packing. | `src/rag/retrieval/*` orchestration over repositories. | Likely no immediate schema change beyond source chunk support. | Cross-user isolation, lexical/vector, version isolation, RRF, rerank, confidence tests. | P1 |
| Lexical ranking | GIN index exists for `rag_memory`; runtime lexical query uses `ilike`. | GIN index is not used for ranking. | PostgreSQL full-text query helpers with ts_rank. | Add matching indexes for source chunks. | Query SQL/source tests and ranking fixtures. | P1 |
| Context packing | Not a separate pure module. | Token budget and evidence grouping are not enforced centrally. | `src/rag/context-pack.ts`. | None expected. | Budget, dedupe, citation ordering, and refusal-boundary tests. | P1 |
| Grounded answer generation | Follow-up answer is not full RAG generation. | No claim-level citation verification. | `src/rag/generation/*` using LLM wrappers only. | Store answer/eval traces if needed. | Claim support, unsupported-claim refusal, citation tests. | P1 |
| Query routing/refinement | No deterministic query classifier. | Ambiguous/low-evidence queries do not refine safely. | `src/rag/query-routing.ts` and bounded refinement controller. | None expected. | Classification, rewrite, and no-scope-broadening tests. | P1 |
| RAG cache policy | Generic cache helpers exist. | Retrieval-result cache keys/invalidation not complete. | `src/rag/rag-cache.ts` with safe keys and TTLs. | None expected. | Cache key privacy and invalidation tests. | P2 |
| RAG observability | Some metrics in repository. | Stage-level spans and redacted trace context missing. | `src/rag/observability.ts` wrapper helpers. | Optional trace rows later; avoid raw evidence logs. | Metrics label and redaction tests. | P1 |
| Golden eval harness | Phase 1 eval test exists. | Needs measured retrieval/grounding/citation/refusal checks. | `src/evals/rag-readiness-eval.ts` plus fixtures. | None expected. | Golden dataset pass/fail tests. | P1 |
| Graph RAG readiness | Concept schema exists; full Graph RAG deferred. | Source claims and chunk-concept edges incomplete. | PostgreSQL-first relationship tables; no graph DB. | Add claim/source/chunk relationship tables only when needed. | Relationship integrity tests. | P2 |
| Backfill and rollout safety | Drizzle migrations exist. | Need backward-safe nullable additions and backfill scripts. | `scripts/backfill-rag-*` with dry-run/idempotency. | Migration and indexes. | Dry-run/backfill idempotency tests. | P1 |

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
