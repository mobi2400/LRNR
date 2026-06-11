# LRNR - Workflow Daily Research
> **Load alongside all 4 foundation files before coding this workflow.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Workflow Identity

| Property | Value |
|----------|-------|
| File to create | `src/workflows/daily-research.ts` |
| GitHub Actions file | `.github/workflows/daily-research.yml` |
| Trigger | Scheduled daily run, targeted for 2:00 AM IST |
| Primary graph | Research Graph |
| Main responsibility | Collect current-topic frontier changes and broader AI news, then route findings to Layer 3, queue, contradiction handling, or news archive |

---

## What This Workflow Does

This workflow keeps the system current without disturbing the learner experience directly.

Its job is to:

- monitor the active learning topic via Scout
- monitor broader AI developments via News Intelligence
- identify contradictions
- route updates by urgency and relevance
- prepare tomorrow's learning context

It must **not** rewrite Layer 2 directly.

All curriculum-changing implications must go through queue or approved live injection paths.

---

## Inputs

### From environment

- database credentials
- scraping credentials
- LLM credentials
- app configuration such as timezone

### From database

- `user_profile`
- active `curriculum_state`
- `topic_knowledge_base`
- `news_items`
- `contradiction_queue`
- recent queue items if duplicate detection is needed

---

## Outputs

Possible outputs:

- Layer 3 items for tomorrow's lesson
- medium-priority queue items for nightly reconciliation
- low-priority knowledge base enrichments
- contradiction queue entries
- news digest candidate records in `news_items`

---

## End-to-End Flow

### Step 1 - Load learner context

Load:

- current topic
- current session position
- current learner interest areas
- existing knowledge base sources
- recent news URLs

This step prevents duplicate and irrelevant work.

### Step 2 - Run Scout branch

Scout should monitor:

- topic-specific docs/changelogs
- GitHub repos/issues/releases
- relevant papers tied to the current topic
- tightly related practitioner commentary

Outputs should be internally classified into:

- high priority
- medium priority
- low priority
- contradiction candidate

### Step 3 - Run News Intelligence branch

News Intelligence should monitor:

- broad AI news
- major model releases
- research developments
- tool/product shifts
- policy/safety developments if relevant to learner profile

Each item should be scored on:

- relevance
- novelty
- impact
- connection to current curriculum

### Step 4 - Process contradiction candidates

If Scout or News surfaces information that conflicts with existing topic knowledge or current teaching assumptions:

- create contradiction records
- optionally run contradiction classification if part of the same workflow design
- decide whether any Layer 3 warning is required immediately

### Step 5 - Route outputs

Use routing rules:

- high priority directly relevant to what the learner is actively studying -> Layer 3
- medium priority relevant but not urgent -> `agent_update_queue`
- low priority enrichment -> `topic_knowledge_base`
- broad digest-worthy news -> `news_items`

### Step 6 - Persist and finish

Persist all routed results with provenance and clear logging.

---

## Routing Rules

### High priority -> Layer 3

Use when all are true:

- relevant to active learning
- timely enough that waiting would reduce value
- source credibility is high enough
- message can be surfaced without destabilizing the curriculum

### Medium priority -> agent update queue

Use when:

- relevant to the topic
- useful for future session refinement
- not urgent enough for immediate learner injection

### Low priority -> topic knowledge base enrichment

Use when:

- useful to know later
- not urgent
- not a strong enough learner-facing item on its own

### Contradictions -> contradiction queue

Use when:

- claims materially conflict
- context lens is not yet resolved
- a future explanation or warning may be needed

### Broad news -> news items

Use when:

- the item matters strategically
- it may appear in digest form even if not routed to Layer 3

---

## Duplicate Protection

Daily research will often see repeated URLs and repeated narratives.

Required protections:

- skip recently seen URLs
- avoid re-adding the same Layer 3 item repeatedly
- avoid duplicate medium-priority queue entries
- avoid duplicate contradiction records for the same unresolved claim pair

Recommended duplicate key dimensions:

- user id
- topic id where relevant
- source URL
- normalized title
- claim fingerprint if available

---

## Rate Limiting and Cost Rules

This workflow touches the most external sources.

Rules:

- bound concurrency
- batch LLM scoring work
- skip deep fetch when a headline-level decision is enough
- stop after configured max items per branch

Examples from Scout boundary:

- max 2 new Layer 3 items per day
- max 5 queue items per day from Scout branch unless later changed deliberately

---

## Failure Handling

| Failure | Handling |
|---------|----------|
| One RSS feed fails | Log and continue |
| GitHub API rate limit hit | Skip GitHub branch for this run and log clearly |
| News scoring LLM fails for one batch | Retry batch, then continue with partial result if safe |
| Layer 3 already crowded | Cap new additions and downgrade remainder to queue where appropriate |
| Knowledge base enrichment write fails | Log and continue if high-priority routing already succeeded elsewhere |
| Contradiction creation fails | Log as critical because future teaching may become inconsistent |

---

## Logging Requirements

Each run should log:

- active topic
- number of raw findings per branch
- number of items routed high/medium/low
- number of contradiction candidates
- number of duplicate skips
- branch failures
- total duration

---

## GitHub Actions Notes

The Actions job should:

- install dependencies
- run the research workflow entry file
- fail visibly on unrecoverable issues
- be documented in UTC with intended IST schedule comments

If concurrency control is introduced, overlapping research runs should be prevented.

---

## Testing This Workflow

Priority tests:

- repeated URLs are skipped
- high-priority findings become Layer 3 items
- medium-priority findings become queue items
- low-priority findings enrich topic knowledge
- contradiction candidates are persisted
- branch failure does not kill the whole run unless critical

---

## What This Workflow Must NOT Do

- Must NOT write directly to Layer 2 sessions.
- Must NOT do deep Cartographer-style full topic remapping.
- Must NOT flood Layer 3 with many items.
- Must NOT treat broad AI news and current-topic monitoring as the same responsibility.
