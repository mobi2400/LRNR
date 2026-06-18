# LRNR - RAG System
> **Load alongside all 4 foundation files before coding the RAG layer.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## System Identity

| Property | Value |
|----------|-------|
| Main files to create | `src/db/rag.ts`, `src/lib/embeddings.ts`, `src/types/rag.types.ts` |
| Backing store | `rag_memory` table in Supabase |
| Vector engine | `pgvector` |
| Embedding dimension | `1536` |
| Primary purpose | Retrieval memory for learner continuity and personalization |
| Secondary purpose | Structured long-term memory for gaps, misconceptions, questions, and session continuity |

---

## Reference-Informed Upgrade

This design intentionally incorporates production RAG lessons from advanced RAG patterns:

- trust engineering over demo-driven retrieval
- ingestion quality before embedding quality
- hash-based deduplication and version tracking
- semantic and hierarchical chunking instead of blind fixed-size chunks
- metadata filtering before vector search
- hybrid lexical plus semantic retrieval
- reciprocal rank fusion for dense and sparse result merging
- reranking before prompt assembly
- confidence gating so the system can say "I do not know"
- permission-aware retrieval inside the retrieval layer
- citation verification before final answer delivery
- query rewriting for ambiguous or underspecified questions
- query routing based on intent and agent need
- different retrieval chunks and synthesis chunks
- context-window expansion around precise hits
- lost-in-the-middle aware context ordering
- RAG evaluation using faithfulness, relevance, latency, and retrieval quality
- learner-history memory for repeated questions and lower latency

Primary reference:

```text
https://mallahyari.github.io/rag-ebook/04_advanced_rag.html
```

Additional project reference:

```text
https://medium.com/@mobasshirkhan9931/why-your-rag-pipeline-will-break-fffa93c827d8
```

If a reference conflicts with LRNR's learner-memory goal, LRNR's product context wins. We are not building generic document QA. We are building retrieval for teaching, evaluation, adaptation, and learner continuity.

---

## Trust Engineering Principle

The core production question is not:

```text
Can LRNR return an answer?
```

The real question is:

```text
Can LRNR prove the answer from allowed, fresh, relevant evidence?
```

This changes the whole RAG design.

Every retrieval path should produce:

- scoped evidence
- provenance
- confidence signals
- freshness signals
- permission checks
- enough trace data to debug failures

If the system cannot produce reliable evidence, it should refuse, ask a clarifying question, or escalate to a safer path instead of generating a fluent guess.

---

## What This System Is

The RAG layer is the system's **retrieval memory**, not the total source of truth for the product.

It exists so later agents can remember:

- what the learner said during onboarding
- what the learner has already been taught
- what the learner misunderstood
- what questions the learner keeps asking
- what concepts were confirmed as strong
- how contradictions were explained and resolved
- what kind of explanations worked well before

It does **not** replace:

- `user_profile` for authoritative learner state
- `curriculum_state` for authoritative curriculum state
- `topic_knowledge_base` for authoritative researched topic knowledge

The RAG should make the system more personal, more cumulative, and less repetitive. It should not become a dumping ground for arbitrary text.

---

## The Core Rule

Store **meaningful learning events**, not raw transcripts and not generic blobs.

Bad entry:

```text
User and AI discussed LangChain memory.
```

Good entry:

```text
During evaluation on Day 5, the user explained LangChain memory as chat history storage only and did not mention retrieval, state boundaries, or orchestration implications. Classified as misconception: surface view of memory abstraction.
```

Every entry should help a future agent answer one of these questions:

- what does this learner already understand
- what remains unstable
- what has already been explained
- what future teaching should reinforce
- what future evaluation should probe

---

## RAG Philosophy

This is not a standard document-search RAG.

It is a **learner-memory RAG**.

That changes the entire design:

- the main unit is not a document chunk
- the main unit is a learning event
- retrieval should be narrow and metadata-aware
- the system should usually retrieve summaries and structured findings, not long raw transcripts

The default question is not:

```text
What document is semantically similar?
```

The real question is:

```text
What prior learner memory is relevant to this exact teaching or evaluation decision?
```

---

## What Gets Stored

The `rag_memory` table should only contain events with future retrieval value.

### Approved event types

- `onboarding_response`
- `session_summary`
- `question_asked`
- `evaluation_response`
- `gap_detected`
- `misconception_detected`
- `misconception_corrected`
- `concept_mastered`
- `contradiction_resolved`
- `layer3_injection`

### What should usually NOT be stored

