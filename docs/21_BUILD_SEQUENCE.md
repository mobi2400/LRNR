# LRNR - Build Sequence
> **Load alongside all 4 foundation files before planning implementation work.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Purpose

This file defines the build order for LRNR.

Its job is to answer:

- what gets built first
- what gets delayed intentionally
- what "done" means for each slice
- how to test each slice before moving forward
- what must be stable before the next layer of complexity is added

This matters because LRNR is an ambitious system. If everything is built at once, the project becomes hard to debug, hard to trust, and hard to finish.

The build order must protect momentum.

---

## Build Philosophy

The system should be built in **three meaningful slices**.

Each slice must be:

- independently useful
- operationally testable
- small enough to debug
- a clean foundation for the next slice

The goal is not to finish the architecture diagram quickly.

The goal is to make the system genuinely useful as early as possible, then increase intelligence without destabilizing what already works.

---

## The Three Slices

### Slice 1 - The Core Learning Loop

What it proves:

- the system can understand a learner goal
- the system can research a topic
- the system can build a first curriculum
- the system can deliver a coherent daily lesson

This is the first version that should already feel better than a static course.

### Slice 2 - Adaptive Learning

What it proves:

- the system can remember the learner meaningfully
- the system can evaluate real understanding
- the system can detect gaps and misconceptions
- the system can adapt future learning based on evidence

This is where LRNR stops being a good delivery system and starts becoming an intelligent learning system.

### Slice 3 - Live Intelligence

What it proves:

- the system can stay current
- the system can connect live developments to active learning
- the system can safely route updates without breaking curriculum coherence

This is where LRNR becomes alive rather than merely personalized.

---

## Slice 1 - The Core Learning Loop

### Goal

Build the minimum end-to-end system that can:

1. accept a new learning goal
2. run Architect onboarding
3. run Cartographer topic research
4. run Curriculum Builder initial planning
5. run Teaching delivery to Telegram

### Components included

- foundation docs
- `Architect Agent`
- `Cartographer Agent`
- `Curriculum Builder` in initial mode only
- `Teaching Agent`
- `Profile Engine` basic operations
- `Topic Brief` writes
- `Topic Knowledge Base` writes
- `Curriculum State` creation
- `Telegram delivery`
- `RAG onboarding seed`
- `RAG session summary writes`

### Components intentionally excluded

- Evaluation Agent
- Scout Agent
- Contradiction Agent
- News Intelligence Agent
- Nightly reconciliation
- Live topic monitoring
- broad digest workflow
- roadmap re-evaluation

### Why this cut is correct

Slice 1 should prove the core product promise:

> give me a goal, understand me, research the topic, and teach me something coherent tomorrow

If this does not work well, everything else is layering complexity on a weak foundation.

---

## Slice 1 Build Order

### Step 1 - Project scaffold

Create:

- `package.json`
- `tsconfig.json`
- `src/` structure
- linting/formatting config
- env schema
- base scripts

### Step 2 - Shared infrastructure

Build:

- `src/lib/groq.ts`
- `src/lib/supabase.ts`
- `src/lib/telegram.ts`
- `src/lib/embeddings.ts`
- `src/utils/retry.ts`
- `src/utils/logger.ts`
- runtime validation setup with `zod`

### Step 3 - Types and db layer

Build:

- `profile.types.ts`
- `curriculum.types.ts`
- `rag.types.ts`
- `knowledge-base.types.ts`
- `graph-state.types.ts`

Then build db modules:

- `profile.ts`
- `rag.ts`
- `knowledge-base.ts`
- `curriculum.ts`

### Step 4 - Architect flow

Build:

- Architect prompts
- conversation state contract
- onboarding persistence
- roadmap creation
- topic brief creation
- initial profile write
- onboarding RAG seed

### Step 5 - Cartographer flow

Build:

- Firecrawl wrapper
- source discovery and fetch logic
- credibility-tiered extraction
- topic knowledge base write

### Step 6 - Curriculum Builder initial mode

Build:

- concept ordering
- session object generation
- Layer 2 write
- evaluation schedule placeholder field

### Step 7 - Teaching flow

Build:

- lesson generation
- Telegram formatting and send sequence
- Layer 3 read path even if Layer 3 is mostly empty in Slice 1
- session summary RAG write
- session delivery marking

### Step 8 - Daily learning workflow

Build:

- route logic for new topic vs continue teaching
- end-to-end learning graph execution
- delivery node
- persistence and logging

---

## Slice 1 Done Criteria

Slice 1 is done when all are true:

- a user can state a new goal in Telegram
- Architect can complete onboarding without manual intervention
- roadmap, profile, topic brief, and onboarding RAG entries are created
- Cartographer can build a usable topic knowledge base from real sources
- Curriculum Builder can create initial sessions
- Teaching can deliver a lesson cleanly through Telegram
- a session summary is written to RAG
- the flow can be rerun without duplicate lesson delivery

### Slice 1 is NOT done if

- onboarding only works locally but not through Telegram flow
- Teaching sends generic lessons with no real grounding
- Cartographer output is too weak to support actual teaching
- RAG writes are skipped
- duplicate delivery is still possible

---

## Slice 1 Testing

### Unit tests

- env validation
- retry helper
- message splitting
- roadmap structure validation
- session generation validation

### Integration tests

- profile write/read
- RAG write/query
- curriculum creation
- topic brief creation

### End-to-end manual tests

1. Start with a fresh learner state
2. Send a new learning goal
3. Complete onboarding
4. Verify profile, topic brief, roadmap, and RAG writes
5. Verify Cartographer output exists
6. Verify first session is delivered
7. Re-run workflow and confirm the same lesson is not delivered twice

### Exit gate

Do not move to Slice 2 until the core learning loop feels coherent and trustworthy in real use.

---

## Slice 2 - Adaptive Learning

### Goal

Add evidence-driven adaptation.

This slice should prove that LRNR can do more than deliver content. It should prove the system can detect what the learner actually understands and use that to adjust the future path.

### Components included

- `Evaluation Agent`
- `RAG System` full usage patterns
- misconception detection and resolution flow
- mastery score updates
- `agent_update_queue`
- `Curriculum Builder` reconcile mode for evaluation-driven updates
- evaluation session persistence
- `next_evaluation_due` logic

### Components intentionally excluded

- Scout Agent
- News Intelligence Agent
- Contradiction Agent
- daily research workflow
- nightly broad research reconciliation

### Why this cut is correct

Slice 2 should answer one question:

> can the system adapt to the learner rather than just teach sequentially

That is the hardest product-value question after Slice 1.

---

## Slice 2 Build Order

### Step 1 - RAG system hardening

Expand:

- event-based RAG writes
- filtered retrieval helpers
- onboarding seed helper
- resolve misconception helpers
- idempotency checks for memory writes

### Step 2 - Queue system

Build:

- `agent_update_queue` db module
- queue item types
- priority model
- status transitions

### Step 3 - Evaluation flow

Build:

- question-angle selection logic
- interactive Telegram evaluation conversation
- gap/misconception classification
- mastery scoring writes
- queue writes for remediation

### Step 4 - Curriculum Builder reconcile mode

Initially scope reconcile mode to **evaluation-driven updates only**.

Do not bring in Scout or News updates yet.

This keeps the adaptation loop narrow and easier to verify.

### Step 5 - Daily learning workflow route expansion

Teach the workflow how to:

- detect `next_evaluation_due`
- run Evaluation route instead of Teaching route when appropriate
- continue safely after evaluation

---

## Slice 2 Done Criteria

Slice 2 is done when all are true:

- evaluation can run as a real multi-turn conversation
- evaluation writes meaningful gap and misconception records
- mastery scores update in profile
- remediation queue items are generated
- Curriculum Builder can modify future sessions based on evaluation findings
- today's or tomorrow's session is never rewritten
- future lessons visibly adapt after evaluation

### Slice 2 is NOT done if

- evaluation feels like a generic quiz
- gaps are detected but never affect future sessions
- queue items are written but not reliably processed
- RAG retrieval is too noisy to improve prompts
- session progression becomes confused after evaluation

---

## Slice 2 Testing

### Unit tests

- question-angle selection
- misconception classification validation
- next evaluation date calculation
- queue item validation
- reconciliation priority for evaluation items

### Integration tests

