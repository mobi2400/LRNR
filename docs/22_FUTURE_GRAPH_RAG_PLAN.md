# LRNR - Future Graph RAG Plan
> **Future plan, not current implementation scope.**
> Keep this file so we remember the Graph RAG direction when the core LRNR slices are stable.

---

## Purpose

LRNR currently plans to use event-based RAG, metadata-filtered retrieval, hybrid retrieval, and prerequisite graph structures.

This file captures the future plan for adding **Graph RAG**.

Graph RAG means retrieval does not only search similar text. It also uses explicit relationships between concepts, sources, claims, sessions, learner mastery, prerequisites, contradictions, and curriculum position.

Simple RAG asks:

```text
Which stored text is semantically similar to this query?
```

Graph RAG asks:

```text
Which connected concepts, claims, memories, sources, and learner states matter for this decision?
```

---

## Why Graph RAG Fits LRNR

LRNR is not just a document QA system. It is a learning system.

Learning has relationships:

- concept A is a prerequisite of concept B
- concept B appears in session 4
- learner is weak on concept A
- source X supports claim Y
- source Z contradicts claim Y
- evaluation detected misconception M
- misconception M affects future session S
- news item N updates concept C

These relationships are difficult to capture with vector similarity alone.

Graph RAG can help LRNR:

- order curriculum more intelligently
- detect missing prerequisites
- retrieve explanation context through concept relationships
- connect live updates to upcoming sessions
- trace claims back to sources
- explain why the system chose a remediation path
- prevent retrieval from being only "similar text nearby"

---

## Current State

Current/planned retrieval:

- event-based learner-memory RAG
- topic-knowledge RAG
- metadata-filtered retrieval
- hybrid vector plus lexical retrieval
- agent-specific context packs
- prerequisite edges for curriculum ordering
- topological sort for concept sequencing

Current/planned graph-like structures:

- concept dependencies
- curriculum layers
- learner mastery per concept
- source and claim provenance
- contradiction records
- session-to-concept mapping

Important:

```text
We are not treating full Graph RAG as Slice 1 scope.
```

Graph RAG should come after the core learning loop and adaptation loop are stable.

---

## Recommended Roadmap

## Phase 1 - Relational Graph Foundations

Use PostgreSQL and pgvector.

Build:

- normal RAG memory table
- pgvector embeddings
- concept table
- concept prerequisite edges
- concept-to-session links
- learner mastery by concept
- source and claim tables
- contradiction records

This gives LRNR graph structure without adding a separate graph database too early.

### Phase 1 Goal

Make the curriculum dependency graph explicit and queryable.

Example:

```text
Before teaching vector database indexing, check whether the learner understands:
- embeddings
- vector similarity
- nearest-neighbor search
- database indexes
```

### Phase 1 Done When

- concepts have stable IDs
- prerequisites are stored as edges
- topological sort can order concepts
- sessions can be mapped to concepts
- learner mastery is tracked per concept
- retrieval can filter by concept and prerequisite state

---

## Phase 2 - Graph-Enhanced Retrieval

Still use PostgreSQL first.

Add retrieval that traverses relational edges before or after vector search.

Example tables:

```text
concepts
concept_prerequisites
concept_claims
claim_sources
learner_concept_mastery
session_concepts
rag_memory_concepts
contradiction_claims
news_item_concepts
```

Example retrieval:

```text
For today's session concept:
1. find its prerequisites
2. find learner weak or unresolved prerequisite concepts
3. find relevant RAG memories for those concepts
4. find source-backed claims for today's concept
5. find active contradictions or updates
6. assemble a context pack
```

### Phase 2 Goal

Make retrieval relationship-aware without introducing unnecessary infrastructure.

### Phase 2 Done When

- Teaching can retrieve prerequisite context automatically
- Evaluation can choose weak connected concepts to probe
- Curriculum Builder can detect blocked concepts
- Scout can connect news to upcoming sessions by concept edge
- Contradiction Agent can trace affected claims and sessions

---

## Phase 3 - Full Graph RAG

Only consider this after Phase 2 proves value.

Full Graph RAG may include:

- entity extraction from sources
- relationship extraction from sources
- claim graph construction
- concept graph enrichment
- community or cluster summaries
- graph traversal plus vector retrieval
- graph-based explanation paths
- optional graph database if PostgreSQL becomes limiting

Possible future graph entities:

```text
User
Topic
Concept
Session
MemoryEvent
Claim
Source
Contradiction
NewsItem
Tool
Agent
```

Possible future relationships:

```text
Concept DEPENDS_ON Concept
Concept APPEARS_IN Session
User HAS_MASTERY Concept
MemoryEvent ABOUT Concept
Claim SUPPORTED_BY Source
Claim CONTRADICTS Claim
NewsItem UPDATES Concept
Agent PRODUCED MemoryEvent
Session TEACHES Concept
Misconception AFFECTS Concept
```

### Phase 3 Goal

Allow LRNR to retrieve and explain through connected knowledge rather than only through similar text.

Example:

```text
Find concepts related to vector indexing where:
- the learner has weak mastery
- prerequisites are unresolved
- a source claim changed recently
- the concept appears in upcoming sessions
- the current lesson can safely mention it without violating N+2
```

---

## Topological Sort Role

Topological sort should be used for curriculum sequencing when concepts have prerequisite edges.

Example:

```text
Embeddings
  -> Vector similarity
    -> Vector database
      -> RAG retrieval
        -> Hybrid retrieval
```

If `Hybrid retrieval` depends on `RAG retrieval`, and `RAG retrieval` depends on `Vector database`, the system should not schedule them in the wrong order.

Topological sort helps answer:

- what must be learned first
- what can be learned next
- which concepts are blocked
- where remediation should happen
- whether the curriculum graph has cycles

Cycle example:

```text
A requires B
B requires C
C requires A
```

That is invalid for prerequisite ordering and must be resolved manually or by revising the dependency model.

---

## When Not To Add Full Graph RAG Yet

Do not add full Graph RAG if:

- Slice 1 is not stable
- Teaching still feels generic
- Evaluation does not yet change future sessions
- RAG retrieval is not being measured
- concepts do not have stable IDs
- source claims are not structured
- the team cannot explain why graph traversal improves a real decision

Graph RAG should solve a demonstrated problem, not become architecture decoration.

---

## Implementation Principle

Start with PostgreSQL.

Do not add a graph database until PostgreSQL relational edges become a real bottleneck.

Recommended progression:

```text
Postgres tables
  -> relational edges
  -> graph-enhanced SQL retrieval
  -> graph traversal helpers
  -> optional graph database only if justified
```

This keeps the system simpler, cheaper, and easier to debug during early development.

---

## Future Questions To Revisit

- Do we need a separate `claims` table or can claims live inside `topic_knowledge_base` first?
- How granular should concepts be?
- Should misconceptions be first-class graph nodes?
- Should source trust affect graph traversal ranking?
- How should graph retrieval combine with vector retrieval scores?
- Should graph paths be shown to the learner as "why LRNR chose this" explanations?
- When does PostgreSQL stop being enough?

---

## Final Recommendation

Add Graph RAG in stages:

```text
Phase 1:
Postgres tables + pgvector RAG + concept prerequisite edges

Phase 2:
Graph-enhanced retrieval using relational edges:
concepts
concept_prerequisites
claims
sources
learner_mastery
sessions

Phase 3:
Full Graph RAG:
entity extraction
relationship extraction
community summaries
graph traversal + vector retrieval
```

This keeps LRNR practical now while preserving a strong path toward deeper intelligence later.
