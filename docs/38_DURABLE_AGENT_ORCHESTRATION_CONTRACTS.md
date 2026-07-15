# LRNR - Durable Agent Orchestration Contracts

> Canonical Phase 1 workflow contract for durable agent orchestration, lesson lifecycle, retries, resume, and idempotency.

## Ownership Boundaries

Layer 1 roadmap ownership belongs to the Curriculum Builder only. Architect may propose goals and topic briefs, Cartographer may persist topic knowledge, Teaching may read roadmap/session context, but Teaching must not mutate Layer 1 or reorder Layer 2 unless a later explicit reconcile contract delegates that write back through Curriculum Builder.

Telegram is alerting only. The frontend is the learning cockpit. Backend orchestration owns workflow state, locks, durable checkpoints, idempotency keys, and side-effect ordering.

## Tool Binding Contract

Phase 1 nodes may only request wrapper-level capabilities from the orchestration registry. Agents must not request raw database clients, raw LLM SDKs, raw embedding SDKs, raw Telegram SDKs, or raw Redis clients. Delivery side effects use the outbox wrapper; RAG side effects use the RAG memory repository; agent nodes receive only the capabilities needed for their node boundary.

## Lesson Lifecycle

A lesson has three separate lifecycle concepts:

| State | Meaning | Owner | Must not imply |
| --- | --- | --- | --- |
| `ready` | Lesson content exists in persisted curriculum/session state and can be shown in frontend. | Teaching persistence step | Telegram sent, learner saw it, learner completed it |
| `delivered` | A notification/outbox item was queued or sent for an already-ready lesson. | Delivery/outbox worker | Lesson content was generated, learner completed it |
| `completed` | Learner explicitly completed the lesson or a trusted completion API recorded completion. | Learner action/API service | Notification success, next lesson generation |

Generation must only move a session to `ready`. Delivery may only move delivery/outbox status. Completion must remain a separate explicit action.

## Workflow Statuses

Workflow run statuses:

- `queued`: accepted for durable processing, not yet claimed.
- `running`: worker owns a current lease.
- `waiting_for_owner`: the next safe action requires owner input.
- `no_op`: route resolved to no safe work.
- `succeeded`: all critical nodes completed.
- `failed_retryable`: critical node failed but retry policy allows another attempt.
- `failed_terminal`: critical node failed permanently or retry budget is exhausted.
- `cancelled`: operator/config explicitly stopped the run.

Node statuses:

- `pending`: node is known but not eligible yet.
- `ready`: dependencies are satisfied and the node may be claimed.
- `running`: node lease is active.
- `succeeded`: node output is validated and checkpointed.
- `skipped`: node was intentionally bypassed with a typed reason.
- `waiting_for_owner`: node is paused for owner input.
- `failed_retryable`: node failed with retryable classification.
- `failed_terminal`: node failed permanently.

## Semantic Quality Gates

Schema validation is necessary but not sufficient. Phase 1 agent outputs must pass semantic gates for usable concepts, source provenance, curriculum coverage, exactly one ready session, non-placeholder lesson explanations, and source references. A gate failure must be recorded as a safety/quality failure instead of being silently accepted because the JSON shape looked valid.

## Retry And Failure Semantics

Every node policy must state whether the node is critical, retryable, and side-effecting.

Retryable failures include transient provider, Redis, network, lock-contention, lease-loss, and timeout errors. Terminal failures include schema-invalid output after retry budget, authorization failure, missing required upstream state, unsupported route, and safety/quality gate rejection marked non-retryable.

Retry writes must be idempotent. A retry must either replay the existing checkpoint or reserve the same idempotency key before producing a side effect.

## Resume Semantics

A resumed workflow must load persisted node checkpoints before running any node. Nodes with `succeeded` status must not rerun. Nodes with active leases may be reclaimed only after lease expiry. Optional failed nodes may be skipped only when downstream correctness does not depend on their output and the skip reason is recorded.

## Queue And Lease Contract

The production queue contract is BullMQ-compatible: API handlers enqueue a validated workflow payload with a stable job ID and return promptly. Workers must acquire a fenced workflow lock before inspecting checkpoints, renew the lease before executing the selected node, and release the lease during safe shutdown or after node completion. Duplicate queue deliveries must converge on the same job ID and must not duplicate side effects.

Redis/BullMQ is acceleration and coordination, not the source of truth. If Redis is unavailable, the API should fail safely or record a retryable queue error; persisted node checkpoints remain authoritative. If a worker crashes after claiming a node, another worker may recover only after the lease expires and must replay from the persisted checkpoint/idempotency key instead of trusting queue memory.

## Side-Effect Ordering

The Phase 1 spine is:

```text
route -> architect -> cartographer -> curriculum_builder -> teaching -> lesson_persisted -> delivery/RAG side effects
```

Never queue delivery before lesson persistence succeeds. Never write a lesson RAG summary for a failed or missing lesson. Never mark delivery success inside lesson generation. Never mark completion from notification success.

## Idempotency Keys

Use stable keys at every retryable boundary:

```text
workflow:{userId}:{route}:{requestHash}
node:{workflowRunId}:{nodeName}:{attemptScope}
lesson-generate:{userId}:{sessionId}:{curriculumRevision}
delivery:{userId}:{sessionId}:lesson-ready
rag-session-summary:{userId}:{sessionId}:{lessonRevision}
```

## Grounding And Citation Accuracy

Teaching and RAG-facing outputs must refuse or pause when claims are unsupported, evidence confidence is below the configured threshold, cited URLs are not present in the evidence pack, or embedding versions are incompatible. Citations are not decorative; they must point to evidence that supports the exact learner-facing claim.

## Observability Contract

Every workflow and node event must include request ID, workflow ID, node name, status, attempt number, retry classification, lease expiry where relevant, and safe error code. Logs must not include raw prompts, source text, secrets, cookies, auth headers, or raw learner memory.

