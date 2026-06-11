# LRNR — Graph 01: Learning Graph
> **Load alongside all 4 foundation files before coding this graph.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**
> **Also load the agent files for every node this graph wires together.**

---

## Graph Identity

| Property | Value |
|----------|-------|
| File to create | `src/graphs/learning-graph.ts` |
| Entry point | `src/workflows/daily-learning.ts` |
| GitHub Actions trigger | `daily-learning.yml` — cron `30 1 * * *` (7:00 AM IST) |
| Graph type | StateGraph (LangGraph JS) |
| State type | `LearningGraphState` |
| Avg total runtime | 5-12 minutes depending on route |

---

## What This Graph Does — Plain English

The Learning Graph is the daily experience engine. Every morning at 7:00 AM IST it runs, reads the user's current state, makes a routing decision, runs the appropriate agents in sequence, and delivers a session to Telegram. It is the only graph that directly interacts with the user's daily experience.

The graph has three routes. Route A handles new topic starts — it runs the full pipeline from Architect through Cartographer through Curriculum Builder through Teaching. This route only runs when the user has no active topic or has explicitly requested a new one. Route B handles evaluation days — it skips Teaching and runs the Evaluation Agent instead, then passes findings to Curriculum Builder for reconciliation before the next session. Route C is the normal daily path — it reads today's session from the curriculum, runs Teaching, and delivers. The routing decision happens in a single node that reads the profile and makes the call.

The graph never fails silently. If any node fails, the error is captured in state, and the delivery node always runs — either delivering the real session or sending the user a clear fallback message explaining what happened and that it will retry. The user always gets a Telegram message. The graph never completes without touching Telegram.

---

## State Type — Full Specification

```typescript
// src/types/graph-state.types.ts

export interface LearningGraphState {
  // Identity
  userId: string;

  // Profile — loaded at graph start, updated by nodes that write to profile
  profile: UserProfile;

  // Current topic context
  currentTopic: string;               // slug: 'langchain', 'databases'
  currentTopicId: string | null;

  // Curriculum state — loaded at graph start
  curriculumState: CurriculumState;

  // Today's session — populated by teaching_node or evaluation_node
  todaySession: Layer2Session | null;

  // Layer 3 injections — loaded at graph start, consumed by teaching_node
  layer3Injections: Layer3Item[];

  // RAG context — loaded by nodes that need personalisation
  ragContext: RAGContext;

  // Knowledge base — loaded by cartographer and teaching nodes
  topicKnowledgeBase: TopicKnowledgeBase | null;

  // Routing flags — set by load_profile_node and route_node
  isNewTopic: boolean;
  isEvaluationDue: boolean;
  isTopicComplete: boolean;

  // Evaluation result — populated on Route B
  evaluationResult: EvaluationResult | null;

  // Delivery tracking
  deliveryStatus: 'pending' | 'delivered' | 'skipped' | 'failed' | 'already_delivered';
  deliveredMessages: string[];        // content of what was sent — for logging

  // Error tracking — never throws, accumulates errors here
  errors: string[];
}

// Initial state factory — called at workflow entry point
export function createInitialState(userId: string): LearningGraphState {
  return {
    userId,
    profile: {} as UserProfile,
    currentTopic: '',
    currentTopicId: null,
    curriculumState: {} as CurriculumState,
    todaySession: null,
    layer3Injections: [],
    ragContext: { entries: [] },
    topicKnowledgeBase: null,
    isNewTopic: false,
    isEvaluationDue: false,
    isTopicComplete: false,
    evaluationResult: null,
    deliveryStatus: 'pending',
    deliveredMessages: [],
    errors: [],
  };
}
```

---

## Node Inventory

| Node Name | File | Agent Called | Runs On Route |
|-----------|------|-------------|---------------|
| `load_profile_node` | `src/nodes/load-profile.node.ts` | — (DB reads only) | A, B, C |
| `route_node` | `src/nodes/route.node.ts` | — (logic only) | A, B, C |
| `architect_node` | `src/agents/architect.ts` | Architect Agent | A only |
| `cartographer_node` | `src/agents/cartographer.ts` | Cartographer Agent | A only |
| `curriculum_builder_node` | `src/agents/curriculum-builder.ts` | Curriculum Builder (initial) | A only |
| `evaluation_node` | `src/agents/evaluation.ts` | Evaluation Agent | B only |
| `reconcile_node` | `src/agents/curriculum-builder.ts` | Curriculum Builder (reconcile) | B only |
| `teaching_node` | `src/agents/teaching.ts` | Teaching Agent | A, C (and after B) |
| `delivery_node` | `src/nodes/delivery.node.ts` | — (Telegram send + DB write) | A, B, C |
| `update_rag_node` | `src/nodes/update-rag.node.ts` | — (RAG write) | A, B, C |