- full raw Telegram lesson text
- every small follow-up acknowledgment
- full scraped article bodies
- temporary queue state
- generic logs
- data already fully owned by `topic_knowledge_base`

### What may be stored carefully

- short fragments of conversation only when they reveal something important
- a compact representation of a user's question if it exposed a real gap
- a short contradiction resolution note if future retrieval would benefit from it

---

## Embedding Strategy

### Embedding model contract

Use a single vector shape across the system:

- dimension: `1536`
- provider-compatible with the chosen embedding model family

If the embedding provider changes later, do one of these deliberately:

1. re-embed all stored RAG memory
2. version the embedding space and keep retrieval isolated by version

Do not silently mix incompatible vectors in the same retrieval path.

### Canonical content before embedding

Before generating embeddings, normalize every event into a consistent text format.

Recommended canonical format:

```text
Event Type: misconception_detected
Topic: langchain
Concept: chains
Day Number: 4
Source Agent: evaluation_node
Confidence: 0.91
Content: User described chains as simple function composition and omitted prompt templates, model calls, and failure boundaries.
```

Why this helps:

- produces more stable vector behavior
- reduces semantic noise
- preserves key dimensions inside the embedding text itself
- makes future re-embedding deterministic

### Re-embedding rule

Re-embed only when:

- content changes materially
- canonical formatting rules change materially
- embedding model changes
- required metadata was promoted into the canonical content representation

Do not re-embed unchanged rows casually.

---

## Ingestion and Index Quality

RAG quality starts before embedding.

Nothing should enter an index until it passes ingestion controls.

For learner-memory events:

- validate event type
- normalize canonical content
- attach topic/concept metadata
- attach source agent
- deduplicate retries
- preserve idempotency key
- store embedding version

For future document/source ingestion:

- normalize file format
- extract clean text
- deduplicate by content hash
- preserve source URI
- preserve document version
- enrich metadata before embedding
- split by semantic boundaries
- keep parent-child relationships between chunks
- track effective dates when available
- mark obsolete or superseded content

Required ingestion fields for source-backed content:

```text
source_id
source_uri
source_type
document_hash
document_version
parent_document_id
chunk_hash
chunk_ordinal
effective_at
superseded_by_id
metadata_quality_score
```

Bad ingestion creates hallucination fuel. Clean ingestion is the first hallucination defense.

---

## Chunking Strategy

### Primary chunking rule

The default chunk is **one learning event per row**.

This is the most important design choice in the whole file.

Do not think in terms of article chunks. Think in terms of learner-memory events.

### Retrieval chunk vs synthesis chunk

The row used for retrieval does not always need to be the exact text passed to the LLM.

LRNR should support two representations:

```text
retrieval_text:
  compact, normalized, metadata-rich text used for embedding and search

synthesis_text:
  clean, human-readable evidence used in the final prompt context
```

Example:

```text
retrieval_text:
Event Type: misconception_detected
Topic: rag
Concept: chunking
Learner Issue: thinks larger chunks are always better
Evidence: ignored precision, recall, latency, and lost-in-the-middle tradeoffs

synthesis_text:
The learner previously assumed larger chunks always improve RAG. When teaching chunking, explicitly contrast context richness with retrieval precision, latency, and middle-position attention loss.
```

Why:

- retrieval text should be optimized for matching
- synthesis text should be optimized for explanation
- some events need compact embeddings but richer prompt evidence
- noisy raw text should not pollute embeddings

### Context window expansion

For normal learner events, one row is enough.

For long source-backed content later, LRNR should support a sentence or paragraph window:

```text
retrieve precise hit
expand to nearby source context
pass expanded context to synthesis
```

Use this only for `topic_knowledge_base`, source claims, article excerpts, or handbook-like content. Do not apply it blindly to learner memory rows, because learner events are already summary-shaped.

### Event chunk sizes by source

#### 1. Onboarding conversation

Store one row per meaningful learner answer.

Do not store one giant transcript blob.

Store separate rows for:

- goal and motivation
- prior attempts
- self-assessment
- probing answers that reveal real depth
- misconceptions discovered during probing

Why:

- better retrieval precision
- easier concept tagging
- easier misconception extraction
- lower prompt noise later

#### 2. Daily lesson delivery

Do not store all 5-7 Telegram messages as separate RAG entries by default.

Store:

- one session summary row
- optional extra row only if something meaningful happened during that session interaction

This keeps RAG compact and useful.

#### 3. Evaluation

Evaluation is the richest source of memory and should be chunked more finely.

Store separately:

- meaningful user answers
- gap findings
- misconception findings
- mastery confirmations

Not every turn deserves a row. Every meaningful signal does.

#### 4. Contradiction resolution

Store one compact resolved contradiction record that captures:

- what the conflict was
- which context lens explained it
- the final teaching interpretation
- whether it affects present or future learning

#### 5. Layer 3 injections

Store only the final surfaced form if it matters for future teaching continuity.

Do not fill RAG with every low-value news hint.

---

## Metadata Schema

Every RAG row should be both semantically searchable and deterministically filterable.

### Required metadata

```ts
interface RAGMemoryEntry {
  id: string;
  userId: string;
  content: string;
  embedding: number[];
  eventType:
    | 'session_summary'
    | 'misconception_detected'
    | 'misconception_corrected'
    | 'concept_mastered'
    | 'gap_detected'
    | 'question_asked'
    | 'evaluation_response'
    | 'contradiction_resolved'
    | 'onboarding_response'
    | 'layer3_injection';
  topic: string | null;
  topicId: string | null;
  concept: string | null;
  dayNumber: number | null;
  sourceAgent: string;
  confidence: number;
  isResolved: boolean;
  createdAt: string;
}
```

### Why each field matters

- `userId` enforces learner isolation
- `eventType` allows event-class filtering
- `topic` and `topicId` prevent cross-topic contamination
- `concept` enables precision reinforcement
- `dayNumber` supports chronological context
- `sourceAgent` preserves provenance
- `confidence` supports ranking and thresholding
- `isResolved` prevents stale unresolved signals from lingering forever

### Optional future metadata

Only add later if real use justifies it:

- `retrievalCount`
- `lastRetrievedAt`
- `importanceScore`
- `embeddingVersion`
- `expiresAt`
- `retrievalText`
- `synthesisText`
- `sourceId`
- `sourceUri`
- `parentDocumentId`
- `chunkOrdinal`
- `tokenCount`
- `retrievalPolicy`
- `freshnessAt`
- `stalenessReason`
- `lexicalSearchText`
- `lastEvaluatedAt`
- `qualityScore`

---

## Retrieval Controller

Do not let every agent invent retrieval differently.

Create one retrieval controller that receives:

```ts
interface RAGRetrievalRequest {
  userId: string;
  topicId?: string;
  conceptIds?: string[];
  agent:
    | 'architect'
    | 'curriculum_builder'
    | 'teaching'
    | 'evaluation'
    | 'contradiction'
    | 'news_intelligence';
  intent:
    | 'teach'
    | 'evaluate'
    | 'diagnose_gap'
    | 'resolve_contradiction'
    | 'summarize_history'
    | 'connect_news'
    | 'answer_repeated_question';
  query?: string;
  filters?: RAGFilters;
  limit?: number;
}
```

The controller decides:

- whether semantic search is needed
- whether lexical search is needed
- whether query rewriting is allowed
- whether to use learner-history cache
- whether to include unresolved memories only
- whether to retrieve summaries first, then detailed rows
- how to order the final context pack

This keeps RAG behavior consistent, testable, and observable.

---

## Retrieval Modes

LRNR should support multiple retrieval modes. The mode is selected by the retrieval controller, not by random agent code.

| Mode | Use when | Method |
|------|----------|--------|
| Metadata-first | Agent knows topic, concept, event type, or unresolved state | SQL filters first, optional vector search second |
| Semantic memory | Query wording is fuzzy or conceptual | pgvector similarity inside scoped candidates |
| Lexical memory | Exact terms, acronyms, package names, error names, or quotes matter | Postgres full-text search or trigram search |
| Hybrid memory | Both meaning and exact wording matter | lexical + vector, merge with reciprocal rank fusion |
| Hierarchical memory | Need broad session/history first, then specific events | summary rows first, then linked event rows |
| Repeated-question memory | Similar question was answered before | query-answer memory lookup before full RAG |
| Graph-enhanced memory | Prerequisites or concept relationships matter | relational graph traversal + filtered RAG |

---

## Permission-Aware Retrieval

Access control must live inside retrieval, not only around the UI.

Every retrieval query must include:

```text
user_id
tenant_id when available
allowed_roles or allowed_scopes when available
topic/concept filters when available
```

Forbidden:

- retrieving first and filtering permissions after
- trusting the frontend to hide unauthorized results
- letting vector search cross user or tenant boundaries
- returning source citations the user is not allowed to inspect

Required retrieval order:

```text
1. authorize user
2. build permission filters
3. apply permission filters inside SQL/vector/BM25 query
4. retrieve candidates
5. rerank candidates
6. assemble context pack
```

