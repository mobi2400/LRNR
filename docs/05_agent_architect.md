# LRNR — Agent 01: Architect Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/architect.ts` |
| LangGraph node name | `architect_node` |
| Exported function | `runArchitectAgent(state: LearningGraphState): Promise<Partial<LearningGraphState>>` |
| LLM model | `reasoningLLM()` — `llama-3.3-70b-versatile` |
| Trigger | New topic start OR quarterly re-evaluation |
| Runs in graph | Learning Graph only |
| Position | First node after `route_node` detects new topic |
| Avg runtime | 3-8 minutes (multi-turn conversation) |

---

## What This Agent Does — Plain English

The Architect Agent is the entry point of the entire learning experience. When a user states a goal — any goal — the Architect's job is to transform that vague statement into three precise outputs: a Master Roadmap that covers the full journey from where the user actually is to where they want to be, a First Topic Brief that tells every downstream agent exactly what to research and build, and an Initial Profile that seeds the RAG with everything learned during the discovery conversation.

The Architect never assumes. It never accepts self-assessment at face value. It probes, listens, and maps before it plans. A user who says "I know Python" gets a question that reveals whether they actually do. A user who says "I want to learn Agentic AI" gets a conversation that uncovers whether they know what an LLM is, whether they've used an API, whether they've written async code — because all of these are prerequisites that must be assessed before the roadmap can be accurate.

The Architect also does something no course platform does: it maps the dependency graph of the entire goal. "Agentic AI" doesn't start with LangChain — it starts with Python, then async Python, then API calls, then LLM concepts, then prompt engineering, then LangChain, then LangGraph, then memory and state, then tool use, then guardrails, then evaluation, then production deployment. The Architect knows this dependency chain for any technical goal and uses it to determine the correct starting point for this specific user.

---

## Inputs

### From LangGraph State
```typescript
{
  userId: string;                    // Telegram user ID
  profile: UserProfile | null;       // null on first run
  isNewTopic: boolean;               // always true when architect runs
}
```

### From Telegram (multi-turn conversation)
The agent receives user messages turn by turn through Telegraf. The conversation context is maintained in the agent's local state during the session and written to RAG at the end.

### From Database (on quarterly re-evaluation only)
```typescript
// Read existing profile to understand current state
const existingProfile = await getProfile(userId);

// Read RAG history to understand learning journey so far
const learningHistory = await queryRAG(userId, {
  eventType: 'session_summary',
  limit: 20
});
```

---

## Outputs

### 1. Master Roadmap → `curriculum_state.layer_1`
```typescript
interface MasterRoadmap {
  masterRoadmap: TopicNode[];
  currentTopicIndex: number;         // always 0 on first run
  totalTopics: number;
  createdAt: string;
  lastModifiedBy: 'architect';
  version: number;                   // 1 on first run, increments on re-evaluation
}

interface TopicNode {
  topicId: string;                   // uuid generated here
  topicName: string;                 // human readable: 'Python Fundamentals'
  topicSlug: string;                 // machine readable: 'python-fundamentals'
  prerequisiteIds: string[];         // topicIds that must complete first
  estimatedDays: number;             // based on time commitment and depth required
  depthRequired: 'skim' | 'working' | 'deep' | 'expert';
  status: 'not_started' | 'in_progress' | 'complete';
  userStatus: 'known' | 'partial' | 'unknown';  // from probing
  evidence: string;                  // what the user said that informed userStatus
  masteryBenchmarks: {
    canSolve: string;
    canExplain: string;
    canDecide: string;
  };
}
```

**Write rule:** Written to `curriculum_state.layer_1`. This is the ONLY time Layer 1 is written (except quarterly re-evaluation). Use `createCurriculumState()` from `src/db/curriculum.ts`.

### 2. First Topic Brief → `topic_briefs` table
```typescript
// Written via createTopicBrief() from src/db/knowledge-base.ts
// Contains everything Cartographer and Curriculum Builder need
// See full TopicBrief type in 03_DATA_SCHEMA.md
```

### 3. Initial Profile → `user_profile` table
```typescript
// Written via createProfile() or updateProfileFromArchitect() from src/db/profile.ts
// Includes: statedGoal, whyLearning, successDefinition, timeCommitmentMins,
//           priorAttempts, knowledgeDepthMap (from probing), onboardingComplete: true
```