---

## Graph Flow — Visual

```
START
  │
  ▼
load_profile_node
  │  Reads: user_profile, curriculum_state, layer_3 queue
  │  Sets: profile, curriculumState, layer3Injections, currentTopic
  │  Sets: isNewTopic, isEvaluationDue, isTopicComplete
  │
  ▼
route_node
  │  Reads: isNewTopic, isEvaluationDue, isTopicComplete
  │  Returns one of three edge labels
  │
  ├──── 'new_topic' ────────────────────────────────────┐
  │                                                      │
  ├──── 'evaluation_due' ──────────────────────┐        │
  │                                             │        │
  └──── 'continue' ─────────┐                  │        │
                             │                  │        │
                    ┌────────▼──────┐  ┌────────▼──────┐ │
                    │ teaching_node │  │evaluation_node│ │
                    │               │  │               │ │
                    └────────┬──────┘  └───────┬───────┘ │
                             │                 │          │
                             │         ┌───────▼──────┐  │
                             │         │reconcile_node│  │
                             │         └───────┬──────┘  │
                             │                 │          │
                             │         ┌───────▼──────┐  │
                             │         │ teaching_node│  │
                             │         └───────┬──────┘  │
                             │                 │          │
                             └────────┬────────┘          │
                                      │           ┌────────▼──────┐
                                      │           │architect_node │
                                      │           └───────┬───────┘
                                      │                   │
                                      │           ┌───────▼──────────┐
                                      │           │cartographer_node │
                                      │           └───────┬──────────┘
                                      │                   │
                                      │           ┌───────▼──────────────┐
                                      │           │curriculum_builder_node│
                                      │           └───────┬──────────────┘
                                      │                   │
                                      │           ┌───────▼──────┐
                                      │           │ teaching_node│
                                      │           └───────┬──────┘
                                      │                   │
                                      └──────────┬────────┘
                                                 │
                                        ┌────────▼──────┐
                                        │ delivery_node │
                                        └────────┬──────┘
                                                 │
                                        ┌────────▼──────┐
                                        │update_rag_node│
                                        └────────┬──────┘
                                                 │
                                               END
```

---

## Node Specifications

### `load_profile_node`

**File:** `src/nodes/load-profile.node.ts`

**Purpose:** Load all data the graph needs. This is the only node that does bulk DB reads. All other nodes read from state.

**Implementation:**

```typescript
import { getProfile } from '../db/profile';
import { getActiveCurriculumState } from '../db/curriculum';
import { getLayer3Items } from '../db/curriculum';
import { logger } from '../utils/logger';
import { LearningGraphState } from '../types/graph-state.types';

export async function loadProfileNode(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  logger.info('load_profile_node started', { userId: state.userId });

  try {
    const [profile, curriculumState] = await Promise.all([
      getProfile(state.userId),
      getActiveCurriculumState(state.userId),
    ]);

    // Handle first-ever run — no profile exists yet
    if (!profile) {
      logger.info('load_profile_node: no profile found — new user');
      return {
        isNewTopic: true,
        profile: {} as UserProfile,
        curriculumState: {} as CurriculumState,
        currentTopic: '',
        layer3Injections: [],
      };
    }

    // Load Layer 3 items if curriculum exists
    const layer3Injections = curriculumState
      ? await getLayer3Items(state.userId)
      : [];

    // Determine routing flags
    const today = new Date().toISOString().split('T')[0];
    const isNewTopic = !profile.currentTopic || !curriculumState;
    const isEvaluationDue = !isNewTopic &&
      profile.nextEvaluationDue !== null &&
      profile.nextEvaluationDue <= today;
    const isTopicComplete = curriculumState?.topicStatus === 'completed';

    logger.info('load_profile_node completed', {
      userId: state.userId,
      currentTopic: profile.currentTopic,
      isNewTopic,
      isEvaluationDue,
      isTopicComplete,
    });

    return {
      profile,
      curriculumState: curriculumState ?? {} as CurriculumState,
      currentTopic: profile.currentTopic ?? '',
      currentTopicId: profile.currentTopicId ?? null,
      layer3Injections,
      isNewTopic,
      isEvaluationDue,
      isTopicComplete,
    };

  } catch (error) {
    logger.error('load_profile_node failed', { userId: state.userId, error });
    return {
      errors: [...state.errors, `load_profile_node: ${String(error)}`],
      isNewTopic: false,
      isEvaluationDue: false,
    };
  }
}
```

