# LRNR - Phase 2 Adaptive Learning Flow
> **Phase 2 implementation blueprint.**
> Build this only after Phase 1 is deployed and the core private learning loop works end to end.

---

## Phase 2 Goal

Phase 2 proves that LRNR can adapt to real understanding.

Phase 1 answers:

```text
Can LRNR teach a coherent lesson?
```

Phase 2 answers:

```text
Can LRNR detect what I actually understand and change future learning because of evidence?
```

This is where LRNR stops behaving like a smart course generator and starts behaving like a learning system.

---

## Product Mode

Phase 2 still runs in:

```text
ACCESS_MODE=owner_only
```

No public users yet.

The private product should now be good enough for serious personal learning and repeated weekly use.

---

## Phase 2 User Experience

The experience should feel like a mentor checking understanding, not like a generic quiz.

```text
Owner studies several lessons
  -> LRNR detects evaluation is due
  -> owner opens Evaluation page
  -> LRNR asks multi-angle questions
  -> owner answers by text or voice
  -> voice answer is transcribed
  -> owner reviews/corrects transcript
  -> Evaluation Agent scores confirmed text
  -> gaps and misconceptions are stored
  -> mastery changes are saved
  -> remediation queue is created
  -> Curriculum Builder updates future sessions
  -> next lessons visibly adapt
```

The important feeling:

```text
LRNR noticed what I misunderstood and changed the path intelligently.
```

---

## Phase 2 System Flow

```text
Daily workflow starts
  -> backend checks current curriculum state
  -> backend checks next_evaluation_due
  -> if evaluation due:
       route to Evaluation Agent
     else:
       route to Teaching Agent

Evaluation Agent
  -> retrieves recent sessions and unresolved misconceptions from RAG
  -> selects question angles
  -> asks one question at a time
  -> accepts text or confirmed transcript
  -> scores answer
  -> detects gaps/misconceptions/mastery
  -> writes evaluation_sessions
  -> writes meaningful RAG events
  -> updates learner_concept_mastery
  -> writes agent_update_queue remediation items

Curriculum Builder reconcile mode
  -> reads evaluation-driven queue items
  -> protects today and tomorrow
  -> updates eligible future sessions
  -> marks queue items applied/rejected
```

---

## Phase 2 Includes

### Evaluation Agent

Build the full Evaluation Agent.

It should:

- evaluate understanding, not memorization
- ask from multiple angles
- detect shallow answers
- probe tradeoffs
- identify misconceptions
- update mastery
- produce remediation requests
- write durable evaluation evidence

Question angles should include:

- explain in plain English
- apply to a scenario
- compare two approaches
- debug a failure
- identify tradeoffs
- answer from a different perspective
- explain why a misconception is wrong

### Voice Evaluation UX

ElevenLabs and voice features become important in Phase 2.

Use cases:

- read evaluation question aloud
- rephrase question from another angle
- explain why question matters
- read feedback after answer
- allow voice answers

Hard rule:

```text
Text is source of truth.
Audio is UX.
Confirmed transcript is what gets evaluated.
```

Flow:

```text
record audio
  -> transcribe
  -> show transcript
  -> owner edits/confirms
  -> Evaluation Agent scores confirmed text
```

Never score unconfirmed transcripts.

### RAG Hardening

Phase 2 moves RAG from simple memory writes to active learning support.

Build:

- filtered retrieval helpers
- event-based write helpers
- misconception resolve helpers
- idempotent memory writes
- context pack builder
- basic retrieval trace logging
- metadata-first retrieval by topic/concept/event type

Use RAG for:

- recent session summaries
- unresolved misconceptions
- prior weak answers
- known strengths
- repeated questions
- evaluation design context

Do not use RAG as:

- the source of truth for curriculum
- a transcript archive
- a replacement for evaluation sessions

### Mastery Model

Build concept-level mastery with three dimensions:

```text
can_solve
can_explain
can_decide
```

Why three dimensions:

- solving shows execution ability
- explaining shows conceptual clarity
- deciding shows judgment and tradeoff awareness

Store this in:

```text
learner_concept_mastery
```

### Agent Update Queue

Build `agent_update_queue` fully for evaluation-driven updates.

Queue items should capture:

- source agent
- update type
- priority
- target topic/session/concept
- payload
- status
- idempotency key
- processing result

In Phase 2, only evaluation-driven updates are processed.

Scout/news/contradiction queue processing waits for Phase 3.

### Curriculum Builder Reconcile Mode

Build reconcile mode, but scope it to evaluation findings only.

Rules:

- never rewrite today's session
- never rewrite tomorrow's session
- prefer changing N+2 and later
- preserve the learner's progress
- explain why a change was made
- mark queue items applied/rejected

### Frontend Pages

Add Phase 2 frontend pages:

1. Evaluation
2. Concept Detail
3. Notes and Answers
4. Mastery Dashboard

Upgrade Curriculum Map with:

- weak concepts
- mastered concepts
- prerequisite status
- evaluation due markers

### Backend

Build:

- evaluation APIs
- answer submission APIs
- voice upload/transcription APIs
- transcript confirmation APIs
- mastery APIs
- remediation queue APIs
- RAG query service
- BullMQ worker setup
- evaluation scoring jobs
- notification alerts for evaluation due/complete

---

## Phase 2 Excludes

Do not build these yet:

- Scout Agent
- News Intelligence Agent
- Contradiction Agent
- daily research workflow
- nightly broad reconciliation
- public user onboarding
- billing
- team workspaces
- advanced source explorer
- full Graph RAG entity extraction

Reason:

Phase 2 should stay focused on one difficult question:

```text
Can LRNR adapt based on evidence from the learner?
```

---

## Phase 2 Build Order

### Step 1 - RAG Hardening

Build:

- event write helpers
- filtered retrieval helpers
- context pack builder
- misconception resolve helpers
- idempotent RAG writes
- retrieval trace records

Done when:

- Evaluation can retrieve useful recent context
- unresolved misconceptions can be found quickly
- empty retrieval does not crash agents

### Step 2 - Evaluation Data Model

Build:

- `evaluation_sessions`
- `learner_concept_mastery`
- relevant indexes
- RLS policies
- repository methods
- Zod schemas

Done when:

- evaluation records can be persisted
- mastery scores can be updated safely
- confirmed transcripts can be stored

### Step 3 - Evaluation Agent

Build:

- question angle selection
- prompt contracts
- answer scoring
- misconception detection
- gap detection
- mastery delta generation
- remediation recommendation output

Done when:

- the agent can evaluate one concept from multiple angles
- outputs validate with Zod
- weak answers produce useful findings

### Step 4 - Evaluation Frontend

Build:

- evaluation page
- one-question-at-a-time UI
- answer box
- optional hint/rephrase UX
- result summary
- detected gaps
- remediation preview

Done when:

- owner can complete a written evaluation in the frontend
- results are understandable and encouraging

### Step 5 - Voice Answer Flow

Build:

- microphone capture
- upload API
- transcription backend
- transcript review UI
- transcript confirmation endpoint
- optional feedback audio generation

Done when:

- owner can answer by voice
- transcript can be edited
- only confirmed transcript is scored

### Step 6 - Queue and Reconcile

Build:

- `agent_update_queue`
- queue repository
- evaluation remediation item type
- Curriculum Builder reconcile mode
- protected N+2 update logic

Done when:

- evaluation findings create queue items
- future sessions update safely
- today/tomorrow remain protected

### Step 7 - Mastery and Notes UX

Build:

- mastery dashboard
- concept detail page
- notes and answers page
- weak concept view
- resolved/unresolved misconception view

Done when:

- owner can see where they are strong/weak
- evaluation history is useful for study

### Step 8 - Workflow Routing

Build:

- `next_evaluation_due` logic
- daily workflow route expansion
- evaluation reminder notifications
- post-evaluation continuation path

Done when:

- daily workflow chooses Teaching or Evaluation correctly
- evaluation does not confuse session progression

---

## Phase 2 API Surface

Exact schemas are finalized during implementation.

Needed route groups:

```text
POST /api/evaluation/start
GET  /api/evaluation/current
POST /api/evaluation/{evaluationId}/reply
POST /api/evaluation/{evaluationId}/voice-reply
POST /api/evaluation/{evaluationId}/confirm-transcript
GET  /api/evaluation/{evaluationId}/result

GET  /api/mastery
GET  /api/mastery/concept/{conceptId}
GET  /api/concepts/{conceptId}
GET  /api/notes
POST /api/notes
PATCH /api/notes/{noteId}
DELETE /api/notes/{noteId}

GET  /api/agent-update-queue
POST /api/workflows/reconcile-evaluation

POST /api/audio/transcribe-answer
POST /api/audio/generate-question
POST /api/audio/generate-explanation
```

Rules:

- all routes require owner auth
- every body uses Zod validation
- voice transcript must be confirmed before scoring
- mutation routes support idempotency where needed

---

## Phase 2 Data Written

Phase 2 writes:

- `evaluation_sessions`
- `learner_concept_mastery`
- `agent_update_queue`
- `rag_memory` gap/misconception/mastery events
- `audio_artifacts`
- `notes`
- updated `curriculum_state`
- updated `user_profile`
- `job_runs`
- `delivery_outbox`

---

## Phase 2 Testing Plan

### Phase 2 Eval Harness

Phase 2 expands the eval harness from structural checks to learning-quality checks.

Purpose:

```text
Verify that LRNR can evaluate understanding, detect misconceptions, update mastery, and adapt future learning based on evidence.
```

Recommended location:

```text
tests/evals/
  evaluation-agent.eval.ts
  mastery-scoring.eval.ts
  rag-retrieval.eval.ts
  misconception-detection.eval.ts
  curriculum-reconcile.eval.ts
  voice-transcript-guard.eval.ts
```

Minimum eval cases:

- strong answer is recognized as strong with explanation
- shallow answer is not over-scored
- misconception is detected and labeled correctly
- unclear answer triggers follow-up instead of false certainty
- RAG retrieves relevant recent session and misconception memory
- RAG avoids stale/resolved misconception unless needed
- mastery scoring changes are bounded and explainable
- remediation queue item matches the detected gap
- reconcile updates only eligible future sessions
- today and tomorrow are protected
- voice transcript cannot be scored before confirmation

Quality dimensions:

- answer relevance
- misconception detection accuracy
- scoring consistency
- retrieval usefulness
- adaptation usefulness
- refusal/follow-up behavior when evidence is weak

Do not rely only on visual/manual testing. Phase 2 is where bad agent judgment can quietly damage the learning path.

### Unit Tests

- question angle selection
- answer scoring schema validation
- misconception detection output validation
- mastery score update math
- next evaluation due calculation
- transcript confirmation guard
- queue priority logic
- N+2 protected session logic

### Integration Tests

- evaluation session persistence
- voice transcript flow
- RAG retrieval for evaluation
- queue write/read/process
- mastery update
- curriculum reconcile update
- notes create/read/update/delete

### Manual End-To-End Test

1. Complete several lessons from Phase 1.
2. Trigger evaluation due.
3. Answer one question strongly.
4. Answer one question weakly.
5. Answer one question by voice.
6. Confirm/edit transcript.
7. Verify evaluation result.
8. Verify gaps and misconceptions are written.
9. Verify mastery changes.
10. Verify remediation queue items.
11. Run reconcile.
12. Verify future sessions changed.
13. Verify today's and tomorrow's sessions did not change.
14. Verify next lesson reflects adaptation.

---

## Phase 2 Done Criteria

Phase 2 is done when:

- evaluation runs as a real multi-turn experience
- text answers work
- voice answers work through confirmed transcript
- evaluation writes durable records
- gaps and misconceptions are meaningful
- mastery scores update
- remediation queue items are created
- Curriculum Builder adapts future sessions
- today/tomorrow remain protected
- dashboard and mastery views reflect learning state
- RAG retrieval improves evaluation and teaching prompts
- Telegram can alert the owner to evaluate/continue

Phase 2 is not done if:

- evaluation feels like a generic quiz
- scores are not explainable
- voice transcript can be scored before confirmation
- gaps do not affect future sessions
- queue items are written but not processed
- RAG retrieval is too noisy
- session progression becomes confusing

---

## Phase 2 Exit Gate

Do not move to Phase 3 until this sentence is true:

```text
LRNR can detect what I understand, find what I misunderstand, remember the evidence, and change future lessons in a visible and useful way.
```

That is the adaptive learning foundation.