This protects the product from AI-shaped data leaks.

### Hybrid retrieval rule

Hybrid retrieval should be the default for production-grade question answering, but not for every internal agent call.

Use hybrid retrieval when:

- user asks a direct question
- exact terms may matter
- source names, libraries, versions, or acronyms are involved
- semantic-only retrieval produces vague results

Avoid hybrid retrieval when:

- deterministic filters already answer the need
- the agent only needs unresolved misconceptions
- the query is a narrow database lookup

Recommended merge:

```text
1. run metadata filters
2. retrieve lexical candidates
3. retrieve vector candidates
4. deduplicate by row id
5. merge using reciprocal rank fusion
6. boost by confidence, freshness, and unresolved status
7. cap final context
```

Why reciprocal rank fusion:

- it combines dense and sparse retrieval without fragile score-weight tuning
- it handles exact-term and semantic matches together
- it is simple enough to test and explain
- it improves reliability without requiring a larger LLM

### Reranking rule

Retrieval should usually fetch more candidates than the prompt will use.

Recommended production pattern:

```text
hybrid retrieval fetches top 20-30 candidates
cross-encoder reranker scores query-document pairs
confidence gate checks the best evidence
context pack keeps top 5-10 items
LLM sees curated evidence only
```

Reranking is especially important when:

- the corpus is large
- ANN search is approximate
- many candidates are semantically similar
- exact wording and true relevance differ
- only a few evidence items can fit in the prompt

Do not rerank the whole database. Rerank only the candidate pool.

### Confidence gate rule

The system must be able to say:

```text
I do not have enough reliable evidence to answer that.
```

Confidence gate inputs:

- top reranker score
- score gap between first and second result
- source freshness
- permission validity
- contradiction status
- retrieval coverage
- agent risk level

Example policy:

```text
if top_score < threshold:
  refuse or ask clarifying question

if evidence is stale:
  warn or refresh retrieval

if sources conflict:
  route to Contradiction Agent
```

The threshold should be stricter for high-risk answers and looser for low-risk personalization hints.

### Query rewriting rule

Query rewriting is allowed only before retrieval, never after final evidence is selected.

Allowed rewrites:

- expand synonyms
- clarify vague user wording
- generate two or three sub-queries for complex requests
- map user language to known concepts
- infer safe metadata filters from the query

Forbidden rewrites:

- adding facts not implied by the user query
- rewriting a query so strongly that the original intent changes
- hiding uncertainty about inferred filters

Every rewritten query should be logged with:

```text
original_query
rewritten_queries
inferred_filters
rewrite_reason
```

### Query routing rule

The router should classify each request before retrieval.

Example routes:

```text
fact_lookup -> metadata + hybrid retrieval
lesson_personalization -> unresolved learner-memory retrieval
evaluation_design -> recent session + weak concept retrieval
contradiction_resolution -> claim/source retrieval + contradiction history
curriculum_planning -> concept graph + mastery + unresolved gaps
news_connection -> curriculum_state + concept overlap + sparse RAG
```

Start with rule-based routing. Add LLM-based routing only after we have enough logged examples to evaluate it.

## RAG Write Rules

### Rule 1: Write only semantically meaningful events

Every write should answer:

```text
Will retrieving this later help a future teaching, evaluation, or adaptation decision?
```

If the answer is no, it probably should not be in RAG.

### Rule 2: Do not write duplicates

Examples of duplicate patterns to avoid:

- writing the same session summary twice because delivery retried
- writing the same misconception on every follow-up
- writing both raw answer and paraphrased answer when only one is needed

### Rule 3: Resolution updates must be idempotent

When a misconception is corrected, marking it resolved multiple times should be safe.

### Rule 4: Prefer structured helper functions

Recommended API shape:

```ts
writeToRAG(entry)
writeManyToRAG(entries)
queryRAG(userId, filters)
semanticQueryRAG(userId, query, filters)
seedRAGFromConversation(userId, turns, topic)
resolveRAGMisconception(userId, misconceptionId)
markRAGEntryResolved(userId, entryId)
```

---

## Retrieval Patterns By Agent

The most important retrieval rule is:

**Agents should retrieve a narrow, metadata-filtered slice of memory first, and only then apply semantic similarity if needed.**

### Architect Agent

Purpose:

- understand prior learning journey during roadmap re-evaluation
- see repeated gaps and growth patterns

Pattern:

```ts
queryRAG(userId, {
  eventTypes: ['session_summary', 'gap_detected', 'misconception_detected', 'concept_mastered'],
  limit: 20,
});
```

Architect retrieval should be broad across the learner's history, but still filtered by useful event classes.

### Curriculum Builder

Purpose:

- plan around unresolved gaps
- avoid repeating what is already stable
- schedule reinforcement intelligently

Pattern:

```ts
queryRAG(userId, {
  topic: currentTopic,
  eventTypes: ['misconception_detected', 'gap_detected', 'onboarding_response'],
  isResolved: false,
  limit: 20,
});
```

Curriculum Builder should usually rely more on deterministic filtering than on free semantic search.

### Teaching Agent

Purpose:

- personalize explanations
- recall unstable concepts
- connect to recent sessions

Pattern:

```ts
queryRAG(userId, {
  topic: currentTopic,
  eventTypes: ['session_summary', 'misconception_detected', 'concept_mastered', 'gap_detected'],
  limit: 15,
});
```

Teaching should use RAG to understand **what kind of explanation is needed now**, not to retrieve giant old content dumps.

### Evaluation Agent

Purpose:

- see what has already been taught
- probe known weak spots
- avoid testing only easy angles repeatedly

Pattern:

```ts
queryRAG(userId, {
  topic: currentTopic,
  eventTypes: ['session_summary', 'misconception_detected', 'gap_detected'],
  limit: 25,
});
```

Evaluation should heavily use unresolved misconception memory and recent session context.

### Contradiction Agent

Purpose:

- see whether a similar contradiction already happened
- reuse prior resolution patterns if useful

Pattern:

```ts
queryRAG(userId, {
  topic: currentTopic,
  eventTypes: ['contradiction_resolved'],
  concept: relatedConcept,
  limit: 10,
});
```

### News Intelligence Agent

Purpose:

- understand if a news item overlaps with the learner's recent cognitive focus

Pattern:

Use sparingly. News Intelligence should mostly rely on `user_profile` and `curriculum_state`.

Only consult RAG when it materially improves:

- interest continuity
- repetition avoidance
- connection strength to recent learning

---

## Retrieval Ranking Logic

Vector similarity alone is not enough.

Recommended ranking pipeline:

1. filter by `userId`
2. filter by topic where relevant
3. filter by `eventType`
4. filter by `isResolved` where relevant
5. infer safe metadata filters when the query contains clear topic/concept/time signals
6. run vector and/or lexical search inside the filtered candidate set
7. merge candidates when hybrid search is used
8. re-rank by confidence, recency, freshness, and unresolved status if needed
9. reorder long context packs to reduce lost-in-the-middle risk
10. return a compact context pack with provenance

### Example

When Teaching is preparing today's `langchain-memory` lesson, it should not search the entire learner history.

It should:

- filter to this user
- filter to this topic
- prioritize unresolved misconception-related rows
- consider recent session summaries
- optionally use similarity inside that narrowed set

This keeps retrieval precise, cheap, and less noisy.

### Lost-in-the-middle ordering

When more than six context items are passed into a prompt, do not place all important evidence in the middle.

Recommended ordering:

```text
1. most important evidence
2. second most important evidence
3. supporting evidence
4. lower priority context
5. supporting evidence
6. third most important evidence
```

The highest-value evidence should appear near the beginning or end of the prompt context. This matters because long-context models can still under-use middle content.

### Context pack contract

Retrieval should return a structured context pack, not a loose array of strings.

```ts
interface RAGContextPack {
  requestId: string;
  userId: string;
  agent: RAGRetrievalRequest['agent'];
  mode: 'metadata' | 'semantic' | 'lexical' | 'hybrid' | 'hierarchical' | 'graph_enhanced';
  rewrittenQueries: string[];
  inferredFilters: RAGFilters;
  items: Array<{
    id: string;
    eventType: RAGMemoryEntry['eventType'];
    concept: string | null;
    content: string;
    sourceAgent: string;
    score: number;
    rankingSignals: {
      vectorScore?: number;
      lexicalScore?: number;
      confidence?: number;
      recency?: number;
      freshness?: number;
      unresolvedBoost?: number;
    };
  }>;
}
```

### Citation verification

When the answer makes a factual claim from retrieved context, the system should verify that the claim is supported by at least one context item.

Required for:

- source-backed factual answers
- contradiction resolutions
- research summaries
- tool/version explanations
- compliance-like or high-confidence statements

Not required for:

- purely motivational teaching language
- learner preference reminders
- low-risk UX copy

Citation verification should check:

- every cited source exists in the context pack
- cited source is permitted for the user
- answer does not cite irrelevant context
- generated claim does not exceed what the source says
- stale or superseded sources are labeled or excluded

If citation verification fails, the answer should be regenerated with stricter instructions, refused, or routed to a safer workflow.

---

## Hierarchical Retrieval

LRNR should not always search thousands of small memory rows directly.

For large histories, use a two-stage path:

```text
Stage 1:
  retrieve relevant summaries

Stage 2:
  retrieve detailed events linked to those summaries
```

Recommended summary rows:

- daily session summary
- weekly learning summary
- topic progress summary
- concept weakness summary
- contradiction summary
- source/document summary for external knowledge

This gives LRNR the benefit of document-summary retrieval while preserving learner-memory precision.

Use hierarchical retrieval when:

- the learner has a long history
- the agent needs broad context before details
- a direct top-k vector search returns scattered rows
- the query is about progress over time

---

## Learner-History Cache

Repeated questions should not always trigger full embedding, retrieval, and generation.

Add a safe cache layer for repeated or near-repeated questions:

```text
user_id
normalized_question
question_embedding
answer_summary
source_context_ids
created_at
expires_at
answer_version
```

Use it only when:

- the prior answer is still fresh
- source context has not changed
- the question is semantically very close
- the cached answer has provenance

Do not use it when:

- the user asks for the latest information
- the underlying topic knowledge changed
- the prior answer had low confidence
- the question is evaluative and needs a fresh probe

This improves latency and cost without making RAG stale.

---

## Onboarding Seed Strategy

The RAG should not begin empty.

The onboarding conversation from Architect is the first seed.

### What should be written from onboarding

- stated motivation
- concrete goal
- self-reported background
- answers to probing questions
- confirmed strengths
- identified weak areas
- detected misconceptions
- prior failed attempts

### Recommended helper

```ts
async function seedRAGFromConversation(
  userId: string,
  turns: ConversationTurn[],
  topic: string
): Promise<void>
```

### Behavior

1. normalize each meaningful turn
2. infer concept tags where possible
3. batch-embed them
4. write rows as `onboarding_response`
5. separately write gap and misconception rows when those were explicitly identified

### Why it matters

Without onboarding seed memory:

- early lessons are generic
- early evaluation has shallow context
- curriculum personalization starts too late

With onboarding seed memory:

- the system has meaningful learner context from Day 1

---

## Prompt Context Rules

RAG is only useful if prompt context remains disciplined.

### Teaching prompts should use RAG for

- unresolved misconceptions
- strongest relevant recent session summaries
- explanation preferences or prior patterns if explicitly tracked

### Evaluation prompts should use RAG for

- what was covered
- what has been unstable
- what has not yet been stress-tested

### Architect re-evaluation prompts should use RAG for

- progress history
- repeated weak patterns
- long-term drift in goals or strengths

### What prompts should NOT do

- paste 20 raw memory entries blindly
- use memory without metadata scoping
- flood the LLM with long full transcripts unless absolutely necessary

---

## `src/db/rag.ts` Responsibilities

This module should own:

- writes to `rag_memory`
- filtered queries
- semantic queries
- resolve operations
- onboarding seed batch writes
- row normalization before persistence

This module should **not** own:

- direct prompt construction
- curriculum logic
- Telegram logic

---

## `src/lib/embeddings.ts` Responsibilities

This module should own:

- embedding generation
- batching
- retry logic
- provider abstraction
- vector shape validation
- optional embedding cache if introduced later

Agents should never call the embedding provider directly.

---

## Performance Rules

RAG can quietly become expensive and noisy if not controlled.

### Efficiency rules

- batch embeddings
- skip unchanged content
- filter before vector search
- prefer one summary row over many redundant rows
- keep canonical content compact and meaningful

### Cost-awareness rules

- do not write rows that will never be retrieved
- do not retrieve 30 entries when 6 precise ones are enough
- do not embed huge raw transcripts unless the product specifically needs that

### Query-awareness rules

Add logging for:

- query latency
- number of candidates searched
- number of rows returned
- embedding batch sizes
- retrieval mode
- rewritten query count
- inferred metadata filters
- lexical candidates
- vector candidates
- final context token count
- empty-result rate
- cache hit/miss

---

## RAG Observability

RAG needs observability because most failures are silent.

A broken RAG pipeline may still return:

- a fluent answer
- normal HTTP status
- acceptable latency
- plausible citations

So the system must trace the retrieval path itself.

Reference:

```text
https://mallahyari.github.io/rag-ebook/05_observability_tools.html
```

The useful lesson from the reference is not that LRNR must use one specific vendor. The useful lesson is that RAG needs visibility into prompts, retrieved context, indexing, querying, model calls, latency, token count, and evaluation traces.

### Preferred tool posture

Use open-source-first observability where possible.

Recommended stack:

| Layer | Tool | Purpose |
|------|------|---------|
| Application logs | Pino | structured request/job logs |
| Distributed traces | OpenTelemetry | trace API -> retrieval -> rerank -> LLM -> verification |
| Metrics | Prometheus | numeric backend and RAG metrics |
| Dashboards | Grafana | operational visibility |
| LLM/RAG traces | Phoenix or Langfuse | inspect prompts, retrieved chunks, spans, token usage |
| Evaluation experiments | RAGAS-style scripts or Phoenix evals | faithfulness, relevance, retrieval quality |

Optional later:

- Weights & Biases for experiment tracking and dataset/model comparison
- HoneyHive for managed prompt/eval workflows if the product needs it

Do not add a paid observability platform before we know what pain it solves.

### Required RAG trace spans

Every RAG request should create a trace with these spans:

```text
rag.request
  rag.route_intent
  rag.query_rewrite
  rag.permission_filter
  rag.lexical_retrieval
  rag.vector_retrieval
  rag.rank_fusion
  rag.rerank
  rag.confidence_gate
  rag.context_pack_build
  llm.generate
  rag.citation_verify
  rag.evaluation_log
```

Not every span runs every time. For example, metadata-only retrieval may skip lexical retrieval, vector retrieval, reranking, and citation verification.

### What each trace must capture

Capture safe metadata:

- request id
- user id hash, not raw user identity in external tools
- agent name
- retrieval mode
- query intent
- original query hash
- rewritten query count
- inferred filters
- candidate counts by retrieval mode
- final context item count
- final context token count
- reranker top score
- confidence threshold
- confidence gate decision
- citation verification result
- cache hit/miss
- per-stage latency
- provider/model names
- token usage
- error code if failed

Do not send raw private learner memory, raw transcripts, secrets, or sensitive source text to third-party observability tools unless explicitly approved.

### RAG dashboards

Minimum dashboards:

- retrieval latency p50/p95/p99
- reranker latency p50/p95/p99
- generation latency p50/p95/p99
- citation verification latency
- empty retrieval rate
- confidence refusal rate
- citation verification failure rate
- top-k average relevance score
- cache hit ratio
- token cost per RAG answer
- retrieval mode distribution
- query rewrite usage
- permission-filter failure count
- stale-context usage count

### RAG alerts

Alert when:

- citation verification failure rate spikes
- confidence refusal rate spikes or drops unexpectedly
- empty retrieval rate spikes
- retrieval latency breaches product target
- reranker latency breaches product target
- permission-filter failure count is greater than zero
- RAG cost per answer grows unexpectedly
- retrieval mode distribution changes suddenly after deployment

### Trace-based debugging questions

When an answer is bad, the trace should let us answer:

- did ingestion store the right content?
- did metadata filters remove the right candidates?
- did lexical retrieval find exact terms?
- did vector retrieval find semantic matches?
- did rank fusion combine candidates correctly?
- did reranking promote the right evidence?
- did the confidence gate allow weak evidence?
- did the prompt include the evidence in a useful order?
- did citation verification catch unsupported claims?
- did stale or unauthorized context enter the answer?

If we cannot answer these questions from traces, the RAG system is not observable enough.

---

## RAG Evaluation

RAG must be evaluated as a system, not trusted because the answer "looks good."

Track these quality dimensions:

| Dimension | Meaning |
|----------|---------|
| Retrieval precision | Did returned memories actually matter? |
| Retrieval recall | Did retrieval miss known relevant memory? |
| Faithfulness | Is the generated answer supported by retrieved context? |
| Relevance | Did the answer address the current teaching/evaluation need? |
| Freshness | Was stale memory avoided or marked correctly? |
| Latency | Did retrieval complete inside product targets? |
| Cost | Did the query use a reasonable number of tokens/provider calls? |
| Hallucination rate | How often did the answer include unsupported claims? |
| Permission safety | Did retrieval avoid unauthorized context? |
| Citation accuracy | Did cited evidence actually support the generated claim? |

Recommended evaluation tools:

- golden dataset of question-answer-source triples
- trace-based regression tests
- RAGAS-style faithfulness and answer relevance checks
- manual expert review for high-risk examples
- production feedback signals from user behavior