- evaluation session persistence
- queue write/read/process cycle
- misconception resolve flow
- mastery score updates

### End-to-end manual tests

1. Complete a few teaching sessions
2. Trigger evaluation
3. Give one strong answer and one weak/misleading answer
4. Verify gap and misconception writes
5. Verify future session change happens only in eligible sessions
6. Verify no double-processing on rerun

### Exit gate

Do not move to Slice 3 until adaptation actually changes future teaching in a way that is visible and useful.

---

## Slice 3 - Live Intelligence

### Goal

Make the system current and context-aware without destabilizing the learner experience.

### Components included

- `Scout Agent`
- `News Intelligence Agent`
- `Contradiction Agent`
- `WORKFLOW_DAILY_RESEARCH`
- `WORKFLOW_NIGHTLY_RECONCILE`
- Layer 3 live injection routing
- contradiction queue handling
- topic knowledge base enrichment from background monitoring

### Why this cut is correct

Slice 3 adds the "alive" layer:

- current developments
- topic frontier changes
- contradiction surfacing
- daily digest

This should come last because it is valuable only after the teaching and adaptation loops are trustworthy.

---

## Slice 3 Build Order

### Step 1 - Scout

Build:

- topic watch
- broad frontier scan for current topic
- priority routing
- Layer 3 creation
- medium-priority queue writes

### Step 2 - News Intelligence

Build:

- broader AI news fetch
- profile-based relevance scoring
- digest item generation
- curriculum connection detection

### Step 3 - Contradiction flow

Build:

- contradiction queue persistence
- contradiction classification
- Layer 3 contradiction output
- deferred contradiction-driven curriculum updates

### Step 4 - Daily research workflow

Wire:

- Scout
- News Intelligence
- contradiction persistence/routing

### Step 5 - Nightly reconcile workflow

Expand Curriculum Builder reconcile mode to handle:

- evaluation gaps
- scout findings
- contradiction-driven updates
- news-linked enrichment

while preserving strict priority order.

---

## Slice 3 Done Criteria

Slice 3 is done when all are true:

- Scout can create useful Layer 3 and queue items
- News Intelligence can generate a daily digest with meaningful ranking
- Contradiction Agent can classify and route conflicts safely
- nightly reconciliation processes deferred updates without touching protected sessions
- live updates enrich teaching without making it feel chaotic

### Slice 3 is NOT done if

- Layer 3 becomes noisy
- Scout and News Intelligence duplicate each other heavily
- contradictions are detected but surfaced in confusing ways
- background workflows create too many updates for the learner to absorb

---

## Slice 3 Testing

### Unit tests

- finding-priority classification
- contradiction lens classification
- Layer 3 expiration logic
- nightly queue conflict resolution

### Integration tests

- Scout -> Layer 3 write
- Scout -> queue write
- News Intelligence -> news item write
- contradiction queue -> contradiction handling
- nightly reconciliation across mixed-priority items

### End-to-end manual tests

1. Set an active topic
2. Simulate new relevant findings
3. Verify high-priority item appears in next lesson as Layer 3
4. Verify medium-priority item changes only future eligible sessions
5. Verify broad digest sends without duplicating every Layer 3 item
6. Verify contradiction handling produces a coherent surfaced explanation

---

## What Must Be Deferred Even Longer

These should **not** be part of the first three slices:

- multi-user productization
- payment system
- public onboarding flow for strangers
- web companion surface
- analytics dashboards
- admin tools
- cross-user learning intelligence
- advanced A/B model routing

These are Phase 2 or Phase 3 product concerns, not Slice 1-3 system concerns.

---

## Recommended Working Order Summary

### Week-like practical sequence

1. Slice 1 scaffold and core loop
2. Slice 1 polish until trustworthy
3. Slice 2 adaptation loop
4. Slice 2 polish until future teaching visibly improves
5. Slice 3 live intelligence
6. Slice 3 polish until updates feel helpful, not noisy

---

## Final Rule

Do not progress to the next slice because the previous slice is "mostly there."

Progress only when the previous slice is:

- working end to end
- understandable in logs and data
- testable without heroics
- stable enough that the next slice will not bury unresolved flaws

LRNR should be built as a sequence of trustworthy systems, not a single burst of ambitious code.
