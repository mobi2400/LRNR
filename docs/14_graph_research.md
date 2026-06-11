# LRNR — Graph 02: Research Graph
> **Load alongside all 4 foundation files before coding this graph.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**
> **Also load: 10_AGENT_SCOUT.md, 11_AGENT_CONTRADICTION.md, 12_AGENT_NEWS_INTELLIGENCE.md**

---

## Graph Identity

| Property | Value |
|----------|-------|
| File to create | `src/graphs/research-graph.ts` |
| Entry point | `src/workflows/daily-research.ts` |
| GitHub Actions trigger | `daily-research.yml` — cron `0 20 * * *` (2:00 AM IST = 8:00 PM UTC prev day) |
| Graph type | StateGraph (LangGraph JS) |
| State type | `ResearchGraphState` |
| Avg total runtime | 5-10 minutes |

---

## What This Graph Does — Plain English

The Research Graph is the system's background intelligence engine. It runs every night at 2:00 AM IST — five hours before the Learning Graph fires at 7:00 AM. By the time the user wakes up, all research work is complete and persisted in Supabase. The Learning Graph reads clean, processed data. It never waits for research.

The Research Graph runs three agents. The Scout watches the world — news, GitHub repos, arXiv papers — and routes findings to the appropriate curriculum layers. The News Intelligence Agent scores and curates the daily AI digest and delivers it to Telegram before the learning session begins. The Contradiction Agent processes any conflicts flagged by the Scout or lingering from previous runs.

The key architectural property of this graph is that Scout and News Intelligence share data — they do not independently fetch the same sources. Scout fetches all news sources in its Branch 1, passes findings via state, and News Intelligence consumes them for scoring and digest generation. This avoids double-fetching the same RSS feeds every night.

The Contradiction Agent only runs when there are pending items in the `contradiction_queue`. On most days it will process zero or one contradiction. On the day after a new topic starts (when Cartographer runs), it may process five or six. This is expected.

The graph also runs the nightly reconciliation — Curriculum Builder processes all queued agent updates and updates Layer 2 sessions from Day N+2 onwards. This is a separate node that runs at the end of the graph after Scout and News Intelligence have added their findings to the queue.

---

## State Type — Full Specification

```typescript
// src/types/graph-state.types.ts — add to existing file

export interface ResearchGraphState {
  // Identity
  userId: string;

  // Profile — loaded at graph start
  profile: UserProfile;
  currentTopic: string;
  currentTopicId: string | null;

  // Scout outputs — passed to News Intelligence and Contradiction nodes
  scoutResults: ScoredFinding[];
  newsBranchFindings: RawFinding[];     // subset of scoutResults — branch: 'news'
  topicBranchFindings: RawFinding[];    // subset — branch: 'topic_watch'
  paperBranchFindings: RawFinding[];    // subset — branch: 'paper_watch'

  // Contradiction outputs
  contradictionsProcessed: number;
  contradictionsRouted: ContradictionRoutingResult[];

  // Layer queues populated during this run — for reconciliation
  layer3Queue: Layer3Item[];
  layer2Queue: AgentUpdateItem[];
  knowledgeBaseUpdates: number;

  // News Intelligence outputs
  digestItemsDelivered: number;
  digestDeliveredAt: string | null;

  // Reconciliation outputs
  sessionsUpdated: number;
  queueItemsProcessed: number;

  // Error tracking
  errors: string[];
}

export function createInitialResearchState(userId: string): ResearchGraphState {
  return {
    userId,
    profile: {} as UserProfile,
    currentTopic: '',
    currentTopicId: null,
    scoutResults: [],
    newsBranchFindings: [],
    topicBranchFindings: [],
    paperBranchFindings: [],
    contradictionsProcessed: 0,
    contradictionsRouted: [],
    layer3Queue: [],
    layer2Queue: [],
    knowledgeBaseUpdates: 0,
    digestItemsDelivered: 0,
    digestDeliveredAt: null,
    sessionsUpdated: 0,
    queueItemsProcessed: 0,
    errors: [],
  };
}
```

