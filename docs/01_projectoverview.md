# LRNR - Project Overview
> **This file is a foundation document. It must be included in every coding session as primary context.**

---

## What We Are Building

LRNR is a **Personal AI University**: an agentic learning system that knows what is happening in the world of AI, knows where a user is in their learning journey, and connects the two so learning is never static, never generic, and never disconnected from the real world.

This is not a course platform. Not a news aggregator. Not a tutoring app. It is a system that:

- understands a user's goal
- researches the topic in depth
- teaches through structured daily sessions
- evaluates real understanding rather than surface recall
- adapts the curriculum based on what it discovers
- connects learning to live industry developments

Current delivery direction: the LRNR web frontend is the primary learning surface. Telegram is used for notifications, reminders, failure alerts, lightweight digests, and deep links back to the frontend.

**The single sentence:** *The course that never goes out of date, because it is not a course.*

---

## The Problem We Are Solving

### Failure 1 - Static Content in a Dynamic Field

Someone records a LangChain course in January. By March, half the API has changed. By June, a better tool exists. The course sits there unchanged. Students follow deprecated code, things break, and they assume they are doing something wrong. The content is dead and nobody updated it.

LRNR solves this structurally. Cartographer does a deep research pass when a topic begins. Scout and News Intelligence monitor what changes after that. The curriculum becomes a living document, not a fixed recording.

### Failure 2 - Code-First Instead of Understanding-First

Most technical courses teach copying code before understanding what it does or why. You can follow along perfectly and still build nothing independently because you never built the mental model.

LRNR teaches in a deliberate sequence:

`fundamentals -> architecture -> under the hood -> production reality -> tradeoffs -> code -> visuals`

Code appears near the end, after the mental model exists. Code should confirm understanding, not introduce it.

### Failure 3 - Monotony Kills Curiosity

Same format every lesson. Watch video, read text, do exercise, repeat. The brain stops engaging because it knows exactly what is coming.

LRNR breaks that pattern structurally. Evaluation attacks from multiple angles every few days. Contradictions get surfaced. Current developments get connected to active learning. The experience stays alive.

### Failure 4 - Disconnected From the Real World

You study LangChain in a bubble. Meanwhile a major update dropped, a credible engineer published why they migrated away from it, and a paper reframed one of its assumptions. None of that reaches you.

LRNR's News Intelligence mode is aware of the user's current topic and current position. A LangChain update lands differently on Day 6 of LangChain than it does to a random reader, and the system should treat it differently.

### The Root Problem - Isolation

Courses are isolated from the real world, from the user's actual gaps, from how the field is moving, and from each other.

LRNR's deepest value is **connection**:

- news connected to learning
- today's lesson connected to yesterday's lesson
- user gaps connected to future curriculum updates
- real-world developments connected to the learner's current level

---

## The Two Modes

### Mode 1 - News Intelligence

Every morning the user receives a curated AI news digest. Not just headlines. Strategic intelligence.

For each significant development, the system should answer:

- what changed
- what it replaces
- what impact it creates
- whether the user should invest time in it now, later, or not at all

This mode is always aware of the user's profile and current learning topic.

### Mode 2 - Deep Learning Curriculum

The user states a goal such as: "I want to learn Agentic AI."

The system does not hand them a generic syllabus. It runs a discovery conversation, maps prerequisite dependencies, assesses what they actually know versus what they think they know, and builds a personalized path from their real starting point to their goal.

**The key innovation:** these two modes feed each other.

If the user is actively learning LangChain and a meaningful LangChain update drops, the system connects the update directly into the learning experience.

---

## The Learning Sequence

Every topic is taught in this sequence unless there is a very strong reason not to:

| Step | Phase | What It Builds |
|------|-------|----------------|
| 01 | Fundamentals | Why this exists, what problem it solves, first principles |
| 02 | Architecture | How it is designed, key decisions, what connects to what |
| 03 | Under the Hood | What happens at runtime, internals, implementation details |
| 04 | Production Reality | What breaks at scale, real company decisions, operational concerns |
| 05 | Tradeoffs | When to use it, when not to, what each choice gives up |
| 06 | Code | Writing it yourself after understanding already exists |
| 07 | Visuals & Diagrams | Flowcharts, architecture diagrams, mental models made concrete |

---

## The Eight Agents

Full detail lives in `02_architecture.md`. Summary:

| Agent | Role | Runs When |
|-------|------|-----------|
| Architect | Understands goal, maps dependencies, produces roadmap and first topic brief | On new topic start |
| Cartographer | Deep research pass, builds topic knowledge base | On new topic start |
| Curriculum Builder | Designs learning path, processes nightly reconciliation | On topic start + nightly |
| Teaching | Delivers daily learning session | Daily |
| Evaluation | Multi-angle questioning, gap and misconception detection | Every 2-3 sessions or as scheduled |
| Scout | Background monitoring of current topic developments | Daily |
| Contradiction | Detects and classifies conflicting information | On contradiction discovery |
| News Intelligence | Daily AI news digest scored against profile and curriculum | Daily |

