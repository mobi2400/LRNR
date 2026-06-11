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

## Chunking Strategy

### Primary chunking rule

The default chunk is **one learning event per row**.

This is the most important design choice in the whole file.

Do not think in terms of article chunks. Think in terms of learner-memory events.

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

---

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
5. run vector search inside the filtered candidate set
6. re-rank by confidence and recency if needed

### Example

When Teaching is preparing today's `langchain-memory` lesson, it should not search the entire learner history.

It should:

- filter to this user
- filter to this topic
- prioritize unresolved misconception-related rows
- consider recent session summaries
- optionally use similarity inside that narrowed set

This keeps retrieval precise, cheap, and less noisy.

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

---

## What This System Must NOT Do

- Must NOT become a generic transcript archive.
- Must NOT duplicate the authority of `user_profile`, `curriculum_state`, or `topic_knowledge_base`.
- Must NOT retrieve memory without metadata narrowing.
- Must NOT trust arbitrary LLM-generated shapes before validation.
- Must NOT skip onboarding seed memory.
- Must NOT re-embed unchanged content casually.
