# LRNR - Data Schema
> **This file is a foundation document. It must be included in every coding session as primary context.**
> **Single source of truth for data ownership and database responsibilities.**

---

## Database Platform

- Platform: Supabase (PostgreSQL + pgvector)
- Connection: `@supabase/supabase-js`
- Timestamps: `timestamptz` in UTC
- IDs: UUID v4 by database default

**Important ownership rule:** not all important information belongs in RAG. This schema is intentionally split by responsibility.

---

## Data Ownership Model

### `user_profile` is authoritative for learner state

Use for:

- goal context
- current topic
- curriculum position
- next evaluation due
- stable knowledge depth summaries
- stable mastery summaries
- learner preferences

### `curriculum_state` is authoritative for curriculum state

Use for:

- Layer 1 roadmap
- Layer 2 sessions
- Layer 3 live items
- session scheduling and delivery status

### `topic_knowledge_base` is authoritative for researched topic knowledge

Use for:

- researched concepts
- source inventory
- production examples
- limitations
- code patterns
- version notes
- interview patterns

### `rag_memory` is retrieval memory

Use for:

- retrieval of prior learning interactions
- semantic continuity
- misconception history
- session summaries
- question history
- contradiction resolution memory

Do **not** treat `rag_memory` as the only source of truth for learner state, curriculum state, or researched topic knowledge.

### `agent_update_queue` is authoritative for deferred update proposals

Use for:

- Scout findings awaiting reconciliation
- Evaluation remediation requests
- Contradiction-driven updates
- News-linked curriculum enrichment

---

## Required Tables

For implementation planning, these are the primary tables:

1. `user_profile`
2. `rag_memory`
3. `topic_briefs`
4. `topic_knowledge_base`
5. `curriculum_state`
6. `agent_update_queue`
7. `news_items`
8. `contradiction_queue`
9. `evaluation_sessions`

This doc keeps the schema guidance focused on ownership and contracts. Full SQL can still be expanded later, but these behavioral rules should not drift.

---

## Table Rules

### 1. `user_profile`

Purpose: stable learner profile and progress summary.

Must contain enough information to answer:

- what is the user's current goal
- what are they learning right now
- how far through the current topic are they
- when is evaluation next due
- what does the system believe they know
- what misconceptions are still active

Do not store raw session-by-session narrative here if it belongs in `rag_memory` or `evaluation_sessions`.

### 2. `rag_memory`

Purpose: retrieval memory for learning continuity.

Recommended event types:

- `session_summary`
- `misconception_detected`
- `misconception_corrected`
- `concept_mastered`
- `gap_detected`
- `question_asked`
- `evaluation_response`
- `contradiction_resolved`
- `onboarding_response`
- `layer3_injection`

Every record should carry enough metadata to filter by:

- user
- topic
- concept
- event type
- resolution status
- source agent
- confidence

### 3. `topic_briefs`

Purpose: Architect handoff document for a specific next topic.

This is not the full knowledge base. It is a structured handoff containing:

- why this topic matters for this learner
- what the learner already knows
- required depth
- prerequisite map
- concept outline
- mastery intent

### 4. `topic_knowledge_base`

Purpose: researched topic intelligence from Cartographer plus later enrichments.

Should preserve:

- source inventory
- claim provenance
- core concepts
- architectural decisions
- limitations
- production examples
- code patterns
- interview patterns
- historical context
- version information

### 5. `curriculum_state`

Purpose: the active curriculum container.

Should contain:

- Layer 1 roadmap
- Layer 2 session array
- Layer 3 queue
- status metadata
- active/inactive topic lifecycle info

**Critical semantics:**

- session sequence is not the same thing as calendar date
- a delivered session is not automatically a completed session
- skipped days must not corrupt curriculum position

### 6. `agent_update_queue`

Purpose: controlled deferred updates.

Every item should capture:

- source agent
- update type
- priority
- topic
- structured content
- created time
- processing status
- idempotency protection fields if needed

### 7. `news_items`

Purpose: stored news intelligence results and digest history.

Should contain:

- source
- title
- summary
- relevance
- novelty
- impact
- connection to current curriculum if any
- delivery status

### 8. `contradiction_queue`

Purpose: contradictions awaiting classification or already classified.

Should preserve both competing claims and their provenance.

### 9. `evaluation_sessions`

Purpose: durable record of evaluation conversations and outcomes.

Should store:

- concepts evaluated
- question/answer log
- gaps found
- misconceptions found or cleared
- mastery delta
- queued remediation

---

## Access Patterns By Agent

| Agent | Reads | Writes |
|------|------|--------|
| `architect_node` | `user_profile`, previous topic context if re-evaluating | `user_profile`, `topic_briefs`, `curriculum_state.layer_1`, `rag_memory` |
| `cartographer_node` | `topic_briefs` | `topic_knowledge_base`, `contradiction_queue` |
| `curriculum_builder_node` | `topic_briefs`, `topic_knowledge_base`, `user_profile`, `rag_memory`, `agent_update_queue`, `curriculum_state` | `curriculum_state.layer_2`, `user_profile.next_evaluation_due`, queue processing status |
| `teaching_node` | `curriculum_state`, `topic_knowledge_base`, `rag_memory`, `user_profile` | session delivery status, `rag_memory` |
| `evaluation_node` | `curriculum_state`, `rag_memory`, `user_profile`, `evaluation_sessions` | `rag_memory`, `user_profile`, `agent_update_queue`, `evaluation_sessions` |
| `scout_node` | `user_profile`, `curriculum_state`, `topic_knowledge_base` | `curriculum_state.layer_3`, `agent_update_queue`, optional low-priority KB enrichment, `contradiction_queue` |
| `contradiction_node` | `contradiction_queue`, `topic_knowledge_base`, `user_profile`, `curriculum_state` | `curriculum_state.layer_3`, `agent_update_queue`, contradiction status, `rag_memory` if resolved |
| `news_intelligence_node` | `user_profile`, `curriculum_state` | `news_items`, `curriculum_state.layer_3`, optional digest delivery tracking |

---

## Integrity Rules

1. Layer 1 may only be written by Architect.
2. Layer 2 may only be written by Curriculum Builder.
3. Layer 3 may be appended by approved agents, but item shape must be standardized.
4. Deferred curriculum changes must flow through `agent_update_queue`, not direct Layer 2 mutation.
5. Important claims stored in topic knowledge must preserve provenance.
6. RAG writes should be semantically meaningful events, not arbitrary dumps.
7. Runtime validation must exist between database rows and TypeScript domain types.

---

## Validation Rules

Every boundary from database row to application object should be validated with a runtime schema library such as `zod`.

Do not trust:

- raw JSONB structure
- partial rows
- LLM-generated objects before persistence
- scraped source structures

---

## Operational Notes

The schema is not just about tables. It must support:

- idempotent retries
- queue processing safety
- progress tracking independent of calendar drift
- provenance tracing
- future multi-user isolation

Those concerns should influence implementation from the beginning.