---

### `route_node`

**File:** `src/nodes/route.node.ts`

**Purpose:** Single routing decision. Returns an edge label string. No DB reads. No LLM calls. Pure logic.

**Implementation:**

```typescript
import { LearningGraphState } from '../types/graph-state.types';
import { logger } from '../utils/logger';

export type RouteLabel = 'new_topic' | 'evaluation_due' | 'continue';

export function routeNode(state: LearningGraphState): RouteLabel {
  logger.info('route_node', {
    userId: state.userId,
    isNewTopic: state.isNewTopic,
    isEvaluationDue: state.isEvaluationDue,
    isTopicComplete: state.isTopicComplete,
  });

  // Error in load_profile — cannot route safely
  if (state.errors.length > 0 && !state.profile?.userId) {
    logger.warn('route_node: errors detected, defaulting to continue');
    return 'continue';
  }

  // New topic — no active topic or topic just completed
  if (state.isNewTopic || state.isTopicComplete) {
    return 'new_topic';
  }

  // Evaluation overrides normal teaching on due days
  if (state.isEvaluationDue) {
    return 'evaluation_due';
  }

  // Normal teaching day
  return 'continue';
}
```

---

### `delivery_node`

**File:** `src/nodes/delivery.node.ts`

**Purpose:** Final node before RAG update. Handles the case where upstream nodes failed — always sends something to Telegram. Updates curriculum session status.

**Implementation:**

```typescript
import { sendTelegramMessage } from '../lib/telegram';
import { markSessionDelivered } from '../db/curriculum';
import { logger } from '../utils/logger';
import { LearningGraphState } from '../types/graph-state.types';

export async function deliveryNode(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  logger.info('delivery_node started', {
    userId: state.userId,
    deliveryStatus: state.deliveryStatus,
    errorsCount: state.errors.length,
  });

  try {
    // Case 1 — already delivered by teaching or evaluation node
    if (state.deliveryStatus === 'delivered') {
      logger.info('delivery_node: already delivered, updating curriculum state');

      if (state.todaySession?.sessionId) {
        await markSessionDelivered(
          state.userId,
          state.todaySession.sessionId,
          'delivery_node'
        );
      }
      return {};
    }

    // Case 2 — delivery failed upstream — send fallback
    if (state.deliveryStatus === 'failed' || state.errors.length > 0) {
      logger.warn('delivery_node: upstream failure detected, sending fallback', {
        errors: state.errors,
      });

      await sendTelegramMessage(
        state.userId,
        [
          `⚠️ *LRNR had a hiccup today*`,
          ``,
          `Your session ran into an issue and couldn't be delivered.`,
          ``,
          `I'll try again tomorrow. If this keeps happening, check the GitHub Actions logs.`,
          ``,
          `_Error reference: ${state.errors[0]?.slice(0, 80) ?? 'unknown'}_`,
        ].join('\n')
      );

      return { deliveryStatus: 'failed' };
    }

    // Case 3 — skipped (no session today)
    if (state.deliveryStatus === 'skipped') {
      logger.info('delivery_node: session skipped today');
      return {};
    }

    // Case 4 — delivery_status is still 'pending' — something went wrong in routing
    logger.error('delivery_node: reached with pending status — unexpected state', {
      userId: state.userId,
      state: JSON.stringify(state).slice(0, 200),
    });

    await sendTelegramMessage(
      state.userId,
      `⚠️ *Unexpected state in LRNR* — check logs.`
    );

    return { deliveryStatus: 'failed' };

  } catch (error) {
    logger.error('delivery_node failed', { userId: state.userId, error });
    // Last resort — try plain text
    try {
      await sendTelegramMessage(
        state.userId,
        'LRNR: session delivery failed today. Will retry tomorrow.'
      );
    } catch {
      // Nothing more we can do
    }
    return {
      deliveryStatus: 'failed',
      errors: [...state.errors, `delivery_node: ${String(error)}`],
    };
  }
}
```

---

### `update_rag_node`

**File:** `src/nodes/update-rag.node.ts`

**Purpose:** Final cleanup node. Writes session metadata to RAG. Always runs regardless of delivery status — even failed sessions generate useful signal.

**Implementation:**

```typescript
import { writeToRAG } from '../db/rag';
import { logger } from '../utils/logger';
import { LearningGraphState } from '../types/graph-state.types';