### 4. RAG Seed → `rag_memory` table
```typescript
// Every turn of the discovery conversation written as event_type: 'onboarding_response'
// Every identified knowledge depth written as event_type: 'concept_mastered' or 'gap_detected'
// Every identified misconception written as event_type: 'misconception_detected'
```

---

## The Discovery Conversation — Full Flow

This is the most important part of this agent. The conversation has five phases. The agent must complete all five before producing outputs. Do not rush through phases.

### Phase 1 — Goal Clarification (1-3 turns)

**Purpose:** Understand the real goal behind the stated goal.

**Opening message to user:**
```
Welcome to LRNR. Before we build your learning path, I need to understand 
what you're actually trying to achieve.

You said you want to learn [GOAL]. Tell me more — what's driving this? 
Are you building something specific, preparing for a role, trying to 
understand something you're already working with, or something else?
```

**What to listen for:**
- The real motivation (job, project, curiosity, interview, promotion)
- Any time pressure ("I have an interview in 3 weeks")
- Any specific outcome ("I want to build a RAG chatbot for my company")
- Any constraints ("I can only spend 45 minutes a day")

**Follow-up if vague:** Ask once more with a specific example: *"For instance, is there a specific thing you're trying to build, or a role you're aiming for?"*

**Do not:** Ask more than 2 clarifying questions in this phase. Move on even if some ambiguity remains.

---

### Phase 2 — Self-Assessment Collection (1-2 turns)

**Purpose:** Collect the user's self-reported knowledge. This will be validated in Phase 3.

**Message:**
```
Got it. Now tell me honestly — what's your current technical background? 
What have you built or worked with? Don't undersell yourself, but don't 
oversell either. I'll be checking.
```

**What to collect:**
- Languages they claim to know
- Frameworks and tools they've used
- Projects they've built
- Years of experience (if offered)

**Do not probe here.** Just collect. Probing happens in Phase 3.

---

### Phase 3 — Knowledge Probing (3-8 turns)

**Purpose:** Verify self-assessment through indirect questions. This is the most important phase.

**Critical rule:** Never ask "do you know X?" Ask questions that require demonstrating knowledge of X.

**Probing question bank — select based on what user claimed:**

For Python claims:
```
Walk me through what happens when you write `async def` in Python. 
Why would you use it and what does it actually do differently?
```
```
You have a list of 1 million items and need to filter them. 
What's your instinct on how to write that efficiently in Python?
```

For API/backend claims:
```
Explain what happens between the moment a user hits Enter on a URL 
and the moment they see the response. As much detail as you know.
```
```
You're building an API that needs to call three external services. 
One of them sometimes takes 10 seconds. How do you handle that?
```

For ML/AI claims:
```
Explain in your own words why a neural network needs a non-linear 
activation function. What breaks without it?
```
```
Someone says "just fine-tune GPT-4 on your data." What questions 
do you ask before agreeing that's the right approach?
```

For database claims:
```
Your SQL query runs fine on 10,000 rows but times out on 10 million. 
Walk me through how you'd investigate and fix it.
```

**Scoring each answer:**
- Correct and detailed → `depth: 'deep'`
- Correct but surface-level → `depth: 'working'`
- Partially correct or hedged → `depth: 'surface'`
- Incorrect or blank → `depth: 'unknown'`, flag as potential misconception if they stated confidence

**Misconception detection:**
If a user confidently states something incorrect, mark it explicitly:
```typescript
misconceptions.push({
  concept: 'async_python',
  misconception: 'User believes async Python uses multiple threads',
  detectedAt: new Date().toISOString(),
  status: 'active',
  correctedAt: null
});
```

**Number of probing questions:** 3 minimum, 8 maximum. Stop when you have enough signal on the prerequisites for their goal. Do not probe concepts irrelevant to the goal.

---

### Phase 4 — Time and Commitment (1 turn)

**Purpose:** Get a realistic time commitment. This directly affects curriculum pacing.

**Message:**
```
Last practical question: how much time per day can you realistically 
give this — not the ideal amount, the actual amount on a normal week?
```

**Parse their answer into minutes:**
- "30 minutes" → 30
- "an hour" → 60
- "a couple hours" → 120
- "whenever I can" → 45 (default for uncertain)

