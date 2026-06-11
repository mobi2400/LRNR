# LRNR — Agent 03: Curriculum Builder Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/curriculum-builder.ts` |
| LangGraph node name | `curriculum_builder_node` |
| Exported function | `runCurriculumBuilderAgent(state: LearningGraphState, mode: 'initial' \| 'reconcile'): Promise<Partial<LearningGraphState>>` |
| LLM model | `fastLLM()` — `llama-3.1-8b-instant` |
| Trigger 1 | After `cartographer_node` completes — `mode: 'initial'` |
| Trigger 2 | Nightly reconciliation workflow — `mode: 'reconcile'` |
| Runs in graph | Learning Graph (initial) + Nightly Reconcile Workflow (reconcile) |
| Position | Third node after Cartographer on Route A. Also runs on Route B after Evaluation. |
| Avg runtime | 2-4 minutes (initial), 1-2 minutes (reconcile) |

---

## What This Agent Does — Plain English

The Curriculum Builder is the architect of the learning experience itself. It takes everything the Cartographer found — the full Topic Knowledge Base — and everything it knows about the user from the Profile Engine and RAG, and produces a personalised, sequenced, output-driven learning path.

The Curriculum Builder has two distinct operating modes that must never be confused.

**Initial mode** runs once when a new topic starts. It reads the Topic Knowledge Base and the user's profile and constructs the complete Layer 2 — all daily sessions from Day 1 to estimated completion. It performs a topological sort of the concept dependency graph filtered through the user's learning sequence preference. It assigns depth levels per concept, writes real example references from the Knowledge Base into each session, sets explicit mastery objectives, and ensures every session has a connection to prior learning and a preview of what comes next.

**Reconcile mode** runs nightly. It reads the `agent_update_queue` — the accumulated requests from Evaluation, Scout, Contradiction, and News Intelligence agents — applies the strict priority order, resolves conflicts, and updates Layer 2 sessions from Day N+2 onwards. It never touches today's or tomorrow's sessions. It is the system's stability guarantee.

The Curriculum Builder is also responsible for setting `next_evaluation_due` on the user profile — determining exactly when the Evaluation Agent should run based on curriculum position and learning velocity.

---

## Inputs

### Mode: Initial

```typescript
// From LangGraph state
{
  userId: string;
  currentTopic: string;
  profile: UserProfile;
}

// From database
const topicBrief    = await getTopicBrief(userId, currentTopic);
const knowledgeBase = await getTopicKnowledgeBase(userId, currentTopic);
const ragContext    = await queryRAG(userId, {
  topic: currentTopic,
  eventTypes: ['misconception_detected', 'gap_detected', 'onboarding_response'],
  limit: 20,
});
```

### Mode: Reconcile

```typescript
// From database only — no LangGraph state in nightly workflow
const userId            = process.env.USER_ID!;
const curriculumState   = await getActiveCurriculumState(userId);
const pendingUpdates    = await getPendingQueueItems(userId);  // from agent_update_queue
const profile           = await getProfile(userId);
```

---

## Outputs

### Mode: Initial — Layer 2 Sessions → `curriculum_state.layer_2`

```typescript
// Written via updateCurriculumLayer2(userId, topicId, sessions, 'curriculum_builder')
// from src/db/curriculum.ts

interface Layer2Session {
  sessionId: string;               // uuid generated here
  dayNumber: number;               // 1, 2, 3...
  topicId: string;
  phase: Phase;                    // where this session sits in the 7-phase sequence
  conceptsToCover: string[];       // 1-3 concepts max per session
  depthLevel: DepthLevel;          // matches topicBrief.depthRequired for this concept
  realExampleRef: string;          // ID of ProductionExample from knowledge base
  codeSnippetRef: string | null;   // ID of CodePattern from knowledge base (code phase only)
  connectionToPrior: string;       // explicit: "This connects to X from Day Y because..."
  tomorrowPreview: string;         // one sentence: what comes next and why it matters
  evaluationDue: boolean;          // true every 2-3 days
  status: 'pending';               // always pending when created
  lastModifiedBy: 'curriculum_builder';
  scheduledFor: string;            // ISO date: today + dayNumber - 1
}

type Phase = 'fundamentals' | 'architecture' | 'internals' | 'production' | 'tradeoffs' | 'code' | 'visuals';
type DepthLevel = 'skim' | 'working' | 'deep' | 'expert';
```

### Mode: Initial — Profile Update