---

## Node Inventory

| Node Name | File | Agent Called | Notes |
|-----------|------|-------------|-------|
| `load_profile_node` | `src/nodes/load-profile.node.ts` | — (DB reads) | Shared with Learning Graph |
| `scout_node` | `src/agents/scout.ts` | Scout Agent | Runs three branches internally |
| `news_intelligence_node` | `src/agents/news-intelligence.ts` | News Intelligence | Consumes scout news branch results |
| `contradiction_node` | `src/agents/contradiction.ts` | Contradiction Agent | Conditional — only runs if queue has items |
| `reconciliation_node` | `src/nodes/reconciliation.node.ts` | Curriculum Builder (reconcile) | Processes agent_update_queue nightly |
| `persist_node` | `src/nodes/persist.node.ts` | — (final DB writes) | Writes run summary |

---

## Graph Flow — Visual

```
START
  │
  ▼
load_profile_node
  │  Reads: user_profile, active curriculum state
  │  Sets: profile, currentTopic, currentTopicId
  │
  ▼
scout_node
  │  Runs internally: news_fetch_branch, topic_watch_branch, paper_watch_branch
  │  Writes to DB: layer_3, agent_update_queue, topic_knowledge_base, contradiction_queue
  │  Sets in state: scoutResults, newsBranchFindings, layer3Queue, layer2Queue
  │
  ▼
news_intelligence_node
  │  Reads from state: newsBranchFindings (Scout's news results)
  │  Scores, ranks, writes digest items
  │  Delivers digest to Telegram
  │  Writes to DB: news_items, layer_3 (connected items)
  │  Sets in state: digestItemsDelivered, digestDeliveredAt
  │
  ▼
contradiction_node (conditional)
  │  Condition: contradiction_queue has pending items
  │  Reads from DB: contradiction_queue
  │  Classifies and routes each contradiction
  │  Writes to DB: layer_3 or agent_update_queue, rag_memory
  │  Sets in state: contradictionsProcessed
  │
  ▼
reconciliation_node
  │  Reads from DB: agent_update_queue (all pending items)
  │  Applies priority order, resolves conflicts
  │  Writes to DB: curriculum_state.layer_2 (N+2 sessions)
  │  Sets in state: sessionsUpdated, queueItemsProcessed
  │
  ▼
persist_node
  │  Writes run summary to RAG
  │  Logs completion metrics
  │
  ▼
END
```

---

## Conditional Node Logic

The Contradiction Agent only runs when there is work to do. This avoids unnecessary LLM calls on quiet nights.

```typescript
// Conditional edge function
function shouldRunContradiction(state: ResearchGraphState): 'run_contradiction' | 'skip_contradiction' {
  // Check if Scout flagged any contradictions in this run
  const scoutFoundContradictions = state.scoutResults.some(r => r.isContradiction);

  // Check if there are pre-existing pending contradictions in DB
  // (This is checked asynchronously in the node itself, not here)
  // We always run if Scout found any — the node handles the "nothing to do" case gracefully
  if (scoutFoundContradictions) return 'run_contradiction';

  // For pre-existing queue items — the contradiction_node checks the DB on entry
  // We use a state flag set by load_profile_node
  if (state.profile?.hasPendingContradictions) return 'run_contradiction';

  return 'skip_contradiction';
}
```

**Note:** `hasPendingContradictions` is a transient flag set by `load_profile_node` after checking `contradiction_queue` count. It is not stored in `user_profile` permanently.

---

## Node Specifications

### `load_profile_node` (Research Graph variant)

The same `loadProfileNode` function from Learning Graph is reused. However, for the Research Graph, it additionally checks the contradiction queue count and sets a flag.

```typescript
// src/nodes/load-profile.node.ts — extend the existing function

export async function loadProfileNode(
  state: LearningGraphState | ResearchGraphState
): Promise<Partial<typeof state>> {
  // ... existing implementation ...

  // Additional for Research Graph
  const pendingContradictionCount = await getPendingContradictionCount(userId);

  return {
    // ... existing returns ...
    profile: {
      ...profile,
      hasPendingContradictions: pendingContradictionCount > 0,
    },
  };
}
```

