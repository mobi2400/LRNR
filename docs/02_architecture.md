# LRNR - Architecture
> **This file is a foundation document. It must be included in every coding session as primary context.**

---

## System Overview

LRNR is built around **eight coordinated agents** orchestrated by **two LangGraph graphs**, sharing state through a **Profile Engine**, a **topic knowledge layer**, and a **RAG memory layer**, all persisted in **Supabase**.

Agents do not call each other directly. They coordinate through:

- typed graph state
- database-backed queues
- curriculum state
- profile state
- researched topic knowledge
- retrieval memory

---

## Architectural Boundaries

Before defining agents, these boundaries are mandatory:

### 1. Source of truth is split by domain

- `user_profile` is authoritative learner state
- `curriculum_state` is authoritative curriculum state
- `topic_knowledge_base` is authoritative researched topic knowledge
- `rag_memory` is retrieval memory for personalization and continuity
- `agent_update_queue` is authoritative deferred-update routing

RAG is not the single source of truth for everything.

### 2. Session progression is session-based, not purely calendar-based

The system must distinguish between:

- session number
- scheduled date
- delivered date
- completed session
- current curriculum position

If a user skips a day, the system must not silently pretend the session was completed just because a calendar day passed.

### 3. Interactive flows are different from scheduled workflows

Architect and Evaluation are multi-turn conversations. They are not one-shot cron jobs.

The implementation must explicitly handle:

- conversation persistence between Telegram replies
- resume behavior after user response
- timeout or abandonment
- duplicate message protection
- partial progress saving

GitHub Actions can schedule workflows, but scheduled jobs alone do not solve interactive state management.

### 4. Layer permissions are enforced in code

Layer write rules are not just documentation. They must be enforced in db and application logic.

---

## The Eight Agents

### Agent 01 - Architect Agent

**Role:** Understand the goal, probe real knowledge, map prerequisites, and produce the initial roadmap and first topic brief.

**Trigger:** New topic start. Also allowed to run on deliberate roadmap re-evaluation.

**Primary outputs:**

- Layer 1 roadmap in `curriculum_state`
- first topic brief in `topic_briefs`
- initial learner profile in `user_profile`
- onboarding memory in `rag_memory`

**Does:**

1. runs discovery conversation
2. probes self-assessment instead of trusting it
3. builds prerequisite chain
4. decides realistic entry point
5. defines what success looks like for this learner

**Does not:**

- research topic sources
- design daily session content
- deliver teaching

### Agent 02 - Cartographer Agent

**Role:** Research the topic deeply at topic start and build the Topic Knowledge Base.

**Trigger:** Runs once at topic start after Architect.

**Primary outputs:**

- `topic_knowledge_base`
- contradiction candidates in `contradiction_queue`

**Does:**

1. fetches high-credibility sources first
2. extracts structured concepts, tradeoffs, production examples, limitations, historical context
3. records claim provenance
4. flags contradictions

**Does not:**

- keep monitoring the topic forever
- deliver lessons
- own the curriculum schedule

### Agent 03 - Curriculum Builder

**Role:** Turn the researched topic and learner profile into a session plan, then reconcile deferred updates.

**Trigger A:** topic start

**Trigger B:** nightly reconciliation

**Primary outputs:**

- Layer 2 sessions in `curriculum_state`
- processed queue decisions
- evaluation schedule updates

**Critical rule:** Curriculum Builder owns Layer 2. No other agent writes Layer 2 directly.

### Agent 04 - Teaching Agent

**Role:** Deliver the current learning session in a structured form grounded in real examples and prior learner context.

**Trigger:** when the next pending session should be delivered and no evaluation is due first

**Primary outputs:**

- Telegram lesson delivery
- session status update
- session summary memory

**Teaching should always use:**

- Layer 2 session spec
- Layer 3 contextual items
- topic knowledge base examples
- learner memory for personalization

### Agent 05 - Evaluation Agent

**Role:** Detect the difference between surface familiarity and real understanding through multi-angle questioning.

**Trigger:** when `next_evaluation_due` is reached according to session progression rules

**Primary outputs:**

- gap and misconception memory
- mastery score updates
- remediation items in `agent_update_queue`
- evaluation session record

**Critical note:** evaluation should rely primarily on demonstrated reasoning, not shallow engagement metrics.

### Agent 06 - Scout Agent

**Role:** Monitor the active learning topic for relevant developments after topic start.

**Trigger:** daily research workflow

**Primary outputs:**

