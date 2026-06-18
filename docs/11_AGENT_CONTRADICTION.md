# LRNR — Agent 07: Contradiction Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Current Implementation Override

Contradiction Agent is Phase 3, not Phase 1.

This file contains older Telegram-formatted teaching examples. Current direction:

```text
Contradiction Agent produces structured contradiction explanations.
Frontend renders the explanation with sources and context.
Telegram may alert/deep-link only when useful.
```

When this file says "Telegram-formatted teaching piece," implement a structured frontend contradiction card plus optional short notification summary.

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/contradiction.ts` |
| LangGraph node name | `contradiction_node` |
| Exported function | `runContradictionAgent(state: ResearchGraphState): Promise<Partial<ResearchGraphState>>` |
| LLM model | `reasoningLLM()` — `llama-3.3-70b-versatile` |
| Trigger | Daily Research Workflow — runs after Scout completes when `contradiction_queue` has pending items |
| Runs in graph | Research Graph only |
| Position | Fourth node in Research Graph — after `news_intelligence_node`, before `reconciliation_node` |
| Avg runtime | 1-4 minutes depending on number of contradictions queued |

---

## What This Agent Does — Plain English

The Contradiction Agent is the system's critical thinking engine. When the Cartographer maps a topic or the Scout monitors it daily, both flag conflicts they find between sources into the `contradiction_queue`. The Contradiction Agent processes these conflicts and does something no static course ever does — it presents both sides with full intellectual honesty, teaches the user the framework to evaluate the conflict themselves, and over time trains them to do this automatically without the system's help.

The philosophical foundation of this agent is the most important thing to understand before coding it. The goal is never to tell the user which side is right. The goal is to teach them how to evaluate any contradiction they will encounter in their entire career — in this topic, in future topics, in real engineering decisions, in technical debates with colleagues. A user who has been trained to ask "are they talking about the same context?" every time they see a conflict is more valuable than a user who has been given the right answer to fifty individual conflicts.

The agent classifies every contradiction through four lenses:

**Different versions** — the two sources are both correct but for different versions of the same tool. LangChain v0.1 chains behave differently from v0.2 chains. Both sources are right in their version context. The lesson: always check version context before accepting a claim.

**Different scales** — the two sources are both correct but at different operational scales. What performs fine at 1,000 requests per day becomes a bottleneck at 1,000,000. Both authors are right about their scale. The lesson: always ask "at what scale?"

**Different priorities** — the two sources are optimising for different things. One values developer velocity, one values production reliability. Neither is wrong — they're solving different problems. The lesson: always ask "what are they optimising for?"

**One is wrong** — one source is outdated, misunderstood, or simply incorrect. The Tier 1 source contradicts the Tier 3 source clearly. One of them is wrong. The lesson: trust hierarchy matters — not all sources are equal, and recency matters for fast-moving fields.

Most contradictions involve more than one lens. A Tier 3 blog post from 2022 contradicting current official docs might be both "different versions" and "one is wrong" simultaneously. The agent classifies all applicable lenses, not just the primary one.

---

## Inputs

### From LangGraph State (Research Graph)
```typescript
{
  userId: string;
  currentTopic: string;
  profile: UserProfile;
  contradictions: ContradictionItem[];   // flagged by Scout in this run
}
```

### From Database
```typescript
// All pending contradictions — both from this Scout run and any previously unprocessed
const pendingContradictions = await getPendingContradictions(userId);

// Full knowledge base for context — needed to understand what the user currently believes
const knowledgeBase = await getTopicKnowledgeBase(userId, currentTopic);

// Current curriculum position — determines routing (Layer 3 vs Layer 2 queue)
const curriculumState = await getActiveCurriculumState(userId);
const currentDay = curriculumState.currentDay;
const currentConcepts = curriculumState.layer_2
  .find((s: Layer2Session) => s.status === 'pending')
  ?.conceptsToCover ?? [];