**Also note:** Do they mention weekends? Do they mention a deadline? This affects pacing calculations.

---

### Phase 5 — Prior Failure Collection (1 turn)

**Purpose:** Understand what has been tried and why it broke down. This prevents recommending the same broken approaches.

**Message:**
```
Have you tried learning this or anything related before? 
If so, what happened — where did it click, where did it break down?
```

**What to extract:**
- What they tried (specific courses, books, tutorials)
- Where they got stuck (specific concepts, not just "it was hard")
- What format worked vs didn't (video vs text vs building vs reading)
- Any emotional signals (frustration, boredom, confidence collapse)

Write this to `user_profile.priorAttempts` and to RAG as `onboarding_response`.

---

## Dependency Graph Construction

After the conversation, the agent must build the dependency graph for the stated goal. This is a reasoning task — not a lookup. The LLM must construct this based on knowledge of the technical domain.

**Prompt for dependency graph construction:**

```typescript
export function dependencyGraphPrompt(
  goal: string,
  probedKnowledge: Record<string, KnowledgeDepthEntry>,
  timeCommitmentMins: number,
  whyLearning: string
): string {
  return `You are building a dependency-ordered learning roadmap for this user.

GOAL: ${goal}
WHY: ${whyLearning}
DAILY TIME: ${timeCommitmentMins} minutes

CONFIRMED KNOWLEDGE (from probing — trust this over self-report):
${JSON.stringify(probedKnowledge, null, 2)}

Build a complete dependency graph. Rules:
1. Include EVERY prerequisite, even ones that seem obvious
2. For each topic, check if user has confirmed knowledge — if yes, mark as 'known' and reduce estimated days
3. 'known' topics still get 1-2 days for gap assessment and reinforcement — never skip entirely
4. Depth required must reflect the goal — if goal is production Agentic AI, Python depth is 'working' not 'expert'
5. Estimated days assume ${timeCommitmentMins} minutes per day of focused learning
6. Be realistic — underestimating time destroys trust

Return JSON only, no other text:
{
  "topics": [
    {
      "topicName": string,
      "topicSlug": string,
      "prerequisiteSlugs": string[],
      "estimatedDays": number,
      "depthRequired": "skim|working|deep|expert",
      "userStatus": "known|partial|unknown",
      "evidence": string,
      "rationale": string,
      "masteryBenchmarks": {
        "canSolve": string,
        "canExplain": string,
        "canDecide": string
      }
    }
  ],
  "totalEstimatedDays": number,
  "startingTopic": string,
  "startingRationale": string,
  "goalReachableIn": string
}`;
}
```

**Known dependency chains (hardcoded knowledge to guide the LLM):**

For Agentic AI:
```
python-basics → python-for-ai → async-python → api-fundamentals →
llm-concepts → prompt-engineering → langchain → langgraph →
memory-state-management → tool-use-function-calling →
guardrails-safety → evaluation-testing → production-deployment → monitoring
```

For Databases:
```
data-modelling-basics → sql-fundamentals → sql-advanced → indexes-performance →
transactions-acid → query-optimisation → schema-design → nosql-concepts →
document-databases → column-family-databases → graph-databases →
database-selection → cap-theorem → sharding-replication → production-databases
```

For ML/Deep Learning:
```
python-basics → numpy-pandas → statistics-fundamentals → linear-algebra-basics →
ml-fundamentals → supervised-learning → neural-network-basics → backpropagation →
cnns → rnns-lstms → attention-mechanism → transformers → fine-tuning →
production-ml → mlops
```

These are hints for the LLM — not exhaustive or exclusive. The LLM must adapt based on the specific goal and user profile.

---

## First Topic Brief Construction

After the dependency graph is built, construct the First Topic Brief for the first topic in the chain.

```typescript
export function firstTopicBriefPrompt(
  firstTopic: TopicNode,
  userProfile: Partial<UserProfile>,
  fullRoadmap: TopicNode[]
): string {
  return `Create a detailed First Topic Brief for the Cartographer and Curriculum Builder agents.

TOPIC: ${firstTopic.topicName}
USER GOAL (context for this topic): ${userProfile.statedGoal}
WHY THIS TOPIC MATTERS TO THEIR GOAL: explain the connection
DEPTH REQUIRED: ${firstTopic.depthRequired}
ESTIMATED DAYS: ${firstTopic.estimatedDays}
USER'S CURRENT STATUS ON THIS TOPIC: ${firstTopic.userStatus}
EVIDENCE: ${firstTopic.evidence}
TIME PER DAY: ${userProfile.timeCommitmentMins} minutes