```typescript
// Sets next_evaluation_due after initial curriculum is built
await updateCurriculumPosition(userId, {
  currentTopic: topicSlug,
  curriculumPosition: 0,
  nextEvaluationDue: calculateFirstEvaluationDate(),  // Day 3 always
}, 'curriculum_builder_node');
```

### Mode: Reconcile — Updated Layer 2 Sessions

```typescript
// Updates existing Layer 2 sessions in place
// Only sessions with dayNumber > currentDay + 1 may be modified
// Writes processed status to agent_update_queue items
```

---

## Initial Mode — Full Step-by-Step Logic

### Step 1 — Concept Ordering (Topological Sort)

Read all concepts from `topicBrief.conceptOutline`. Each concept has a `phase` field placing it in the 7-phase learning sequence. Sort by phase first, then by internal dependency within each phase.

```typescript
const PHASE_ORDER: Record<Phase, number> = {
  fundamentals: 1,
  architecture: 2,
  internals:    3,
  production:   4,
  tradeoffs:    5,
  code:         6,
  visuals:      7,
};

function sortConceptsByPhase(concepts: ConceptOutlineEntry[]): ConceptOutlineEntry[] {
  return [...concepts].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
}
```

### Step 2 — Adjust For Known Concepts

Check each concept against `profile.knowledgeDepthMap`. If a concept is marked `deep` or `expert`, reduce its estimated time:

```typescript
function adjustDepthForKnowledge(
  concept: ConceptOutlineEntry,
  knowledgeMap: Record<string, KnowledgeDepthEntry>
): ConceptOutlineEntry {
  const known = knowledgeMap[concept.concept];
  if (!known) return concept;

  if (known.depth === 'expert') {
    return { ...concept, depth: 'skim', adjustedReason: 'user confirmed expert' };
  }
  if (known.depth === 'deep') {
    return { ...concept, depth: 'working', adjustedReason: 'user confirmed deep knowledge' };
  }
  return concept;
}
```

**Important:** Even `expert`-level known concepts get at least 1 day (skim) — never skip entirely. The Evaluation Agent needs to verify the claim.

### Step 3 — Assign Misconception Remediation

For each active misconception in the RAG (detected during onboarding), find the earliest session where the underlying concept appears and insert a remediation note:

```typescript
async function assignMisconceptionRemediation(
  sessions: Layer2Session[],
  userId: string,
  topicSlug: string
): Promise<Layer2Session[]> {
  const misconceptions = await queryRAG(userId, {
    topic: topicSlug,
    eventType: 'misconception_detected',
    isResolved: false,
  });

  for (const misconception of misconceptions) {
    const targetSession = sessions.find(s =>
      s.conceptsToCover.some(c => c.toLowerCase().includes(misconception.concept.toLowerCase()))
    );
    if (targetSession) {
      targetSession.misconceptionToAddress = misconception.content;
    }
  }
  return sessions;
}
```

### Step 4 — Session Packing

Group concepts into sessions. Rules:
- Maximum 2-3 concepts per session
- Never split a concept across sessions if it can fit in one
- Fundamentals phase: 1 concept per session — foundation is sacred
- Code phase: 1 concept per session — code needs full focus
- Architecture/production/tradeoffs: 2 concepts per session maximum

```typescript
function packConceptsIntoSessions(
  concepts: ConceptOutlineEntry[],
  estimatedDays: number
): ConceptGroup[] {
  const sessions: ConceptGroup[] = [];
  let i = 0;

  while (i < concepts.length) {
    const concept = concepts[i];

    // Fundamentals and code always get their own session
    if (concept.phase === 'fundamentals' || concept.phase === 'code') {
      sessions.push({ concepts: [concept], phase: concept.phase });
      i++;
      continue;
    }

    // Try to pair with next concept if same phase and fits in time budget
    const next = concepts[i + 1];
    if (next && next.phase === concept.phase && sessions.length < estimatedDays) {
      sessions.push({ concepts: [concept, next], phase: concept.phase });
      i += 2;
      continue;
    }

    sessions.push({ concepts: [concept], phase: concept.phase });
    i++;
  }

  return sessions;
}
```

### Step 5 — Build Session Objects via LLM

For each concept group, call the LLM to produce the full session object with real references from the Knowledge Base:

```typescript
export function sessionBuildPrompt(
  conceptGroup: ConceptGroup,
  dayNumber: number,
  topicBrief: TopicBrief,
  knowledgeBase: TopicKnowledgeBase,
  priorSession: Layer2Session | null,
  upcomingConcept: ConceptOutlineEntry | null,
  userProfile: UserProfile
): string {
  // Find relevant production example from knowledge base
  const relevantExample = findRelevantExample(
    conceptGroup.concepts,
    knowledgeBase.productionExamples
  );

  // Find relevant code pattern (for code phase)
  const relevantCode = conceptGroup.phase === 'code'
    ? findRelevantCodePattern(conceptGroup.concepts, knowledgeBase.codePatterns)
    : null;

  return `Build a learning session object for Day ${dayNumber} of a ${topicBrief.topicName} curriculum.

USER CONTEXT:
- Goal: ${topicBrief.whyLearning}
- Time per day: ${userProfile.timeCommitmentMins} minutes
- Depth required: ${topicBrief.depthRequired}

SESSION CONCEPTS: ${conceptGroup.concepts.map(c => c.concept).join(', ')}
PHASE: ${conceptGroup.phase}
PRIOR SESSION: ${priorSession ? `Day ${priorSession.dayNumber} covered: ${priorSession.conceptsToCover.join(', ')}` : 'This is Day 1'}
NEXT CONCEPT: ${upcomingConcept?.concept ?? 'This is the final session'}

AVAILABLE PRODUCTION EXAMPLE:
${relevantExample ? JSON.stringify(relevantExample) : 'None found — use a general example'}

AVAILABLE CODE PATTERN:
${relevantCode ? JSON.stringify(relevantCode) : 'Not applicable for this phase'}

Return JSON only, no other text:
{
  "conceptsToCover": string[],
  "depthLevel": "skim|working|deep|expert",
  "realExampleRef": string,
  "codeSnippetRef": string | null,
  "connectionToPrior": string,
  "tomorrowPreview": string,
  "sessionSummary": string,
  "estimatedMinutes": number,
  "keyLearningOutcome": string
}`;
}
```

### Step 6 — Set Evaluation Schedule

Evaluations run every 2-3 days. Set `evaluationDue: true` on sessions at regular intervals:

```typescript
function markEvaluationSessions(sessions: Layer2Session[]): Layer2Session[] {
  return sessions.map((session, index) => ({
    ...session,
    evaluationDue: (index + 1) % 3 === 0,  // every 3rd session
  }));
}
```

---

## Reconcile Mode — Full Step-by-Step Logic

### Step 1 — Load Context

```typescript
const currentDay      = curriculumState.currentDay;
const minModifiableDay = currentDay + 2;  // CRITICAL: never touch today or tomorrow
const pendingItems    = await getPendingQueueItems(userId);
const layer2Sessions  = curriculumState.layer_2 as Layer2Session[];
```

### Step 2 — Group By Priority

```typescript
const grouped = {
  priority1: pendingItems.filter(i => i.priority === 1),  // evaluation gaps
  priority2: pendingItems.filter(i => i.priority === 2),  // scout findings
  priority3: pendingItems.filter(i => i.priority === 3),  // contradiction resolutions
  priority4: pendingItems.filter(i => i.priority === 4),  // news connections
};
```

### Step 3 — Process Priority 1 (Evaluation Gaps) First

For each evaluation gap, find the earliest modifiable session that covers the related concept and insert remediation:

```typescript
async function processEvaluationGap(
  gap: AgentUpdateItem,
  sessions: Layer2Session[],
  minModifiableDay: number
): Promise<{ updatedSessions: Layer2Session[]; handled: boolean }> {
  const gapContent = gap.content as EvaluationGapContent;

  // Find earliest session after minModifiableDay that covers related concept
  const targetSession = sessions.find(s =>
    s.dayNumber >= minModifiableDay &&
    s.status === 'pending' &&
    s.conceptsToCover.some(c =>
      c.toLowerCase().includes(gapContent.concept.toLowerCase())
    )
  );

  if (targetSession) {
    // Inject remediation into session's connection note
    targetSession.misconceptionToAddress = gapContent.remediationPlan;
    targetSession.lastModifiedBy = 'curriculum_builder';
    return { updatedSessions: sessions, handled: true };
  }

  // If concept not in upcoming sessions — insert a remediation session
  // Find the first available slot after minModifiableDay
  const insertAfterDay = minModifiableDay;
  const remediationSession = buildRemediationSession(gapContent, insertAfterDay + 1, gap);
  sessions = insertSession(sessions, remediationSession, insertAfterDay + 1);
  return { updatedSessions: sessions, handled: true };
}
```