---

### `reconciliation_node`

**File:** `src/nodes/reconciliation.node.ts`

**Purpose:** Nightly Curriculum Builder reconciliation. Reads all pending queue items, applies priority order, updates Layer 2 sessions from Day N+2.

**Implementation:**

```typescript
import { runCurriculumBuilderAgent } from '../agents/curriculum-builder';
import { logger } from '../utils/logger';
import { ResearchGraphState } from '../types/graph-state.types';

export async function reconciliationNode(
  state: ResearchGraphState
): Promise<Partial<ResearchGraphState>> {
  logger.info('reconciliation_node started', { userId: state.userId });

  try {
    // Reuse Curriculum Builder agent in reconcile mode
    // It reads agent_update_queue directly from DB
    const result = await runCurriculumBuilderAgent(
      state as any,    // ResearchGraphState compatible subset
      'reconcile'
    );

    logger.info('reconciliation_node completed', {
      userId: state.userId,
      sessionsUpdated: result.sessionsUpdated ?? 0,
      queueItemsProcessed: result.queueItemsProcessed ?? 0,
    });

    return {
      sessionsUpdated: result.sessionsUpdated ?? 0,
      queueItemsProcessed: result.queueItemsProcessed ?? 0,
    };

  } catch (error) {
    logger.error('reconciliation_node failed', { userId: state.userId, error });
    return {
      errors: [...state.errors, `reconciliation_node: ${String(error)}`],
    };
  }
}
```

---

### `persist_node`

**File:** `src/nodes/persist.node.ts`

**Purpose:** Final node. Writes a run summary to RAG so the system has a record of what happened overnight. Logs key metrics.

```typescript
import { writeToRAG } from '../db/rag';
import { logger } from '../utils/logger';
import { ResearchGraphState } from '../types/graph-state.types';

export async function persistNode(
  state: ResearchGraphState
): Promise<Partial<ResearchGraphState>> {
  logger.info('persist_node started', { userId: state.userId });

  const summary = [
    `Research run completed.`,
    `Scout findings: ${state.scoutResults.length} total,`,
    `  ${state.layer3Queue.length} routed to Layer 3,`,
    `  ${state.layer2Queue.length} routed to queue.`,
    `Digest items delivered: ${state.digestItemsDelivered}.`,
    `Contradictions processed: ${state.contradictionsProcessed}.`,
    `Curriculum sessions updated: ${state.sessionsUpdated}.`,
    `Queue items processed: ${state.queueItemsProcessed}.`,
    state.errors.length > 0 ? `Errors: ${state.errors.join(' | ')}` : 'No errors.',
  ].join(' ');

  try {
    await writeToRAG({
      userId: state.userId,
      content: summary,
      eventType: 'session_summary',
      topic: state.currentTopic || 'system',
      concept: 'research_run',
      dayNumber: null,
      sourceAgent: 'persist_node',
      confidence: 1.0,
    });
  } catch (error) {
    // Non-fatal — log and continue
    logger.error('persist_node: RAG write failed', { error });
  }

  logger.info('Research run summary', {
    userId: state.userId,
    scoutResults: state.scoutResults.length,
    layer3Items: state.layer3Queue.length,
    layer2Items: state.layer2Queue.length,
    digestItems: state.digestItemsDelivered,
    contradictions: state.contradictionsProcessed,
    sessionsUpdated: state.sessionsUpdated,
    errors: state.errors.length,
  });

  return {};
}
```

---

## Complete Graph Definition