```

---

## Outputs

### 1. Resolved Contradiction Teaching Content → Layer 3 or `agent_update_queue`

**If contradiction is in a concept being covered this week → Layer 3:**
```typescript
await addToLayer3Queue(userId, {
  type: 'contradiction_flag',
  content: formattedTeachingContent,    // pre-formatted for Telegram
  sourceAgent: 'contradiction_node',
  priority: 'high',
  expiresAt: addHours(new Date(), 48),
  consumedAt: null,
  sessionId: null,
});
```

**If contradiction is in an upcoming concept → Layer 2 queue:**
```typescript
await addToQueue({
  userId,
  sourceAgent: 'contradiction_node',
  updateType: 'contradiction_resolution',
  priority: 3,
  content: {
    contradictionId: contradiction.id,
    resolution: resolutionText,
    teachingContent: formattedTeachingContent,
  },
  topicId: currentTopicId,
});
```

**If contradiction is in a past concept → RAG only:**
```typescript
await writeToRAG({
  userId,
  content: resolutionSummary,
  eventType: 'contradiction_resolved',
  topic: currentTopic,
  concept: contradiction.relatedConcept,
  sourceAgent: 'contradiction_node',
  confidence: 0.9,
  isResolved: true,
});
```

### 2. Contradiction Queue Update → `contradiction_queue`
```typescript
await resolveContradiction(contradiction.id, {
  lensApplied: classificationResult.primaryLens,
  resolutionText: resolutionText,
  evaluationFramework: evaluationFramework,
  routedTo: routingDecision,
  status: 'resolved',
  resolvedAt: new Date().toISOString(),
});
```

### 3. RAG Memory Entry → `rag_memory`
```typescript
// Always write to RAG regardless of routing — long-term learning memory
await writeToRAG({
  userId,
  content: `Contradiction resolved: ${contradiction.relatedConcept}. ${resolutionSummary}`,
  eventType: 'contradiction_resolved',
  topic: currentTopic,
  concept: contradiction.relatedConcept,
  sourceAgent: 'contradiction_node',
  confidence: 0.85,
});
```

---

## The Four Lenses — Full Classification Specification

### Lens 1 — Different Versions

**Signal patterns that indicate this lens:**
- Source A has an older publication date than Source B
- Source A references an older version number in its code examples
- The official changelog shows the behaviour changed between versions
- One source uses deprecated API patterns

**Classification prompt trigger:** When `sourceTier` of both sources is relatively high (both Tier 1-2) yet they still contradict — this is a strong signal for version difference rather than one being wrong.

**Teaching content structure for this lens:**
```
Both sources are correct — for different versions of {tool}.

Source A ({sourceAName}) describes {tool} {version_a} behaviour.
Source B ({sourceBName}) describes {tool} {version_b} behaviour.

What changed: {what specifically changed between versions}

The rule this teaches you:
Whenever you read a technical claim, ask: "Which version is this author using?"
Check their code examples for version numbers. Check their publication date.
A claim that was true in 2022 may be wrong in 2024 for a fast-moving tool.

For your current learning: {which version is relevant and why}
```

---

### Lens 2 — Different Scales

**Signal patterns that indicate this lens:**
- One source discusses a startup or personal project context
- One source discusses a large company or high-traffic system
- Terms like "at scale", "in production", "for small projects" appear
- The contradiction is about performance, latency, or reliability

**Teaching content structure for this lens:**
```
Both sources are correct — at different scales.

{sourceAName} is writing for {context_a — e.g. "teams with moderate traffic"}.
{sourceBName} is writing for {context_b — e.g. "systems with millions of requests/day"}.

Why it differs at scale: {the specific mechanism that changes with scale}

The rule this teaches you:
Whenever you read a performance or reliability claim, ask: "At what scale?"
What works at 10K requests/day can fail catastrophically at 10M.
The right tool for a startup is often the wrong tool for a unicorn — and vice versa.