WHAT COMES AFTER THIS TOPIC IN THE ROADMAP:
${fullRoadmap.slice(1, 4).map(t => t.topicName).join(' → ')}

Return JSON only, no other text:
{
  "topicName": string,
  "topicSlug": string,
  "whyLearning": string,
  "successDefinition": string,
  "depthRequired": "skim|working|deep|expert",
  "estimatedDays": number,
  "timePerDayMins": number,
  "prerequisiteMap": [
    { "concept": string, "status": "known|partial|unknown", "evidence": string }
  ],
  "conceptOutline": [
    { "concept": string, "phase": string, "depth": string, "masteryBenchmark": string }
  ],
  "masteryBenchmarks": {
    "canSolve": string,
    "canExplain": string,
    "canDecide": string
  },
  "keySourcesHint": string[],
  "knownControversies": string | null,
  "versionContext": string | null
}`;
}
```

---

## Complete Agent Implementation Structure

```typescript
// src/agents/architect.ts

import { reasoningLLM } from '../lib/groq';
import { sendTelegramMessage, waitForUserResponse } from '../lib/telegram';
import { createProfile, updateProfileFromArchitect } from '../db/profile';
import { createTopicBrief } from '../db/knowledge-base';
import { createCurriculumState } from '../db/curriculum';
import { writeToRAG } from '../db/rag';
import { safeJsonParse } from '../utils/json';
import { logger } from '../utils/logger';
import {
  discoverySystemPrompt,
  dependencyGraphPrompt,
  firstTopicBriefPrompt
} from '../prompts/architect.prompts';
import { LearningGraphState } from '../types/graph-state.types';

export async function runArchitectAgent(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  logger.info('architect_node started', { userId: state.userId });

  const conversationHistory: ConversationTurn[] = [];
  const probedKnowledge: Record<string, KnowledgeDepthEntry> = {};
  const detectedMisconceptions: MisconceptionEntry[] = [];

  try {
    // ── PHASE 1: Goal Clarification ─────────────────────────────────────
    const goalResponse = await runConversationPhase({
      userId: state.userId,
      systemPrompt: discoverySystemPrompt(),
      phasePrompt: goalClarificationPrompt(state.profile?.statedGoal ?? ''),
      history: conversationHistory,
      maxTurns: 3,
    });
    conversationHistory.push(...goalResponse.turns);

    // ── PHASE 2: Self-Assessment Collection ─────────────────────────────
    const selfAssessResponse = await runConversationPhase({
      userId: state.userId,
      systemPrompt: discoverySystemPrompt(),
      phasePrompt: selfAssessmentPrompt(),
      history: conversationHistory,
      maxTurns: 2,
    });
    conversationHistory.push(...selfAssessResponse.turns);

    // ── PHASE 3: Knowledge Probing ───────────────────────────────────────
    const probingResponse = await runProbingPhase({
      userId: state.userId,
      systemPrompt: discoverySystemPrompt(),
      selfAssessment: selfAssessResponse.extracted,
      history: conversationHistory,
      maxQuestions: 6,
    });
    conversationHistory.push(...probingResponse.turns);
    Object.assign(probedKnowledge, probingResponse.probedKnowledge);
    detectedMisconceptions.push(...probingResponse.misconceptions);

    // ── PHASE 4: Time Commitment ─────────────────────────────────────────
    const timeResponse = await runConversationPhase({
      userId: state.userId,
      systemPrompt: discoverySystemPrompt(),
      phasePrompt: timeCommitmentPrompt(),
      history: conversationHistory,
      maxTurns: 1,
    });
    conversationHistory.push(...timeResponse.turns);
    const timeCommitmentMins = parseTimeCommitment(timeResponse.extracted);

    // ── PHASE 5: Prior Failures ──────────────────────────────────────────
    const priorResponse = await runConversationPhase({
      userId: state.userId,
      systemPrompt: discoverySystemPrompt(),
      phasePrompt: priorFailurePrompt(),
      history: conversationHistory,
      maxTurns: 1,
    });
    conversationHistory.push(...priorResponse.turns);

    // ── BUILD DEPENDENCY GRAPH ───────────────────────────────────────────
    await sendTelegramMessage(state.userId,
      '⚙️ Analysing your goal and building your roadmap...'
    );

    const graphRaw = await reasoningLLM([
      { role: 'system', content: discoverySystemPrompt() },
      { role: 'user', content: dependencyGraphPrompt(
          state.profile?.statedGoal ?? '',
          probedKnowledge,
          timeCommitmentMins,
          goalResponse.extracted.whyLearning
        )
      }
    ], { jsonMode: true, maxTokens: 4000 });

    const dependencyGraph = safeJsonParse<DependencyGraphOutput>(graphRaw);

    // ── BUILD FIRST TOPIC BRIEF ──────────────────────────────────────────
    const firstTopic = dependencyGraph.topics[0];

    const briefRaw = await reasoningLLM([
      { role: 'system', content: discoverySystemPrompt() },
      { role: 'user', content: firstTopicBriefPrompt(
          firstTopic,
          { statedGoal: state.profile?.statedGoal, timeCommitmentMins },
          dependencyGraph.topics
        )
      }
    ], { jsonMode: true, maxTokens: 3000 });

    const topicBrief = safeJsonParse<TopicBriefOutput>(briefRaw);

    // ── WRITE ALL OUTPUTS ────────────────────────────────────────────────

    // 1. Create/update user profile
    const profileData = {
      statedGoal: state.profile?.statedGoal ?? '',
      whyLearning: goalResponse.extracted.whyLearning,
      successDefinition: goalResponse.extracted.successDefinition,
      timeCommitmentMins,
      priorAttempts: priorResponse.extracted.summary,
      knowledgeDepthMap: probedKnowledge,
      misconceptionLog: detectedMisconceptions,
      onboardingComplete: true,
    };

    await updateProfileFromArchitect(state.userId, profileData, 'architect_node');

    // 2. Create topic brief
    const topicBriefRecord = await createTopicBrief(state.userId, topicBrief);

    // 3. Create curriculum state with Layer 1
    const masterRoadmap = buildMasterRoadmap(dependencyGraph, topicBriefRecord.id);
    await createCurriculumState(state.userId, topicBriefRecord.id, masterRoadmap, 'architect_node');

    // 4. Seed RAG with entire conversation
    await seedRAGFromConversation(state.userId, conversationHistory, firstTopic.topicSlug);

    // 5. Write misconceptions to RAG
    for (const misconception of detectedMisconceptions) {
      await writeToRAG({
        userId: state.userId,
        content: `Misconception detected: ${misconception.misconception} (concept: ${misconception.concept})`,
        eventType: 'misconception_detected',
        topic: firstTopic.topicSlug,
        concept: misconception.concept,
        sourceAgent: 'architect_node',
        confidence: 0.9,
      });
    }

    // ── SEND ROADMAP TO USER ─────────────────────────────────────────────
    await sendRoadmapSummary(state.userId, dependencyGraph, firstTopic);

    logger.info('architect_node completed', {
      userId: state.userId,
      topicsInRoadmap: dependencyGraph.topics.length,
      firstTopic: firstTopic.topicSlug,
      misconceptionsFound: detectedMisconceptions.length,
    });

    return {
      isNewTopic: false,
      currentTopic: firstTopic.topicSlug,
    };

  } catch (error) {
    logger.error('architect_node failed', { userId: state.userId, error });
    return {
      errors: [...(state.errors ?? []), `architect_node: ${String(error)}`],
    };
  }
}
```