### Step 4 — Process Priority 2 (Scout Findings)

Scout findings enrich upcoming sessions — they add context from new developments:

```typescript
async function processScoutFinding(
  finding: AgentUpdateItem,
  sessions: Layer2Session[],
  minModifiableDay: number
): Promise<Layer2Session[]> {
  const scoutContent = finding.content as ScoutFindingContent;

  // Find the most relevant upcoming session
  const targetSession = sessions.find(s =>
    s.dayNumber >= minModifiableDay &&
    s.status === 'pending' &&
    s.conceptsToCover.some(c =>
      scoutContent.relevanceToConcept.toLowerCase().includes(c.toLowerCase())
    )
  );

  if (targetSession) {
    // Add as a layer 3 note reference — don't change session content directly
    targetSession.scoutFindingRef = scoutContent.findingId;
  }
  return sessions;
}
```

### Step 5 — Process Priority 3 and 4

Priority 3 (contradiction resolutions) and Priority 4 (news connections) follow the same pattern — find the relevant session and add a reference. They do not restructure sessions.

### Step 6 — Conflict Resolution

When two updates target the same session:

```typescript
function resolveConflicts(updates: SessionUpdate[]): SessionUpdate {
  // Priority 1 always wins
  const p1 = updates.find(u => u.priority === 1);
  if (p1) return p1;

  // For same priority — merge if possible, first-in wins if not
  return updates[0];
}
```

### Step 7 — Write Updated Sessions

```typescript
await updateCurriculumLayer2(
  userId,
  topicId,
  updatedSessions,
  'curriculum_builder'
);

// Mark all processed queue items as done
await markQueueItemsProcessed(userId, processedItemIds);
```

---

## Prompts File Structure

All prompts live in `src/prompts/curriculum-builder.prompts.ts`:

```typescript
export function sessionBuildPrompt(
  conceptGroup: ConceptGroup,
  dayNumber: number,
  topicBrief: TopicBrief,
  knowledgeBase: TopicKnowledgeBase,
  priorSession: Layer2Session | null,
  upcomingConcept: ConceptOutlineEntry | null,
  userProfile: UserProfile
): string { ... }

export function remediationSessionPrompt(
  gap: EvaluationGapContent,
  dayNumber: number
): string { ... }

export function reconcileSummaryPrompt(
  processedItems: AgentUpdateItem[],
  updatedSessionCount: number
): string { ... }
```

---

## Database Functions Required

These must exist in `src/db/` before coding this agent:

| Function | File | Notes |
|----------|------|-------|
| `getTopicBrief(userId, topicSlug)` | `knowledge-base.ts` | Read topic brief |
| `getTopicKnowledgeBase(userId, topicSlug)` | `knowledge-base.ts` | Read full knowledge base |
| `getActiveCurriculumState(userId)` | `curriculum.ts` | Read current curriculum_state row |
| `updateCurriculumLayer2(userId, topicId, sessions, callerAgent)` | `curriculum.ts` | Write Layer 2 — enforces N+2 rule |
| `updateCurriculumPosition(userId, data, callerAgent)` | `curriculum.ts` | Updates position + evaluation date |
| `getPendingQueueItems(userId)` | `queue.ts` | Read pending agent_update_queue |
| `markQueueItemsProcessed(userId, ids)` | `queue.ts` | Mark queue items done |
| `queryRAG(userId, filters)` | `rag.ts` | Query rag_memory |

---

## Critical Constraints — Layer 2 Write Rules

These are enforced in `src/db/curriculum.ts`. The Curriculum Builder must respect them:

```typescript
// src/db/curriculum.ts — enforced in updateCurriculumLayer2()

function enforceCurriculumRules(
  sessions: Layer2Session[],
  currentDay: number,
  callerAgent: string
): void {
  // Rule 1 — only curriculum_builder may write Layer 2
  if (callerAgent !== 'curriculum_builder_node') {
    throw new CurriculumLayerViolation(
      `Agent '${callerAgent}' attempted to write Layer 2. Only curriculum_builder_node is permitted.`
    );
  }

  // Rule 2 — never modify today's or tomorrow's session
  const minModifiableDay = currentDay + 2;
  const violatingSessions = sessions.filter(s =>
    s.dayNumber < minModifiableDay &&
    s.status === 'pending'
  );

  if (violatingSessions.length > 0) {
    throw new CurriculumLayerViolation(
      `Attempted to modify sessions for days ${violatingSessions.map(s => s.dayNumber).join(', ')}. ` +
      `Minimum modifiable day is ${minModifiableDay}.`
    );
  }
}
```