---

## The Three-Layer Curriculum

Full detail lives in `02_architecture.md`. Summary:

- **Layer 1 - Foundation:** the stable topic roadmap. Set by Architect. Immutable during a topic except by deliberate roadmap re-evaluation.
- **Layer 2 - Sessions:** scheduled lesson objects. Written only by Curriculum Builder through controlled reconciliation rules.
- **Layer 3 - Surface:** live contextual injections that do not rewrite the curriculum, only enrich delivery.

---

## What the User Achieves

After completing a topic through LRNR, the user should be able to:

- explain the concept from first principles
- read source code, documentation, and research papers and extract what matters
- make architectural decisions with awareness of tradeoffs
- handle interview-style questioning from multiple angles
- evaluate new tools and updates in the same domain without depending on the system
- spot contradictions between sources and identify what context explains them

**Operational definition of mastery:**

- **Can solve:** the user can handle realistic problems with constraints, tradeoffs, and edge cases
- **Can explain:** the user can explain the concept clearly and survive follow-up questions
- **Can decide:** the user can choose between options, justify tradeoffs, and say when not to use something

The real output is not only topic knowledge. It is a transferable way of thinking about technical systems from first principles through production reality.

---

## Target Users

### Phase 1 - Personal Use

Built for a single user first. Used daily for several months. Every broken assumption should surface through actual use.

### Phase 2 - Product Launch

Four likely segments:

1. Working professionals who want promotion or faster upskilling
2. Career switchers who do not trust themselves to design the right learning path
3. Placement seekers who need to go from theory to interview-ready depth
4. Senior engineers who want to stay current without drowning in noise

### Product Moat

A competitor can copy architecture diagrams. They cannot easily copy accumulated learning intelligence from many real learning journeys.

That only matters later. In Phase 1, the goal is to make the system genuinely useful for one user.

---

## Design Principles

1. **Output-driven, not time-driven.** A topic ends when the user reaches the mastery standard, not when a calendar says so.
2. **Probe, do not survey.** Self-assessment is not trusted until probed.
3. **Layers protect learners from agent chaos.** Multiple agents may discover updates, but the learner experience must remain stable.
4. **RAG is memory, not total authority.** The RAG is retrieval memory. Profile state, curriculum state, and researched topic knowledge remain authoritative in their own domains.
5. **Connection over content.** The value is in connecting pieces, not just generating more explanation.
6. **Model the abstraction, not the implementation.** LLM calls go through one abstraction layer. Database writes go through dedicated db modules. Agent files should not bypass shared boundaries.
7. **Build for one user first, architect for many later.** Multi-user isolation must be possible from Day 1, even if only one user exists initially.

---

## Current Build Status

**Phase:** Pre-development. The architecture direction is strong, but the docs are intentionally still being refined.

**Target:** Phase 1 private core deployed as a frontend-first private alpha, with Telegram alerts/deep links.

**Phase 1 scope:** owner-only auth, frontend learning cockpit, Architect Agent, Cartographer Agent, Curriculum Builder initial mode, Teaching Agent, basic Profile Engine, RAG onboarding/session memory, Telegram alerting, and deployable private workflow.

No evaluation, no scout, no news in Slice 1. Just the core learning loop working end to end.

**Important note:** these docs are a source of truth for intent and structure, not proof that every runtime detail is already finalized. Conversation state handling, scheduling semantics, retries, idempotency, and operational behavior still need to be validated in code.

---

## File Reference Map

When coding any component, always load these foundation files first:

| File | Contains |
|------|----------|
| `01_projectoverview.md` | product vision, problem, principles, high-level goals |
| `02_architecture.md` | agents, graphs, curriculum layers, runtime rules |
| `03_DATA_SCHEMA.md` | Supabase tables, fields, ownership boundaries |
| `04_STACK_AND_CONVENTIONS.md` | stack, folder structure, coding patterns, implementation rules |

Then load the specific agent or component file for the session.

For Phase 1 implementation, also load:

| File | Contains |
|------|----------|
| `27_PHASE_1_PRIVATE_CORE_FLOW.md` | Phase 1 product and system flow |
| `30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md` | 12-part agent execution plan |
| `31_REPOSITORY_STRUCTURE.md` | target folder/file structure |
| `32_PHASE_1_API_CONTRACT.md` | Phase 1 endpoint contracts |
| `33_AGENT_ORCHESTRATION_ROUTES.md` | route/state-machine rules |
| `34_DEPLOYMENT_ENV_CHECKLIST.md` | deployment, env, and smoke test checklist |
| `35_PHASE_1_SUBPART_AGENT_PROMPTS.md` | copy-ready prompts for each Phase 1 sub-part |