---

## Telegram Message — Roadmap Summary

After all outputs are written, send the user a clear roadmap summary. This is the first real value they see.

```
🗺️ *Your Learning Roadmap*

Goal: [stated goal]
Estimated journey: [X weeks] at [Y mins/day]

Here's your path:

✅ [Topic 1] — you already know this (2 days to confirm and fill gaps)
📚 [Topic 2] — partial knowledge (5 days)
🔲 [Topic 3] — starting fresh (8 days)
🔲 [Topic 4] — starting fresh (10 days)
...

We start tomorrow with *[First Topic]*.

Tonight I'm researching everything about [First Topic] — 
official docs, papers, real production examples, known gotchas.
Your first session arrives tomorrow morning.

Any questions about the plan before we begin?
```

---

## Prompts File Structure

All prompts for this agent live in `src/prompts/architect.prompts.ts`:

```typescript
export function discoverySystemPrompt(): string { ... }
export function goalClarificationPrompt(statedGoal: string): string { ... }
export function selfAssessmentPrompt(): string { ... }
export function probingQuestionPrompt(concept: string, userClaim: string): string { ... }
export function timeCommitmentPrompt(): string { ... }
export function priorFailurePrompt(): string { ... }
export function dependencyGraphPrompt(...): string { ... }
export function firstTopicBriefPrompt(...): string { ... }
export function roadmapSummaryPrompt(...): string { ... }
```