Evaluation dataset:

- curated onboarding examples
- known misconception examples
- repeated question examples
- ambiguous query examples
- exact-term examples
- long-history examples
- stale-memory examples
- contradiction examples
- permission-boundary examples
- citation-verification examples
- no-answer examples where refusal is correct

Every retrieval change should be tested against this dataset before becoming default.

Minimum offline tests:

- metadata-only vs semantic-only vs hybrid retrieval
- chunk size or event granularity changes
- query rewriting on/off
- lost-in-the-middle reordering on/off
- learner-history cache hit/miss behavior
- reranking on/off
- confidence threshold changes
- citation verification pass/fail cases
- permission-filter enforcement cases

Minimum online signals:

- user clicked "helpful"
- user asked a clarification immediately after answer
- evaluation score improved after retrieval-assisted teaching
- agent marked context as insufficient
- contradiction agent found unsupported answer
- confidence gate refusal rate
- citation verification failure rate
- per-stage latency for retrieval, reranking, generation, and verification

---

## Freshness and Staleness Control

RAG failure often comes from old memory being treated as current truth.

Every row that can become outdated should have one of:

- `expiresAt`
- `freshnessAt`
- `supersededById`
- `isResolved`
- `stalenessReason`

Examples:

```text
misconception_detected -> can become resolved
news-based injection -> can expire
tool/version explanation -> can become outdated
learner preference -> can change
```

Retrieval should prefer:

- unresolved but current gaps
- recent session summaries
- high-confidence stable mastery
- source-backed current claims

Retrieval should downrank:

- resolved misconceptions unless reviewing growth
- expired news items
- old low-confidence rows
- rows superseded by newer evidence

---

## Error Scenarios and Handling

| Scenario | Handling |
|---------|----------|
| Embedding provider fails | Retry with backoff. If still failing, log and continue only if the write is non-critical. |
| Partial batch embed failure | Retry failed items only. |
| Query returns nothing | Continue gracefully. RAG absence must not crash Teaching or Evaluation. |
| Misconception resolve called twice | Operation must be idempotent. |
| Invalid event type | Reject at validation boundary. |
| Topic missing on topic-scoped write | Throw validation error unless cross-topic event is intentional. |
| Duplicate session summary write | Reject or no-op using idempotency checks. |
| Query rewrite returns unsafe filters | Ignore inferred filters and fall back to explicit metadata only. |
| Hybrid retrieval returns conflicting candidates | Keep both only if provenance is clear, then ask Contradiction Agent if needed. |
| Cached answer is stale | Bypass cache, refresh retrieval, and update cache after successful answer. |
| Context pack too large | Reduce by score, concept diversity, and lost-in-the-middle ordering. |
| Reranker scores are below threshold | Refuse, ask a clarifying question, or fall back to safer retrieval. |
| Retrieval finds unauthorized context | Treat as security bug, drop result, log incident, and fail closed. |
| Citation verification fails | Regenerate with stricter evidence rules or refuse the answer. |

---

## Testing This System

Priority tests:

- one meaningful onboarding turn becomes one RAG row
- unresolved misconception filters work
- topic/event filtering happens before similarity ranking
- duplicate resolve operations are safe
- empty retrieval does not crash Teaching or Evaluation
- session summary writes are idempotent
- canonical content formatting is stable
- hybrid retrieval beats semantic-only on exact-term cases
- query rewriting improves ambiguous query retrieval without changing intent
- query routing selects the correct retrieval mode for each agent
- learner-history cache refuses stale answers
- lost-in-the-middle ordering preserves top evidence near prompt edges
- RAG evaluation dataset runs before retrieval defaults change
- confidence gate refuses weak-evidence answers
- permission filters are applied before vector and lexical retrieval
- citation verifier catches unsupported generated claims

---

## What This System Must NOT Do

- Must NOT become a generic transcript archive.
- Must NOT duplicate the authority of `user_profile`, `curriculum_state`, or `topic_knowledge_base`.
- Must NOT retrieve memory without metadata narrowing.
- Must NOT trust arbitrary LLM-generated shapes before validation.
- Must NOT skip onboarding seed memory.
- Must NOT re-embed unchanged content casually.
- Must NOT treat cached answers as source of truth.
- Must NOT allow query rewriting to invent intent.
- Must NOT pass large context packs without ordering and token budgeting.
- Must NOT answer when evidence is below the confidence threshold.
- Must NOT retrieve unauthorized context and hope later layers remove it.
- Must NOT present citations that do not directly support the answer.