```typescript
// src/graphs/research-graph.ts

import { StateGraph, END } from '@langchain/langgraph';
import { ResearchGraphState, createInitialResearchState } from '../types/graph-state.types';

// Nodes
import { loadProfileNode } from '../nodes/load-profile.node';
import { reconciliationNode } from '../nodes/reconciliation.node';
import { persistNode } from '../nodes/persist.node';

// Agents as nodes
import { runScoutAgent } from '../agents/scout';
import { runNewsIntelligenceAgent } from '../agents/news-intelligence';
import { runContradictionAgent } from '../agents/contradiction';

export function buildResearchGraph() {
  const graph = new StateGraph<ResearchGraphState>({
    channels: {
      userId:                   { value: (x, y) => y ?? x },
      profile:                  { value: (x, y) => ({ ...x, ...y }) },
      currentTopic:             { value: (x, y) => y ?? x },
      currentTopicId:           { value: (x, y) => y ?? x },
      scoutResults:             { value: (x, y) => y ?? x },
      newsBranchFindings:       { value: (x, y) => y ?? x },
      topicBranchFindings:      { value: (x, y) => y ?? x },
      paperBranchFindings:      { value: (x, y) => y ?? x },
      contradictionsProcessed:  { value: (x, y) => y ?? x },
      contradictionsRouted:     { value: (x, y) => y ?? x },
      layer3Queue:              { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
      layer2Queue:              { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
      knowledgeBaseUpdates:     { value: (x, y) => (x ?? 0) + (y ?? 0) },
      digestItemsDelivered:     { value: (x, y) => y ?? x },
      digestDeliveredAt:        { value: (x, y) => y ?? x },
      sessionsUpdated:          { value: (x, y) => y ?? x },
      queueItemsProcessed:      { value: (x, y) => y ?? x },
      errors:                   { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
    },
  });

  // ── Add nodes ──────────────────────────────────────────────────────────────
  graph.addNode('load_profile_node',      loadProfileNode);
  graph.addNode('scout_node',             runScoutAgent);
  graph.addNode('news_intelligence_node', runNewsIntelligenceAgent);
  graph.addNode('contradiction_node',     runContradictionAgent);
  graph.addNode('reconciliation_node',    reconciliationNode);
  graph.addNode('persist_node',           persistNode);

  // ── Entry point ────────────────────────────────────────────────────────────
  graph.setEntryPoint('load_profile_node');

  // ── Sequential edges ───────────────────────────────────────────────────────
  graph.addEdge('load_profile_node',      'scout_node');
  graph.addEdge('scout_node',             'news_intelligence_node');

  // ── Conditional edge: contradiction ───────────────────────────────────────
  graph.addConditionalEdges(
    'news_intelligence_node',
    shouldRunContradiction,
    {
      run_contradiction:  'contradiction_node',
      skip_contradiction: 'reconciliation_node',
    }
  );

  graph.addEdge('contradiction_node',     'reconciliation_node');
  graph.addEdge('reconciliation_node',    'persist_node');
  graph.addEdge('persist_node',           END);

  return graph.compile();
}
```

---

## Workflow Entry Point

```typescript
// src/workflows/daily-research.ts

import { buildResearchGraph } from '../graphs/research-graph';
import { createInitialResearchState } from '../types/graph-state.types';
import { logger } from '../utils/logger';

async function main() {
  const userId = process.env.USER_ID;
  if (!userId) throw new Error('USER_ID environment variable is required');

  logger.info('Daily Research Workflow started', {
    userId,
    timestamp: new Date().toISOString(),
  });

  const graph = buildResearchGraph();
  const initialState = createInitialResearchState(userId);

  try {
    const finalState = await graph.invoke(initialState, {
      recursionLimit: 15,
    });

    logger.info('Daily Research Workflow completed', {
      userId,
      scoutResults: finalState.scoutResults.length,
      digestItems: finalState.digestItemsDelivered,
      contradictions: finalState.contradictionsProcessed,
      sessionsUpdated: finalState.sessionsUpdated,
      errors: finalState.errors,
    });

    // Non-zero errors = partial failure — still exit 0 (research is best-effort)
    // Only exit 1 on complete catastrophic failure
    if (finalState.digestItemsDelivered === 0 && finalState.errors.length > 3) {
      logger.error('Research workflow: too many errors, marking as failed');
      process.exit(1);
    }

  } catch (error) {
    logger.error('Daily Research Workflow crashed', { userId, error });
    process.exit(1);
  }
}

main();
```