---

## Database Functions Required

These must exist in `src/db/` before coding this agent:

| Function | File | Notes |
|----------|------|-------|
| `createProfile(userId, data)` | `profile.ts` | Creates new user_profile row |
| `updateProfileFromArchitect(userId, data, callerAgent)` | `profile.ts` | Enforces architect-only fields |
| `createTopicBrief(userId, data)` | `knowledge-base.ts` | Inserts into topic_briefs |
| `createCurriculumState(userId, topicId, layer1, callerAgent)` | `curriculum.ts` | Creates curriculum_state row |
| `writeToRAG(entry)` | `rag.ts` | Inserts into rag_memory |
| `seedRAGFromConversation(userId, turns, topic)` | `rag.ts` | Batch insert conversation turns |

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| User gives one-word answers in discovery | Ask one follow-up, then proceed with what you have. Never block. |
| User claims expertise in everything | Probe harder. If all probing answers are correct, accept it and reduce curriculum accordingly. |
| User sets unrealistic time (5 mins/day) | Accept it, note it in profile, build a much longer curriculum. Never tell them it's wrong. |
| User's goal is too vague ("I want to learn AI") | Ask one clarifying question: "What would you like to be able to build or do with AI?" |
| User's goal is too narrow ("I want to learn one specific function") | Zoom out to the full topic area — teach the concept, not just the function. |
| Dependency graph LLM call fails | Retry 3 times. If still failing, use a hardcoded fallback graph for common goals (Agentic AI, databases, ML). |
| Profile write fails | Retry once. If still failing, log full profile data and surface error to user. |

---

## Testing This Agent Locally

```bash
# Set MOCK_LLM=false for real test — this agent requires real LLM calls
# Set up test user first:
pnpm run setup:profile

# Run with a test goal:
USER_GOAL="I want to learn Agentic AI" pnpm run dev:learning
```

**Manual test checklist:**
- [ ] Discovery conversation runs through all 5 phases
- [ ] Probing questions adapt to what user claims
- [ ] Misconceptions get flagged when user is confidently wrong
- [ ] Dependency graph includes all prerequisites for the stated goal
- [ ] `user_profile` row created with correct data
- [ ] `topic_briefs` row created with correct first topic
- [ ] `curriculum_state` row created with Layer 1 populated
- [ ] `rag_memory` rows created for each conversation turn
- [ ] Roadmap summary message sent to Telegram correctly
- [ ] Agent returns `currentTopic` in state update

---

## What This Agent Must NOT Do

- Must NOT start teaching anything. Zero teaching. Teaching is for `teaching_node`.
- Must NOT research the topic. Zero research. That is Cartographer's job.
- Must NOT design sessions. Zero session design. That is Curriculum Builder's job.
- Must NOT write to `curriculum_state.layer_2`. Only Layer 1 is Architect's domain.
- Must NOT accept self-assessment without probing at least one claim.
- Must NOT skip the dependency graph if the goal is complex. Every prerequisite must be surfaced.
- Must NOT modify an existing Layer 1 during normal operation. Only quarterly re-evaluation may do this.

---

## Quarterly Re-evaluation Behaviour

When triggered for re-evaluation (not a new topic):

1. Read full profile and RAG history
2. Send user a brief check-in: *"It's been 3 months. Your roadmap has served you well — let's see if it still fits where you're headed."*
3. Run abbreviated discovery (2-3 turns only — you already know this person)
4. Focus on: has the goal changed, has the timeline changed, what have they learned that changes what's next
5. Produce an updated Master Roadmap
6. Increment `layer_1.version`
7. Write to `curriculum_state.layer_1` — the only time Architect writes Layer 1 after initial creation