- high-priority live items to Layer 3
- medium-priority deferred items to `agent_update_queue`
- low-priority enrichment to `topic_knowledge_base`
- contradiction candidates

**Scout boundary:** Scout monitors the current topic frontier. It is not the broad all-news digest owner.

### Agent 07 - Contradiction Agent

**Role:** Classify contradictions and decide how they should affect learning.

**Trigger:** when Cartographer or Scout flags a contradiction

**Classifies contradictions through these lenses:**

1. version mismatch
2. scale mismatch
3. priority or tradeoff mismatch
4. one source likely incorrect or outdated

**Primary outputs:**

- Layer 3 contradiction injections
- deferred curriculum updates
- contradiction resolution records

### Agent 08 - News Intelligence Agent

**Role:** Watch broader AI developments and score them against learner profile and current curriculum position.

**Trigger:** daily research workflow

**Primary outputs:**

- daily news digest items
- Layer 3 curriculum-connected news items
- low-priority news archive records

**News Intelligence boundary:** broad AI awareness and profile-based ranking. Scout owns active-topic frontier monitoring.

---

## The Two LangGraph Graphs

### Graph 1 - Learning Graph

Purpose: onboarding, teaching, and evaluation flow.

High-level route:

```text
START
  -> route_node
  -> if new topic:
       architect_node
       cartographer_node
       curriculum_builder_node (initial)
       teaching_node
     else:
       profile_check_node
       -> if evaluation due:
            evaluation_node
            curriculum_builder_node (reconcile learning consequences)
            teaching_node or evaluation-close flow
       -> else:
            teaching_node
  -> delivery_node
  -> persist_node
  -> END
```

### Graph 2 - Research Graph

Purpose: background monitoring, contradiction routing, and news relevance.

High-level route:

```text
START
  -> load_profile_node
  -> parallel:
       scout_branch
       news_intelligence_branch
  -> contradiction_node (if needed)
  -> queue_routing_node
  -> persist_node
  -> END
```

**Important:** the nightly reconciliation workflow is operationally separate from broad research collection. It processes deferred Layer 2 updates in one controlled pass.

---

## The Three-Layer Curriculum

### Layer 1 - Foundation

Stored in `curriculum_state.layer_1`.

Contains:

- ordered roadmap
- topic sequence
- expected depth
- topic-level mastery intent

**Write rule:** only Architect may create or rewrite Layer 1.

### Layer 2 - Sessions

Stored in `curriculum_state.layer_2`.

Contains:

- session objects
- sequence order
- concepts to cover
- real example refs
- code refs
- evaluation markers
- status and schedule metadata

**Write rule:** only Curriculum Builder writes Layer 2.

**Stability rule:** no modification to today's or tomorrow's deliverable session. All deferred changes apply at N+2 minimum.

### Layer 3 - Live Injections

Stored in `curriculum_state.layer_3`.

Contains:

- live context
- contradiction flags
- current-event relevance
- short enrichment items

**Write rule:** many agents may append Layer 3 items, but formatting and expiration rules must be standardized.

Layer 3 enriches delivery. It does not silently rewrite the planned curriculum.

---

## Runtime Rules

These rules are as important as agent descriptions.

### 1. Idempotency is required

Scheduled and retried workflows must not:

- deliver the same lesson twice
- process the same queue item twice
- mark a session completed twice
- append duplicate live injections without detection

### 2. Queue ownership must be explicit

Background agents do not directly mutate Layer 2. They write proposals to `agent_update_queue`. Curriculum Builder reconciles them.

### 3. Provenance must survive all the way through teaching

If Teaching says something important about a tool, limitation, or tradeoff, the system must be able to trace the claim back to source records.

### 4. Engagement is secondary evidence

Response time, re-read rate, and follow-up frequency may help personalization, but mastery must be driven primarily by demonstrated reasoning and evaluation.

---

## Scheduling Summary

- `daily-learning` should decide whether to deliver a lesson or run evaluation based on learner progression state
- `daily-research` should run Scout and News Intelligence
- `nightly-reconcile` should process deferred Layer 2 updates in one place

The schedule should serve the learner state, not the other way around.

---

## Implementation Notes

This architecture is strong, but some parts are still intentionally incomplete at the docs stage.

The main unresolved implementation details that must be decided in code are:

- Telegram conversation resume model
- exact evaluation cadence semantics
- optimistic locking / idempotency strategy
- queue claim and retry behavior
- provenance storage detail
- whether a richer companion surface is needed for diagrams and deep code walkthroughs

These are not optional details. They are part of making the architecture real.