---

## Evaluation Schedule Logic

```typescript
function calculateFirstEvaluationDate(): string {
  // First evaluation always on Day 3 — enough content to test, early enough to catch problems
  const date = new Date();
  date.setDate(date.getDate() + 2);  // Day 3 = today + 2
  return date.toISOString().split('T')[0];
}

function calculateNextEvaluationDate(currentDay: number): string {
  // After first evaluation: every 3 days
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().split('T')[0];
}
```

---

## Session Helper Functions

```typescript
// Find most relevant production example for a concept group
function findRelevantExample(
  concepts: ConceptOutlineEntry[],
  examples: ProductionExample[]
): ProductionExample | null {
  const conceptTerms = concepts.flatMap(c => c.concept.toLowerCase().split(' '));

  let bestMatch: ProductionExample | null = null;
  let bestScore = 0;

  for (const example of examples) {
    const text = `${example.scenario} ${example.whatTheyDid}`.toLowerCase();
    const score = conceptTerms.filter(term => text.includes(term)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = example;
    }
  }
  return bestMatch;
}

// Insert a new session and renumber subsequent sessions
function insertSession(
  sessions: Layer2Session[],
  newSession: Layer2Session,
  afterDay: number
): Layer2Session[] {
  const insertIndex = sessions.findIndex(s => s.dayNumber > afterDay);
  const insertAt = insertIndex === -1 ? sessions.length : insertIndex;

  const result = [
    ...sessions.slice(0, insertAt),
    newSession,
    ...sessions.slice(insertAt),
  ];

  // Renumber all sessions after insertion point
  return result.map((s, i) => ({ ...s, dayNumber: i + 1 }));
}
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| Knowledge Base is empty | Use topic brief's concept outline alone. Mark sessions as `partial` — Teaching Agent will note this. |
| No production examples in Knowledge Base | Set `realExampleRef` to 'general' — Teaching Agent handles this gracefully. |
| Queue processing fails partway through | Rollback all queue items in this batch to `pending`. Log error. Retry next night. |
| Session count far exceeds estimated days | Cap at `estimatedDays * 1.5`. Flag to user via Layer 3 that timeline was extended. |
| Reconcile finds update for already-completed session | Mark queue item as `dropped` with reason 'session already completed'. |
| Two Priority 1 items conflict for same session | Insert both remediation items sequentially in adjacent sessions. |
| Layer 2 is completely empty during reconcile | This is a corrupted state. Log critical error. Do not proceed. |

---

## Testing This Agent Locally

```bash
# Initial mode — requires architect and cartographer to have run first
pnpm run dev:learning

# Reconcile mode — requires queue items to exist
pnpm run dev:reconcile
```

**Manual test checklist — Initial mode:**
- [ ] Sessions created for every concept in topic brief
- [ ] Session count is within 20% of `topicBrief.estimatedDays`
- [ ] No session has more than 3 concepts
- [ ] Fundamentals and code sessions each have exactly 1 concept
- [ ] Every session has a `connectionToPrior` (except Day 1)
- [ ] Every session has a `tomorrowPreview` (except last day)
- [ ] `evaluationDue: true` appears every 3rd session
- [ ] `next_evaluation_due` written to user profile
- [ ] `curriculum_state.layer_2` written to Supabase

**Manual test checklist — Reconcile mode:**
- [ ] No session with `dayNumber <= currentDay + 1` is modified
- [ ] Priority 1 items processed before Priority 2
- [ ] All processed items marked as `processed` in queue
- [ ] Dropped items include a `drop_reason`
- [ ] Updated sessions written to Supabase

---

## What This Agent Must NOT Do

- Must NOT write to `curriculum_state.layer_1`. Layer 1 is Architect-only.
- Must NOT modify sessions for today or tomorrow. N+2 minimum window is inviolable.
- Must NOT teach anything. Zero teaching.
- Must NOT fetch from external sources. That is Cartographer and Scout's job.
- Must NOT resolve contradictions. That is Contradiction Agent's job.
- Must NOT call `reasoningLLM()` for reconcile tasks — `fastLLM()` is sufficient.
- Must NOT skip processing Priority 1 items for any reason. Evaluation gaps always come first.
- Must NOT write to `rag_memory`. No RAG writes — this agent produces curriculum structure, not memory.
- Must NOT insert sessions before `currentDay + 2` under any circumstances — not even for Priority 1 items.
