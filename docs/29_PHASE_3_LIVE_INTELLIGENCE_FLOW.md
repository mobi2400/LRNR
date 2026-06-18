# LRNR - Phase 3 Live Intelligence Flow
> **Phase 3 implementation blueprint.**
> Build this only after Phase 1 core learning and Phase 2 adaptation are stable.

---

## Phase 3 Goal

Phase 3 makes LRNR current.

Phase 1 proves:

```text
LRNR can teach.
```

Phase 2 proves:

```text
LRNR can adapt to the learner.
```

Phase 3 proves:

```text
LRNR can stay aware of the changing world and safely connect important updates to active learning.
```

This is where LRNR becomes alive instead of static.

---

## Product Mode

Phase 3 can still run owner-only.

Recommended:

```text
ACCESS_MODE=owner_only
```

Do not make the product public just because Phase 3 is complete.

Public productization is a separate later milestone.

---

## Phase 3 User Experience

The owner should feel:

```text
LRNR is watching the frontier for me.
It tells me what matters.
It ignores noise.
It connects updates to what I am learning.
It does not derail my curriculum every day.
```

Experience flow:

```text
Owner studies normally
  -> background research workflow scans relevant sources
  -> Scout detects high/medium/low priority findings
  -> News Intelligence builds digest
  -> Contradiction Agent detects conflicts
  -> important Layer 3 updates appear in lessons
  -> medium updates queue for future curriculum changes
  -> nightly reconcile safely updates eligible sessions
  -> owner can inspect sources and claims
```

---

## Phase 3 System Flow

```text
Daily research workflow
  -> Scout scans current topic frontier
  -> News Intelligence scans broader AI/news sources
  -> findings are scored for relevance, novelty, and impact
  -> high-priority items become Layer 3 live injections
  -> medium-priority items go to agent_update_queue
  -> contradictions go to contradiction_queue
  -> news_items store digest candidates

Contradiction workflow
  -> reads contradiction_queue
  -> classifies conflict lens
  -> resolves or routes conflict
  -> creates Layer 3 explanation if learner should see it now
  -> creates deferred update if curriculum should change later

Nightly reconcile workflow
  -> reads pending queue items
  -> applies strict priority order
  -> protects today and tomorrow
  -> updates N+2 and later sessions
  -> enriches topic knowledge where safe
  -> marks queue items applied/rejected
```

---

## Phase 3 Includes

### Scout Agent

Scout watches the current learning topic.

It should detect:

- new releases
- breaking API changes
- important repo updates
- major documentation changes
- production incident lessons
- new best practices
- deprecations
- high-quality articles or papers

Scout output should be classified:

```text
high priority:
  show soon as Layer 3 injection

medium priority:
  queue for future curriculum update

low priority:
  store or ignore
```

Scout must not flood the learner with every update.

### News Intelligence Agent

News Intelligence scans broader sources and generates digest items.

It should score:

- relevance to current learning
- novelty
- impact
- urgency
- confidence
- curriculum connection

Digest items should explain:

- what happened
- why it matters
- whether the owner should care now
- which concept/session it connects to
- whether it changes the curriculum

### Contradiction Agent

Contradictions are expected in fast-moving technical topics.

Contradiction Agent should classify conflicts by lens:

- time/version difference
- scale difference
- context difference
- tool/provider difference
- opinion vs evidence
- outdated source
- actual unresolved conflict

It should produce:

- plain-English resolution
- source-backed explanation
- learner-facing Layer 3 item when useful
- deferred curriculum update when needed

### Layer 3 Live Injection

Layer 3 is the live context layer.

It should add freshness without chaos.

Layer 3 items should include:

- title
- summary
- relevance
- connected concept/session
- urgency
- expiration
- source links
- suggested placement

Layer 3 must not replace the core lesson.

It should usually appear as:

```text
Before we continue, here is one current update that changes how to think about this concept.
```

### Daily Research Workflow

Build:

- scheduled workflow
- source fetching
- Scout execution
- News Intelligence execution
- contradiction detection
- result persistence
- digest candidate creation
- observability

### Nightly Reconcile Workflow

Expand Curriculum Builder reconcile mode to process:

- evaluation findings
- Scout findings
- contradiction updates
- news-linked enrichments

Priority order:

```text
1. Safety/correctness fixes
2. Evaluation gaps and misconceptions
3. High-priority breaking changes
4. Contradictions affecting current topic
5. Medium-priority Scout findings
6. News enrichment
7. Low-priority optional improvements
```

Protected window:

```text
Do not rewrite today's session.
Do not rewrite tomorrow's session.
Prefer N+2 and later.
```

### Source and Claim Explorer

Build frontend/backend support for:

- topic knowledge base inspection
- source inventory
- claim provenance
- contradiction notes
- version notes
- source trust tier
- related concept/session links

This makes LRNR transparent.

### System Status

Build a real status page.

Show:

- daily learning workflow status
- daily research workflow status
- nightly reconcile status
- queue depth
- dead-letter jobs
- RAG health
- provider status
- Redis health
- Postgres health
- Telegram status
- ElevenLabs status

---

## Phase 3 Excludes

Do not build these yet:

- public signup
- billing
- admin tools for many users
- multi-tenant team workspace
- cross-user analytics
- public content marketplace
- advanced A/B model routing
- separate graph database unless Postgres graph foundations are limiting

Reason:

Phase 3 completes the private intelligent product. Public product scale is a separate milestone.

---

## Phase 3 Build Order

### Step 1 - Source and Claim Foundations

Build:

- `source_claims`
- `claim_sources`
- source/claim repositories
- source trust metadata
- claim provenance helpers

Done when:

- important claims can be traced to sources
- source explorer has real data to show

### Step 2 - Scout Agent

Build:

- current topic watch
- source fetchers
- finding extraction
- finding priority classifier
- Layer 3 item creation
- queue write for medium findings

Done when:

- Scout can find useful topic-specific updates
- high-priority items reach Layer 3
- medium-priority items queue safely

### Step 3 - News Intelligence Agent

Build:

- broad news source fetchers
- relevance scoring
- novelty scoring
- digest item generation
- curriculum connection detection
- digest persistence

Done when:

- daily digest contains meaningful ranked items
- unrelated noise is filtered out

### Step 4 - Contradiction Agent

Build:

- contradiction queue persistence
- contradiction classifier
- resolution prompt contract
- source-backed explanation
- Layer 3 contradiction output
- deferred update output

Done when:

- contradictions are classified clearly
- learner-facing explanation is useful
- unresolved conflicts do not silently corrupt lessons

### Step 5 - Daily Research Workflow

Wire:

- Scout
- News Intelligence
- contradiction detection
- persistence
- digest creation
- workflow logging
- job status

Done when:

- scheduled research run completes reliably
- failures are visible
- results are stored without duplicates

### Step 6 - Nightly Reconcile Workflow

Build:

- mixed queue processing
- priority ordering
- protected session window
- curriculum update application
- topic knowledge enrichment
- queue item resolution

Done when:

- evaluation/scout/news/contradiction items reconcile safely
- today/tomorrow are protected
- future sessions improve without chaos

### Step 7 - Frontend Live Intelligence

Build:

- Knowledge and Sources page
- News Digest page
- Alerts and Notifications page upgrade
- System Status page
- Layer 3 UI in lesson page
- source citation cards
- contradiction cards

Done when:

- owner can see what changed, why it matters, and where it came from

### Step 8 - Observability Hardening

Build:

- workflow dashboards
- queue dashboards
- provider health checks
- RAG health panels
- alerting for workflow failures
- alerting for dead-letter jobs
- alerting for provider failures

Done when:

- failures are visible and recoverable
- system does not silently stop staying current

---

## Phase 3 API Surface

Exact schemas are finalized during implementation.

Needed route groups:

```text
GET  /api/sources
GET  /api/sources/{sourceId}
GET  /api/claims
GET  /api/claims/{claimId}
GET  /api/concepts/{conceptId}/claims

GET  /api/news/digest
GET  /api/news/items
PATCH /api/news/items/{newsItemId}

GET  /api/layer3
PATCH /api/layer3/{itemId}

GET  /api/contradictions
GET  /api/contradictions/{contradictionId}
POST /api/contradictions/{contradictionId}/resolve

POST /api/workflows/daily-research
POST /api/workflows/nightly-reconcile
GET  /api/workflows/{runId}

GET  /api/system/status
GET  /api/system/queues
GET  /api/system/providers
GET  /api/system/rag-health
```