---

## GitHub Actions Workflow File

```yaml
# .github/workflows/daily-research.yml
name: Daily Research & News Digest

on:
  schedule:
    - cron: '0 20 * * *'      # 2:00 AM IST = 8:00 PM UTC (previous calendar day)
  workflow_dispatch:

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

      - name: Run Daily Research
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
          USER_ID: ${{ secrets.USER_ID }}
          NODE_ENV: production
        run: node dist/workflows/daily-research.js
```

---

## Nightly Reconcile — Separate Workflow

The nightly reconciliation can optionally run as its own separate lightweight workflow at midnight rather than being embedded in the Research Graph. This gives more control over timing and allows retrying reconciliation independently.

```yaml
# .github/workflows/nightly-reconcile.yml
name: Nightly Curriculum Reconciliation

on:
  schedule:
    - cron: '30 18 * * *'     # 12:00 AM IST = 6:30 PM UTC
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 10

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

      - name: Run Nightly Reconciliation
        env:
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          USER_ID: ${{ secrets.USER_ID }}
          NODE_ENV: production
        run: node dist/workflows/nightly-reconcile.js
```

```typescript
// src/workflows/nightly-reconcile.ts

import { runCurriculumBuilderAgent } from '../agents/curriculum-builder';
import { getProfile } from '../db/profile';
import { logger } from '../utils/logger';

async function main() {
  const userId = process.env.USER_ID;
  if (!userId) throw new Error('USER_ID required');

  logger.info('Nightly Reconcile started', { userId });

  const profile = await getProfile(userId);
  if (!profile) {
    logger.warn('No profile found — skipping reconciliation');
    return;
  }

  // Build minimal state for Curriculum Builder reconcile mode
  const minimalState = {
    userId,
    profile,
    currentTopic: profile.currentTopic ?? '',
    errors: [],
  };

  await runCurriculumBuilderAgent(minimalState as any, 'reconcile');
  logger.info('Nightly Reconcile completed', { userId });
}

main();
```

**Whether to include reconciliation inside Research Graph or as a separate workflow:** Both work. Separate workflow is recommended because it can be retried independently and runs 1.5 hours before the Research workflow, giving more time for the queue to be processed before Scout adds new items.

---

## Data Flow Between Scout and News Intelligence

The most important data handoff in this graph:

```typescript
// Scout sets this in state after running:
return {
  scoutResults: allScoredFindings,
  newsBranchFindings: allScoredFindings.filter(f => f.branch === 'news'),
  topicBranchFindings: allScoredFindings.filter(f => f.branch === 'topic_watch'),
  paperBranchFindings: allScoredFindings.filter(f => f.branch === 'paper_watch'),
  layer3Queue: newLayer3Items,
  layer2Queue: newQueueItems,
};

// News Intelligence reads this from state:
const newsBranchFindings = state.newsBranchFindings;
// If empty — falls back to independent fetch
```

This avoids fetching RSS feeds twice (once in Scout, once in News Intelligence). Both use the same raw items. Scout scores them for curriculum relevance. News Intelligence scores them for digest inclusion. Different scoring dimensions, same source data.

---

## Timing Diagram

```
11:30 PM IST  Nightly Reconcile runs
              └── Curriculum Builder processes agent_update_queue
              └── Updates Layer 2 sessions for N+2 days onwards
              └── Completes in ~2 minutes

2:00 AM IST   Research Graph runs
              └── load_profile_node (~5 seconds)
              └── scout_node (~3-5 minutes, 3 parallel branches)
              └── news_intelligence_node (~2-3 minutes)
              └── contradiction_node (~1-2 minutes, if needed)
              └── reconciliation_node (~30 seconds, catches late queue items)
              └── persist_node (~5 seconds)
              └── Total: ~8-12 minutes
              └── News digest delivered to Telegram at ~2:10 AM IST

7:00 AM IST   Learning Graph runs
              └── Reads clean data — everything already in Supabase
              └── Layer 3 queue populated by Research Graph
              └── News items already delivered
              └── Curriculum already reconciled
              └── Total: ~3-5 minutes
              └── Learning session delivered at ~7:05 AM IST
```