export async function updateRagNode(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  logger.info('update_rag_node started', { userId: state.userId });

  try {
    // Always write delivery status to RAG — even failures are useful signal
    await writeToRAG({
      userId: state.userId,
      content: buildRagSummary(state),
      eventType: 'session_summary',
      topic: state.currentTopic || 'system',
      concept: state.todaySession?.conceptsToCover?.join(', ') ?? 'system',
      dayNumber: state.curriculumState?.currentDay ?? 0,
      sourceAgent: 'update_rag_node',
      confidence: state.deliveryStatus === 'delivered' ? 1.0 : 0.5,
    });

    logger.info('update_rag_node completed', { userId: state.userId });
    return {};

  } catch (error) {
    // RAG write failure is non-fatal — log and continue
    logger.error('update_rag_node failed', { userId: state.userId, error });
    return {};
  }
}

function buildRagSummary(state: LearningGraphState): string {
  if (state.deliveryStatus === 'delivered') {
    return `Session delivered on Day ${state.curriculumState?.currentDay ?? '?'}. ` +
      `Concepts: ${state.todaySession?.conceptsToCover?.join(', ') ?? 'unknown'}. ` +
      `Phase: ${state.todaySession?.phase ?? 'unknown'}. ` +
      `Layer 3 injections: ${state.layer3Injections.length}.`;
  }

  if (state.deliveryStatus === 'failed') {
    return `Session failed on Day ${state.curriculumState?.currentDay ?? '?'}. ` +
      `Errors: ${state.errors.join(' | ')}`;
  }

  return `Session run: status=${state.deliveryStatus}, topic=${state.currentTopic}`;
}
```

---

## Complete Graph Definition

```typescript
// src/graphs/learning-graph.ts

import { StateGraph, END } from '@langchain/langgraph';
import { LearningGraphState, createInitialState } from '../types/graph-state.types';

// Nodes
import { loadProfileNode } from '../nodes/load-profile.node';
import { routeNode, RouteLabel } from '../nodes/route.node';
import { deliveryNode } from '../nodes/delivery.node';
import { updateRagNode } from '../nodes/update-rag.node';

// Agents (as nodes)
import { runArchitectAgent } from '../agents/architect';
import { runCartographerAgent } from '../agents/cartographer';
import { runCurriculumBuilderAgent } from '../agents/curriculum-builder';
import { runTeachingAgent } from '../agents/teaching';
import { runEvaluationAgent } from '../agents/evaluation';

