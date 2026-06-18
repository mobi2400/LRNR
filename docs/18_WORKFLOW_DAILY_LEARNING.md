# LRNR - Workflow Daily Learning
> **Load alongside all 4 foundation files before coding this workflow.**
> **Foundation files: 01_projectoverview.md, 02_architecture.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**
> **Also load: 30_PHASE_1_12_PART_IMPLEMENTATION_PLAN.md, 32_PHASE_1_API_CONTRACT.md, 33_AGENT_ORCHESTRATION_ROUTES.md**

---

## Workflow Identity

| Property | Value |
|----------|-------|
| File to create | `src/workflows/daily-learning.ts` |
| GitHub Actions file | `.github/workflows/daily-learning.yml` |
| Trigger | Scheduled daily run, targeted for 7:00 AM IST |
| Primary graph | Learning Graph |
| Main responsibility | Decide whether the user gets teaching, evaluation, or no delivery, then run the end-to-end learning flow safely |

---

## What This Workflow Does

This is the workflow that prepares the learner's daily experience.

It is not a dumb cron that always sends a lesson.

Its real job is to decide:

- is the user starting a new topic
- is evaluation due
- is there a pending lesson to deliver
- is there no valid delivery today
- did background agents leave Layer 3 context that should be surfaced

Then it must run the correct path and persist the outcome safely.

Current direction:

```text
Frontend displays the lesson.
Telegram alerts and deep-links.
```

This workflow should persist lesson/session state first, then queue notification through `delivery_outbox`.

---

## Inputs

### From environment

- database credentials
- Telegram bot credentials
- LLM credentials
- app config such as timezone

### From database

At minimum this workflow needs:

- `user_profile`
- active `curriculum_state`
- `topic_briefs` when onboarding/new topic path is active
- `rag_memory` for teaching/evaluation context
- `topic_knowledge_base` for grounded lessons
- `curriculum_state.layer_3` for live injections

### From runtime

- current date in IST
- workflow invocation id for logging and idempotency tracing

---

## Outputs

Potential outputs from this workflow:

- onboarding prompt sent
- daily lesson delivered
- evaluation conversation started or continued
- no-op with clear logged reason
- session status updates
- RAG memory writes
- profile updates such as `next_evaluation_due`

---

## End-to-End Flow

### Step 1 - Start and load context

Load:

- current user profile
- active curriculum state
- current topic status
- pending Layer 3 items

If no active learner record exists, log clearly and exit without pretending work succeeded.

### Step 2 - Determine route

The route decision should be explicit and logged.

Possible routes:

1. `new_topic`
2. `evaluation_due`
3. `continue_teaching`
4. `no_pending_session`
5. `conversation_waiting`

### Step 3 - New topic path

If the system is starting a new topic:

1. run `architect_node`
2. run `cartographer_node`
3. run `curriculum_builder_node` in initial mode
4. run `teaching_node`
5. run `delivery_node`
6. persist everything

This is the longest path and must have the strongest logging.

### Step 4 - Evaluation due path

If evaluation is due:

1. run `evaluation_node`
2. update profile and RAG
3. if evaluation concluded in the same run, allow `curriculum_builder_node` to reconcile the learning consequences that are immediate and safe
4. decide whether to send a closing evaluation message only or continue to a teaching message depending on the designed user experience

The workflow must never silently skip evaluation if `next_evaluation_due` says it is required.

### Step 5 - Continue teaching path

If a normal lesson is pending:

1. load today's session object
2. consume appropriate Layer 3 items
3. run `teaching_node`
4. run `delivery_node`
5. write session summary to RAG
6. mark session as delivered

### Step 6 - Persist and log completion

Always log:

- route chosen
- session id if any
- topic id
- whether evaluation ran
- number of Layer 3 items consumed
- whether delivery succeeded
- whether any RAG writes occurred

---

## Route Decision Rules

### New topic route

Choose this when:

- the user has no active curriculum for the current topic
- or onboarding explicitly requested a new goal and the workflow is running the initial flow

### Evaluation due route

Choose this when:

- `user_profile.next_evaluation_due <= today`
- and the learner has enough taught context for evaluation

### Continue teaching route

Choose this when:

- active curriculum exists
- evaluation is not due first
- a session is pending and not already delivered

### No pending session route

Choose this when:

- nothing valid is scheduled
- or the next session is not yet ready

In this case, the workflow should not invent content. It should either:

- no-op cleanly
- or send a short informative message only if that is part of product behavior

### Conversation waiting route

Choose this when:

- Architect or Evaluation is awaiting a user reply
- the workflow should not push a new lesson into the middle of an unfinished interactive flow

This route is critical for protecting multi-turn conversation coherence.

---

## Idempotency Rules

This workflow must be safe to rerun.

### Required protections

- do not redeliver a lesson already marked `delivered`
- do not write the same session summary twice
- do not consume the same Layer 3 item twice without intent
- do not rerun onboarding creation if the new-topic flow already completed

### Recommended checks

- `session.status !== 'delivered'`
- unique delivery record per `sessionId`
- unique summary write per `sessionId`
- lock/version on active curriculum row if necessary

---

## Layer 3 Handling in This Workflow

The workflow itself should not invent Layer 3 content.

Its responsibility is:

- load current Layer 3 queue
- pass relevant items into Teaching
- ensure only valid and unexpired items are surfaced
- mark consumed items correctly after successful delivery

If delivery fails before the Layer 3 item is truly shown, the item should not be lost.

---

## Failure Handling

| Failure | Handling |
|---------|----------|
| Profile load fails | Log and fail workflow |
| No active curriculum for teaching route | Log inconsistency and exit safely |
| Teaching generation fails | Log, mark workflow failed, do not mark session delivered |
| Telegram alert fails | Log and mark notification failure. Do not mark lesson generation as failed if lesson persistence succeeded. |
| RAG summary write fails after successful delivery | Log critical partial failure and queue repair if needed |
| Evaluation starts but user reply is needed | Persist waiting state and end workflow cleanly |

---

## Logging Requirements

Each run should log:

- workflow start
- route chosen
- current topic
- current session id if any
- whether evaluation due was true
- delivery outcome
- write outcomes
- total duration

---

## GitHub Actions Notes

The Actions job should:

- install dependencies
- run the workflow entry file
- surface failure clearly
- avoid overlapping runs if concurrency control is enabled later

The schedule should use UTC in YAML with comments documenting the intended IST time.

---

## Testing This Workflow

Priority tests:

- new topic path calls Architect -> Cartographer -> Curriculum Builder -> Teaching in order
- evaluation due path does not skip evaluation
- delivered session does not resend
- waiting conversation route blocks normal lesson delivery
- empty session path exits safely
- Layer 3 items are not double-consumed

---

## What This Workflow Must NOT Do

- Must NOT always send a lesson just because the cron fired.
- Must NOT bypass route logic.
- Must NOT directly mutate Layer 2 outside Curriculum Builder ownership.
- Must NOT lose interactive conversation state.
- Must NOT mark a lesson ready before lesson persistence succeeds.
- Must NOT treat Telegram as the primary lesson surface.
