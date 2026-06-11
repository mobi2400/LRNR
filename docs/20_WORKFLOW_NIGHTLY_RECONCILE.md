# LRNR - Workflow Nightly Reconcile
> **Load alongside all 4 foundation files before coding this workflow.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Workflow Identity

| Property | Value |
|----------|-------|
| File to create | `src/workflows/nightly-reconcile.ts` |
| GitHub Actions file | `.github/workflows/nightly-reconcile.yml` |
| Trigger | Scheduled daily run, targeted for 12:00 AM IST |
| Primary owner | Curriculum Builder in reconcile mode |
| Main responsibility | Process deferred updates safely and rewrite only eligible future Layer 2 sessions |

---

## What This Workflow Does

This workflow is the stability mechanism of LRNR.

Background agents are allowed to discover new things constantly. This workflow is what prevents that from turning the learner experience into chaos.

Its job is to:

- read pending `agent_update_queue` items
- group them by type and priority
- apply routing and conflict rules
- update only eligible future sessions
- never touch today's or tomorrow's session
- mark processed items safely

This workflow is the only place where deferred Layer 2 change proposals become actual Layer 2 modifications.

---

## Inputs

### From environment

- database credentials
- LLM credentials if reconciliation needs structured generation
- timezone config

### From database

- `agent_update_queue`
- active `curriculum_state`
- `user_profile`
- `topic_knowledge_base` if needed for added context
- `rag_memory` if reconciliation logic needs unresolved gap context

---

## Outputs

- updated Layer 2 session objects in `curriculum_state`
- processed/failed statuses on `agent_update_queue`
- optionally updated `next_evaluation_due` if schedule logic demands it
- reconciliation logs and metrics

---

## End-to-End Flow

### Step 1 - Load active curriculum and queue

Load:

- active curriculum for the user
- current learner position
- pending queue items

If there is no active curriculum, do not attempt to reconcile blindly.

### Step 2 - Determine protected window

Compute the protected window:

- today's deliverable session
- tomorrow's deliverable session

These sessions are immutable for reconciliation purposes.

Everything before them is historical.
Everything inside them is protected.
Everything after them is eligible for modification.

### Step 3 - Group queue items

Group pending items by type and priority.

At minimum expect:

- evaluation gaps
- scout findings
- contradiction resolutions
- news-linked enrichment

### Step 4 - Apply priority order

Priority order:

1. evaluation gaps
2. scout findings
3. contradiction-driven updates
4. news enrichment

This order is not cosmetic. It protects learning integrity.

If the learner does not understand a prerequisite, that matters more than a nice new industry update.

### Step 5 - Resolve collisions

If multiple queue items target the same future session:

- higher priority wins first
- lower priority may still append context if it does not distort the session
- if the session becomes overloaded, push lower-priority material further forward

### Step 6 - Rewrite eligible Layer 2 sessions

Only Curriculum Builder may write Layer 2.

Reconciliation may:

- insert remediation notes
- swap examples
- add contradiction discussion
- move enrichment later
- deepen or simplify future coverage

Reconciliation may not:

- rewrite today's session
- rewrite tomorrow's session
- silently change Layer 1 roadmap

### Step 7 - Mark queue items processed

Queue items must move to an explicit final state:

- processed
- deferred
- skipped
- failed

Do not leave handled items as ambiguous pending rows.

---

## Protected Window Logic

This is the most important operational rule in the workflow.

### N+2 rule

Deferred changes can only affect sessions at least two delivery steps ahead.

Why:

- preserves learner trust
- prevents lessons from shifting under the user overnight
- gives Teaching a stable near-term plan

### Determining "today" and "tomorrow"

Use session progression semantics, not raw calendar date alone.

The protected window should be defined by the learner's actual next deliverable sessions, especially if they skipped days.

---

## Queue Item Shape Expectations

Every queue item should have:

- unique id
- user id
- topic id
- source agent
- update type
- priority
- structured content
- status
- created time

Optional but helpful:

- target day hint
- target concept
- idempotency fingerprint

---

## Conflict Resolution Rules

### Evaluation gap vs scout finding

Evaluation gap wins. Scout finding may be delayed or attached later if still relevant.

### Evaluation gap vs contradiction

If contradiction explains the gap, combine them carefully. If not, remediation first.

### Scout finding vs news enrichment

Scout wins for active-topic relevance. News can often be pushed later or left in digest-only flow.

### Overloaded session

If a future session becomes too dense after updates:

- keep the highest-priority teaching objective
- push enrichment forward
- avoid turning one session into a pile of context

---

## Failure Handling

| Failure | Handling |
|---------|----------|
| No active curriculum | Log and exit safely |
| Queue row malformed | Mark failed and continue |
| Layer 2 rewrite generation fails | Retry once, then leave session unchanged and mark item failed |
| Partial queue processing succeeds | Persist processed rows and leave unresolved rows pending or failed explicitly |
| Protected window logic uncertain | Fail safe by not modifying the session |

---

## Idempotency Rules

This workflow must be safe to rerun.

Required protections:

- processed queue rows should not be re-applied
- rewritten sessions should not receive the same change twice
- duplicate queue items should be detected if possible

Recommended strategies:

- status transitions on queue rows
- last-modified metadata on sessions
- fingerprints on queue item content

---

## Logging Requirements

Each reconciliation run should log:

- number of pending queue items
- number of eligible sessions
- number of processed items by priority
- number of skipped or failed items
- session ids modified
- total duration

---

## GitHub Actions Notes

The Actions job should:

- install dependencies
- run the nightly reconciliation entry file
- fail visibly on unrecoverable issues
- document intended IST schedule in comments

---

## Testing This Workflow

Priority tests:

- N+2 protection works correctly
- evaluation gaps outrank scout/news items
- same queue item is not applied twice
- malformed queue item does not stop whole reconciliation
- overloaded session causes lower-priority material to move later
- Layer 1 is never modified here

---

## What This Workflow Must NOT Do

- Must NOT modify today's session.
- Must NOT modify tomorrow's session.
- Must NOT write Layer 1 roadmap.
- Must NOT let background agents bypass reconciliation and mutate Layer 2 directly.
- Must NOT leave processed items ambiguously pending.