export function buildLearningGraph() {
  const graph = new StateGraph<LearningGraphState>({
    channels: {
      userId:              { value: (x, y) => y ?? x },
      profile:             { value: (x, y) => ({ ...x, ...y }) },
      currentTopic:        { value: (x, y) => y ?? x },
      currentTopicId:      { value: (x, y) => y ?? x },
      curriculumState:     { value: (x, y) => ({ ...x, ...y }) },
      todaySession:        { value: (x, y) => y ?? x },
      layer3Injections:    { value: (x, y) => y ?? x },
      ragContext:          { value: (x, y) => y ?? x },
      topicKnowledgeBase:  { value: (x, y) => y ?? x },
      isNewTopic:          { value: (x, y) => y ?? x },
      isEvaluationDue:     { value: (x, y) => y ?? x },
      isTopicComplete:     { value: (x, y) => y ?? x },
      evaluationResult:    { value: (x, y) => y ?? x },
      deliveryStatus:      { value: (x, y) => y ?? x },
      deliveredMessages:   { value: (x, y) => y ?? x },
      errors:              { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
    },
  });

  // ── Add nodes ──────────────────────────────────────────────────────────────
  graph.addNode('load_profile_node',       loadProfileNode);
  graph.addNode('route_node',              (state) => ({ }));    // routing-only, no state change
  graph.addNode('architect_node',          runArchitectAgent);
  graph.addNode('cartographer_node',       runCartographerAgent);
  graph.addNode('curriculum_builder_node', (state) => runCurriculumBuilderAgent(state, 'initial'));
  graph.addNode('reconcile_node',          (state) => runCurriculumBuilderAgent(state, 'reconcile'));
  graph.addNode('teaching_node',           runTeachingAgent);
  graph.addNode('evaluation_node',         runEvaluationAgent);
  graph.addNode('delivery_node',           deliveryNode);
  graph.addNode('update_rag_node',         updateRagNode);

  // ── Entry point ────────────────────────────────────────────────────────────
  graph.setEntryPoint('load_profile_node');

  // ── Edges from load_profile_node → route_node ──────────────────────────────
  graph.addEdge('load_profile_node', 'route_node');

  // ── Conditional routing from route_node ────────────────────────────────────
  graph.addConditionalEdges(
    'route_node',
    routeNode,                          // function that returns edge label
    {
      new_topic:       'architect_node',
      evaluation_due:  'evaluation_node',
      continue:        'teaching_node',
    }
  );

  // ── Route A — New Topic ────────────────────────────────────────────────────
  graph.addEdge('architect_node',          'cartographer_node');
  graph.addEdge('cartographer_node',       'curriculum_builder_node');
  graph.addEdge('curriculum_builder_node', 'teaching_node');

  // ── Route B — Evaluation Day ───────────────────────────────────────────────
  graph.addEdge('evaluation_node',         'reconcile_node');
  graph.addEdge('reconcile_node',          'teaching_node');

  // ── Route C — Continue (teaching_node is the merge point for all routes) ──
  // (teaching_node receives from Route A, B, and C — all converge here)

  // ── Common tail ───────────────────────────────────────────────────────────
  graph.addEdge('teaching_node',           'delivery_node');
  graph.addEdge('delivery_node',           'update_rag_node');
  graph.addEdge('update_rag_node',         END);

  return graph.compile();
}
```

---

## Workflow Entry Point

```typescript
// src/workflows/daily-learning.ts
// This file is the GitHub Actions entry point

import { buildLearningGraph } from '../graphs/learning-graph';
import { createInitialState } from '../types/graph-state.types';
import { logger } from '../utils/logger';

async function main() {
  const userId = process.env.USER_ID;
  if (!userId) throw new Error('USER_ID environment variable is required');

  logger.info('Daily Learning Workflow started', {
    userId,
    timestamp: new Date().toISOString(),
  });

  const graph = buildLearningGraph();
  const initialState = createInitialState(userId);

  try {
    const finalState = await graph.invoke(initialState, {
      recursionLimit: 25,            // prevent infinite loops
    });

    logger.info('Daily Learning Workflow completed', {
      userId,
      deliveryStatus: finalState.deliveryStatus,
      errorsCount: finalState.errors.length,
      errors: finalState.errors,
    });

    // Exit with error code if delivery failed — GitHub Actions will mark the run as failed
    if (finalState.deliveryStatus === 'failed') {
      process.exit(1);
    }

  } catch (error) {
    logger.error('Daily Learning Workflow crashed', { userId, error });
    process.exit(1);
  }
}

main();
```

---

## GitHub Actions Workflow File

```yaml
# .github/workflows/daily-learning.yml
name: Daily Learning Session

on:
  schedule:
    - cron: '30 1 * * *'     # 7:00 AM IST = 1:30 AM UTC
  workflow_dispatch:           # allow manual trigger from GitHub UI

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build TypeScript
        run: pnpm build

      - name: Run Daily Learning Session
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
          USER_ID: ${{ secrets.USER_ID }}
          NODE_ENV: production
        run: node dist/workflows/daily-learning.js
```

---

## State Channel Merge Strategy

LangGraph requires every state field to declare a merge function. The merge strategy determines what happens when two parallel nodes both write to the same field. This graph has no parallel nodes — it is fully sequential — so merge strategy is simple:

| Field | Merge Strategy | Reason |
|-------|---------------|--------|
| `userId` | last-write-wins | Never changes during a run |
| `profile` | object merge (`{...x, ...y}`) | Nodes may update individual profile fields |
| `currentTopic` | last-write-wins | Set once by Architect or load_profile |
| `curriculumState` | object merge | Multiple nodes update curriculum fields |
| `todaySession` | last-write-wins | Only teaching or evaluation sets this |
| `layer3Injections` | last-write-wins | Loaded once, consumed in teaching |
| `errors` | array concat (`[...x, ...y]`) | All errors must be preserved |
| All others | last-write-wins | Single writer per field |

---

## Error Handling Strategy

The graph never throws. All errors are caught at the node level, appended to `state.errors`, and the graph continues. The `delivery_node` is the safety net — it always runs and always sends something to Telegram.

```typescript
// Pattern every node follows:
try {
  // ... node logic
  return { fieldToUpdate: newValue };
} catch (error) {
  logger.error('node_name failed', { userId: state.userId, error });
  return {
    errors: [...state.errors, `node_name: ${String(error)}`],
    deliveryStatus: 'failed',   // signal delivery_node to send fallback
  };
}
```

**What happens when architect_node fails on a new topic:**
- `errors` gets the architect error
- `deliveryStatus` is set to `'failed'`
- Graph continues to `cartographer_node` — which will also fail because there's no topic brief
- Graph continues to `curriculum_builder_node` — which also fails
- Graph continues to `teaching_node` — which also fails
- Graph reaches `delivery_node` — sees `deliveryStatus: 'failed'`, sends fallback Telegram
- Graph reaches `update_rag_node` — writes failure record

All failures are logged. User always gets a message.

---

## Route A Timing — Why It Takes Longer

On new topic start, the graph runs five agents sequentially. Architect has a multi-turn conversation. Cartographer fetches and processes 15-20 sources. This run can take 10-20 minutes.

**GitHub Actions `timeout-minutes: 20`** handles this. Route C (normal day) completes in 3-5 minutes.

**Important:** On the day a new topic starts, the Architect conversation happens synchronously in the Learning Graph. This means the 7:00 AM delivery will be delayed until the conversation completes. This is expected — communicate this to the user via the Architect Agent's first message.

---

## Testing the Graph Locally

```bash
# Test Route C (normal day — fastest to test)
NODE_ENV=development MOCK_LLM=true pnpm run dev:learning

# Test Route A (new topic — requires real LLM for conversation)
NODE_ENV=development MOCK_LLM=false \
  USER_GOAL="I want to learn databases" \
  pnpm run dev:learning

# Test Route B (evaluation day — set next_evaluation_due to today in DB first)
NODE_ENV=development MOCK_LLM=false pnpm run dev:learning
```

**Manual test checklist:**
- [ ] `load_profile_node` reads profile and sets all three routing flags correctly
- [ ] `route_node` returns correct label for each scenario
- [ ] Route A: all four nodes run in correct sequence
- [ ] Route B: evaluation runs, then reconcile, then teaching
- [ ] Route C: only teaching runs
- [ ] `delivery_node` sends fallback message when `deliveryStatus === 'failed'`
- [ ] `update_rag_node` always runs regardless of delivery status
- [ ] Graph exits with code 1 on failure (GitHub Actions marks run as failed)
- [ ] No node throws — all errors captured in `state.errors`

---

## What This Graph Must NOT Do

- Must NOT run the Research Graph agents (`scout_node`, `news_intelligence_node`, `contradiction_node`). Those belong in the Research Graph.
- Must NOT have parallel node execution. This is a fully sequential graph.
- Must NOT skip `delivery_node` or `update_rag_node` under any circumstances. These are the safety net and the memory — they always run.
- Must NOT hardcode the user ID. Always read from `process.env.USER_ID`.
- Must NOT allow a node to throw uncaught errors. Every node must have a try/catch that returns error state.
- Must NOT call `delivery_node` directly from `load_profile_node` even if the profile fails to load. Always go through `route_node`.