---

## State Channel Merge — Research Graph Specifics

Two fields use array concatenation because multiple nodes write to them:

```typescript
// layer3Queue and layer2Queue accumulate items from both Scout and News Intelligence
layer3Queue: { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
layer2Queue: { value: (x, y) => [...(x ?? []), ...(y ?? [])] },

// knowledgeBaseUpdates accumulates counts
knowledgeBaseUpdates: { value: (x, y) => (x ?? 0) + (y ?? 0) },

// errors accumulate from all nodes
errors: { value: (x, y) => [...(x ?? []), ...(y ?? [])] },
```

All other fields use last-write-wins since only one node writes to them.

---

## Error Handling Strategy

Research Graph errors are treated differently from Learning Graph errors. Research is best-effort. Missing a day of research is unpleasant but not critical — the Learning Graph can still deliver a session using existing Knowledge Base data.

**Individual node failures:**
- `scout_node` failure → news_intelligence falls back to independent fetch. Log prominently.
- `news_intelligence_node` failure → no digest today. Log prominently. User will notice missing digest.
- `contradiction_node` failure → contradictions remain pending. Will process next run. Not critical.
- `reconciliation_node` failure → queue items remain pending. Will process next run. Not critical.

**Exit code strategy:**
```typescript
// Research exits with code 0 (success) if:
// - Digest was delivered (primary user-facing output)
// - OR errors are minor (< 3) even if digest not delivered

// Research exits with code 1 (failure) if:
// - Digest not delivered AND 3+ errors
// - Complete crash before any node runs
```

---

## Testing the Graph Locally

```bash
# Full research run — requires all API keys
MOCK_LLM=false pnpm run dev:research

# Test with mock LLM (tests graph structure, not agent quality)
MOCK_LLM=true pnpm run dev:research

# Test reconciliation only
pnpm run dev:reconcile
```

**Manual test checklist:**
- [ ] `load_profile_node` loads profile and sets `hasPendingContradictions` correctly
- [ ] `scout_node` runs all three branches and sets state correctly
- [ ] `newsBranchFindings` in state contains only `branch: 'news'` items
- [ ] `news_intelligence_node` reads `newsBranchFindings` from state (not re-fetching)
- [ ] `news_intelligence_node` falls back to independent fetch when state is empty
- [ ] Contradiction node skips when `hasPendingContradictions` is false
- [ ] Contradiction node runs when Scout flagged contradictions
- [ ] `reconciliation_node` reads queue and updates Layer 2 correctly
- [ ] `persist_node` always runs and writes run summary
- [ ] Layer 3 items from both Scout and News Intelligence accumulate correctly (not overwrite)
- [ ] Total runtime under 15 minutes for normal days

---

## What This Graph Must NOT Do

- Must NOT run Learning Graph agents (`architect_node`, `cartographer_node`, `curriculum_builder_node` initial mode, `teaching_node`, `evaluation_node`). These belong in the Learning Graph.
- Must NOT deliver the learning session to Telegram. Only the news digest is delivered from this graph.
- Must NOT modify `curriculum_state.layer_1`. Research agents have no authority over Layer 1.
- Must NOT modify `curriculum_state.layer_2` sessions for today or tomorrow. Only `reconciliation_node` touches Layer 2, and it enforces the N+2 rule.
- Must NOT block on any single source failure. Research is best-effort — individual failures must not stop the run.
- Must NOT exit with code 1 just because the contradiction or reconciliation nodes failed. Those are non-critical. Only exit 1 if the digest completely fails AND multiple other errors occurred.
- Must NOT run at the same time as the Learning Graph. The 5-hour gap between Research (2 AM) and Learning (7 AM) is intentional and must be maintained.
- Must NOT re-fetch RSS sources in News Intelligence if Scout has already fetched them. Always consume from `state.newsBranchFindings` first.