For your current context: {which scale is most relevant to the user's goal}
```

---

### Lens 3 — Different Priorities

**Signal patterns that indicate this lens:**
- One source emphasises speed of development, one emphasises production safety
- One source is from a developer-focused perspective, one from operations
- Terms like "simple", "quick", "easy to use" vs "robust", "scalable", "maintainable"
- The same architectural decision is praised by one and criticised by another

**Teaching content structure for this lens:**
```
Both sources are correct — they're optimising for different things.

{sourceAName} prioritises: {what they're optimising for — e.g. developer velocity}
{sourceBName} prioritises: {what they're optimising for — e.g. production reliability}

Neither is wrong. They're solving different problems.

{sourceA}'s recommendation makes sense when: {specific conditions}
{sourceB}'s recommendation makes sense when: {specific conditions}

The rule this teaches you:
Before taking any technical recommendation, ask: "What is this author optimising for?"
A recommendation from someone building a weekend project serves different goals
than a recommendation from someone running a system with 99.99% SLA requirements.

The question to ask in practice: {a single clarifying question that reveals which priority applies}
```

---

### Lens 4 — One Is Wrong

**Signal patterns that indicate this lens:**
- Tier 1 source (official docs) clearly states X, Tier 3 source states not-X with no version caveat
- The lower-tier source's claim cannot be verified in any Tier 1 source
- The claim is demonstrably outdated based on release dates
- The lower-tier source misunderstands a concept based on how they describe it

**Teaching content structure for this lens:**
```
In this case, one source has it wrong.

{higherTierSource} ({tier}) states: {claim}
{lowerTierSource} ({tier}) states: {contradicting claim}

Why {lowerTierSource} is likely incorrect:
{specific reason — outdated, misunderstood concept, wrong version assumption}

The accurate understanding: {what is actually correct}

The rule this teaches you:
Not all sources are equal. When sources conflict, trust hierarchy:
Official docs > core contributor writing > experienced practitioner > general community.
And always check: when was this written? For a fast-moving field like AI,
a blog post from 18 months ago may be completely outdated.
```

---

## Classification Logic — Full LLM Prompt

```typescript
export function contradictionClassificationPrompt(
  contradiction: ContradictionQueueItem,
  knowledgeBase: TopicKnowledgeBase,
  currentConcepts: string[],
  topicName: string
): string {
  return `Classify this contradiction between two sources about ${topicName}.

CLAIM A:
"${contradiction.claimA}"
Source: ${contradiction.sourceAName} (Tier ${contradiction.sourceATier})
URL: ${contradiction.sourceAUrl}

CLAIM B:
"${contradiction.claimB}"
Source: ${contradiction.sourceBName} (Tier ${contradiction.sourceBTier})
URL: ${contradiction.sourceBUrl}

Related concept: ${contradiction.relatedConcept}

EXISTING KNOWLEDGE BASE CONTEXT (what the learner currently believes):
${JSON.stringify(
  knowledgeBase.coreConcepts
    .filter(c => c.concept.toLowerCase().includes(
      contradiction.relatedConcept?.toLowerCase() ?? ''
    ))
    .slice(0, 2),
  null, 2
)}

Classify using ALL applicable lenses. Most contradictions involve multiple lenses.

Return JSON only, no other text:
{
  "primaryLens": "different_versions|different_scales|different_priorities|one_is_wrong|multiple",
  "allLenses": ["different_versions"|"different_scales"|"different_priorities"|"one_is_wrong"],
  "lensRationale": {
    "differentVersions": { "applies": boolean, "evidence": string | null },
    "differentScales": { "applies": boolean, "evidence": string | null },
    "differentPriorities": { "applies": boolean, "evidence": string | null },
    "oneIsWrong": { "applies": boolean, "whichOne": "A"|"B"|null, "evidence": string | null }
  },
  "correctUnderstanding": string,
  "resolutionSummary": string,
  "teachingValue": "high|medium|low",
  "evaluationFramework": string,
  "affectsCurrentLearning": boolean,
  "affectedConcept": string | null
}

EVALUATION FRAMEWORK: Write 1-3 questions the learner should ask themselves
whenever they encounter any contradiction in this topic area.
These should be transferable questions — not specific to this contradiction.`;
}
```

---

## Teaching Content Generation

After classification, generate the full teaching content for delivery:

```typescript
export function contradictionTeachingPrompt(
  contradiction: ContradictionQueueItem,
  classification: ContradictionClassification,
  topicName: string,
  userGoal: string
): string {
  return `Write the teaching content for this resolved contradiction about ${topicName}.

CONTRADICTION:
Claim A: "${contradiction.claimA}" — ${contradiction.sourceAName}
Claim B: "${contradiction.claimB}" — ${contradiction.sourceBName}
Primary lens: ${classification.primaryLens}
All lenses: ${classification.allLenses.join(', ')}
Correct understanding: ${classification.correctUnderstanding}

USER CONTEXT:
Goal: ${userGoal}
Related concept: ${contradiction.relatedConcept}

Write a Telegram-formatted teaching piece that:
1. Acknowledges both sources exist and are credible in their context
2. Explains which lens(es) apply and why — be specific, not generic
3. States the correct understanding for the user's specific context
4. Ends with the transferable evaluation rule — the question to ask in future
5. Is warm and treats this as exciting, not confusing ("This is actually a great example of...")

Use Telegram markdown (*bold*, _italic_, bullet points).
Maximum 300 words.
Do not use headers — this should flow as natural explanation.
Do not start with "Here is" or any preamble.`;
}
```

---

## Routing Decision Logic

```typescript
function determineRouting(
  contradiction: ContradictionQueueItem,
  classification: ContradictionClassification,
  currentConcepts: string[],
  currentDay: number,
  layer2Sessions: Layer2Session[]
): 'layer_3' | 'layer_2_queue' | 'rag_only' {
  // If it affects what the user is learning THIS WEEK → Layer 3
  if (classification.affectsCurrentLearning) {
    const isThisWeek = currentConcepts.some(c =>
      c.toLowerCase().includes(classification.affectedConcept?.toLowerCase() ?? '')
    );
    if (isThisWeek) return 'layer_3';
  }

  // If it affects an UPCOMING concept in Layer 2 → queue
  const affectedSession = layer2Sessions.find(s =>
    s.status === 'pending' &&
    s.dayNumber > currentDay + 1 &&
    s.conceptsToCover.some(c =>
      c.toLowerCase().includes(classification.affectedConcept?.toLowerCase() ?? '')
    )
  );
  if (affectedSession) return 'layer_2_queue';

  // If it's about a past concept or peripheral → RAG only
  return 'rag_only';
}
```

---

## Complete Agent Implementation Structure

```typescript
// src/agents/contradiction.ts

import { reasoningLLM } from '../lib/groq';
import { getPendingContradictions, resolveContradiction } from '../db/contradictions';
import { getTopicKnowledgeBase } from '../db/knowledge-base';
import { getActiveCurriculumState, addToLayer3Queue } from '../db/curriculum';
import { addToQueue } from '../db/queue';
import { writeToRAG } from '../db/rag';
import { getTopicBrief } from '../db/knowledge-base';
import { safeJsonParse } from '../utils/json';
import { logger } from '../utils/logger';
import {
  contradictionClassificationPrompt,
  contradictionTeachingPrompt,
} from '../prompts/contradiction.prompts';
import { ResearchGraphState } from '../types/graph-state.types';

export async function runContradictionAgent(
  state: ResearchGraphState
): Promise<Partial<ResearchGraphState>> {
  logger.info('contradiction_node started', { userId: state.userId });

  try {
    // Load all pending contradictions
    const pendingContradictions = await getPendingContradictions(state.userId);

    if (pendingContradictions.length === 0) {
      logger.info('contradiction_node: no pending contradictions', { userId: state.userId });
      return {};
    }

    logger.info('contradiction_node: processing', {
      userId: state.userId,
      count: pendingContradictions.length,
    });

    const [knowledgeBase, curriculumState, topicBrief] = await Promise.all([
      getTopicKnowledgeBase(state.userId, state.currentTopic),
      getActiveCurriculumState(state.userId),
      getTopicBrief(state.userId, state.currentTopic),
    ]);

    const currentDay = curriculumState.currentDay;
    const currentConcepts = (curriculumState.layer_2 as Layer2Session[])
      .find(s => s.status === 'pending')?.conceptsToCover ?? [];

    for (const contradiction of pendingContradictions) {
      try {
        // Step 1 — Classify the contradiction
        const classificationRaw = await reasoningLLM([
          {
            role: 'user',
            content: contradictionClassificationPrompt(
              contradiction,
              knowledgeBase,
              currentConcepts,
              state.currentTopic
            ),
          },
        ], { jsonMode: true, maxTokens: 1000 });

        const classification = safeJsonParse<ContradictionClassification>(classificationRaw);

        // Step 2 — Generate teaching content
        const teachingContent = await reasoningLLM([
          {
            role: 'user',
            content: contradictionTeachingPrompt(
              contradiction,
              classification,
              state.currentTopic,
              topicBrief.whyLearning
            ),
          },
        ], { maxTokens: 600, temperature: 0.6 });

        // Step 3 — Determine routing
        const routing = determineRouting(
          contradiction,
          classification,
          currentConcepts,
          currentDay,
          curriculumState.layer_2 as Layer2Session[]
        );

        // Step 4 — Route to correct destination
        if (routing === 'layer_3') {
          await addToLayer3Queue(state.userId, {
            type: 'contradiction_flag',
            content: teachingContent,
            sourceAgent: 'contradiction_node',
            priority: 'high',
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            consumedAt: null,
            sessionId: null,
          });
        } else if (routing === 'layer_2_queue') {
          await addToQueue({
            userId: state.userId,
            sourceAgent: 'contradiction_node',
            updateType: 'contradiction_resolution',
            priority: 3,
            content: {
              contradictionId: contradiction.id,
              resolution: classification.resolutionSummary,
              teachingContent,
            },
            topicId: contradiction.topicId,
          });
        }

        // Step 5 — Always write to RAG regardless of routing
        await writeToRAG({
          userId: state.userId,
          content: `Contradiction resolved (${classification.primaryLens}): ${contradiction.relatedConcept}. ${classification.resolutionSummary}`,
          eventType: 'contradiction_resolved',
          topic: state.currentTopic,
          concept: contradiction.relatedConcept ?? state.currentTopic,
          sourceAgent: 'contradiction_node',
          confidence: 0.85,
          isResolved: true,
        });

        // Step 6 — Mark contradiction as resolved
        await resolveContradiction(contradiction.id, {
          lensApplied: classification.primaryLens,
          resolutionText: classification.resolutionSummary,
          evaluationFramework: classification.evaluationFramework,
          routedTo: routing,
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
        });

        logger.info('contradiction_node: resolved', {
          contradictionId: contradiction.id,
          lens: classification.primaryLens,
          routing,
        });

      } catch (error) {
        // Individual contradiction failure — log and continue to next
        logger.error('contradiction_node: failed to resolve one item', {
          contradictionId: contradiction.id,
          error: String(error),
        });
        // Mark as dropped so it doesn't block future runs
        await resolveContradiction(contradiction.id, {
          status: 'dropped',
          resolvedAt: new Date().toISOString(),
        });
      }
    }

    logger.info('contradiction_node completed', {
      userId: state.userId,
      processed: pendingContradictions.length,
    });

    return {};

  } catch (error) {
    logger.error('contradiction_node failed', { userId: state.userId, error });
    return {
      errors: [...(state.errors ?? []), `contradiction_node: ${String(error)}`],
    };
  }
}
```

---

## Transferable Evaluation Framework

The most important output of this agent is not the resolution of any specific contradiction — it is the **evaluation framework** that gets written to RAG and periodically surfaced back to the user to build the habit of critical evaluation.

```typescript
export function buildTransferableFramework(
  allLenses: string[],
  topicName: string
): string {
  const questions: string[] = [];

  if (allLenses.includes('different_versions')) {
    questions.push(`Which version of ${topicName} is this author using? Check their code examples and publication date.`);
  }
  if (allLenses.includes('different_scales')) {
    questions.push(`At what scale is this author operating? What I need at 10K requests/day may differ from what they needed at 10M.`);
  }
  if (allLenses.includes('different_priorities')) {
    questions.push(`What is this author optimising for? Developer speed and production reliability often point in different directions.`);
  }
  if (allLenses.includes('one_is_wrong')) {
    questions.push(`Which source has higher credibility? Official docs and core contributor writing outweigh general blog posts.`);
  }

  return questions.join(' ');
}
```

---

## Database Functions Required

| Function | File | Notes |
|----------|------|-------|
| `getPendingContradictions(userId)` | `contradictions.ts` | Reads `contradiction_queue` where status = 'pending' |
| `resolveContradiction(id, data)` | `contradictions.ts` | Updates contradiction record with resolution |
| `getTopicKnowledgeBase(userId, topic)` | `knowledge-base.ts` | Context for classification |
| `getActiveCurriculumState(userId)` | `curriculum.ts` | Current position for routing decision |
| `addToLayer3Queue(userId, item)` | `curriculum.ts` | High priority — this week's concept |
| `addToQueue(item)` | `queue.ts` | Medium priority — upcoming concept |
| `writeToRAG(entry)` | `rag.ts` | Always write resolution to long-term memory |
| `getTopicBrief(userId, topic)` | `knowledge-base.ts` | User goal context for teaching content |

---

## Prompts File Structure

```typescript
// src/prompts/contradiction.prompts.ts
export function contradictionClassificationPrompt(contradiction, knowledgeBase, currentConcepts, topicName): string { ... }
export function contradictionTeachingPrompt(contradiction, classification, topicName, userGoal): string { ... }
export function evaluationFrameworkSummaryPrompt(allResolutions: string[], topicName: string): string { ... }
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| No pending contradictions | Return empty state. This is normal — most days have none. |
| Classification LLM returns invalid JSON | Retry once. If still failing, mark contradiction as `dropped` with reason 'classification failed'. Never block. |
| Teaching content generation fails | Use a minimal fallback template with just the two claims and source names. Still route and resolve. |
| Both sources are Tier 1 and genuinely conflict | This is rare and high-value. Always route to Layer 3 regardless of concept timing. Flag as `teachingValue: 'high'`. |
| Contradiction is about a topic the user hasn't learned yet | Mark as `rag_only`. Do not surface to user until that concept is in the curriculum. |
| Same contradiction flagged twice (Scout + Cartographer) | Deduplicate by matching `claimA + claimB` similarity. Process once. |
| More than 5 pending contradictions | Process maximum 5 per run. Leave remainder as pending for next run. Priority order: ones affecting current concepts first. |

---

## Testing This Agent Locally

```bash
# Requires contradiction_queue to have pending items
# Manually insert a test contradiction or run cartographer first
MOCK_LLM=false pnpm run dev:research
```

**Manual test checklist:**
- [ ] Loads all pending contradictions correctly
- [ ] Classification identifies the correct lens(es) for a test contradiction
- [ ] All four lenses are checked in classification output
- [ ] Teaching content is warm, non-judgmental, educational
- [ ] Routing correctly sends to Layer 3 for current-week concepts
- [ ] Routing correctly sends to queue for upcoming concepts
- [ ] Routing correctly sends to RAG-only for past concepts
- [ ] Contradiction marked as `resolved` in database after processing
- [ ] RAG entry written for every resolved contradiction
- [ ] Agent continues after individual contradiction failure
- [ ] Evaluation framework written as transferable questions

---

## What This Agent Must NOT Do

- Must NOT pick a side without evidence. If both sources are credible and the lens is ambiguous, present both fairly and note the ambiguity.
- Must NOT tell the user "Source X is wrong" without clear Tier 1 evidence that the claim is incorrect.
- Must NOT skip the RAG write. Every resolution must be in long-term memory — the Evaluation Agent reads this.
- Must NOT generate teaching content longer than 300 words. Brevity is critical for Telegram delivery.
- Must NOT process more than 5 contradictions per run — subsequent runs handle the rest.
- Must NOT modify the `topic_knowledge_base` directly. It only writes teaching content to Layer 3, Layer 2 queue, and RAG.
- Must NOT write to `user_profile`. No profile writes.
- Must NOT attempt to fetch or verify the source URLs. Content must come from what was already stored in the contradiction queue.
- Must NOT silently drop a contradiction without updating its status. Every contradiction must end as `resolved` or `dropped` — never left as `pending` indefinitely.