Rules:

- all routes require owner auth
- no raw provider keys exposed
- list endpoints must paginate
- source text must be returned safely
- workflow mutations require owner auth and job locks

---

## Phase 3 Data Written

Phase 3 writes:

- `news_items`
- `contradiction_queue`
- `source_claims`
- `claim_sources`
- `agent_update_queue`
- `delivery_outbox`
- updated `topic_knowledge_base`
- updated `curriculum_state.layer_3_live_queue`
- updated future `curriculum_state.layer_2_sessions`
- `job_runs`
- RAG memory for resolved contradictions when useful

---

## Phase 3 Testing Plan

### Phase 3 Eval Harness

Phase 3 expands the eval harness from learner adaptation to live-intelligence quality.

Purpose:

```text
Verify that LRNR can filter noisy updates, classify importance, resolve contradictions, and update future learning without destabilizing the curriculum.
```

Recommended location:

```text
tests/evals/
  scout-priority.eval.ts
  news-relevance.eval.ts
  contradiction-lens.eval.ts
  source-grounding.eval.ts
  layer3-noise.eval.ts
  nightly-reconcile.eval.ts
```

Minimum eval cases:

- breaking change is classified as high priority
- interesting but non-urgent update is classified as medium or low priority
- irrelevant news is filtered out
- digest item explains why the owner should care
- contradiction is classified by correct lens
- outdated source is not treated as current truth
- source-backed claim includes usable provenance
- Layer 3 item is useful and not noisy
- nightly reconcile applies strict priority order
- protected sessions remain unchanged

Quality dimensions:

- relevance
- novelty
- urgency
- source grounding
- contradiction classification accuracy
- curriculum stability
- noise control

If the live intelligence layer creates too much noise, it is worse than not having live intelligence.

### Unit Tests

- finding priority classification
- news relevance scoring
- novelty scoring
- contradiction lens classification
- Layer 3 expiration
- digest item formatting
- queue priority ordering
- protected session window logic
- source citation validation

### Integration Tests

- Scout finding to Layer 3 write
- Scout finding to queue write
- News Intelligence to news item write
- contradiction queue to resolution
- source claim to claim source relationship
- daily research workflow
- nightly reconcile workflow
- system status API

### Manual End-To-End Test

1. Set an active topic.
2. Simulate or fetch a relevant source update.
3. Run daily research.
4. Verify Scout creates useful findings.
5. Verify News Intelligence creates digest items.
6. Verify contradiction detection works on conflicting claims.
7. Verify high-priority finding appears in Layer 3.
8. Verify medium-priority finding goes to queue.
9. Run nightly reconcile.
10. Verify future eligible sessions update.
11. Verify today/tomorrow remain unchanged.
12. Open source explorer.
13. Verify claims can be traced to sources.
14. Open system status.
15. Verify workflow health is visible.

---

## Phase 3 Done Criteria

Phase 3 is done when:

- Scout finds useful topic-specific updates
- News Intelligence generates meaningful digest items
- Contradiction Agent classifies and resolves conflicts safely
- Layer 3 enriches lessons without overwhelming them
- daily research workflow runs reliably
- nightly reconcile handles mixed update types safely
- source/claim explorer makes important claims traceable
- system status shows real operational truth
- failures are visible through logs, traces, metrics, and alerts
- live updates improve learning instead of creating noise

Phase 3 is not done if:

- digest is noisy
- Layer 3 appears too often
- Scout and News duplicate each other
- contradictions are confusing
- future sessions change unpredictably
- source claims cannot be traced
- workflows fail silently

---

## Phase 3 Exit Gate

Do not move to public productization until this sentence is true:

```text
LRNR can stay current, filter noise, explain changes with sources, surface only useful live context, and update future learning without destabilizing the curriculum.
```

That is the live intelligence foundation.
