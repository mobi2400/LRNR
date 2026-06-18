# LRNR — Agent 04: Teaching Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Current Implementation Override

This file contains older Telegram-first examples. Current Phase 1 implementation is frontend-first:

```text
Teaching Agent creates a persisted lesson payload for the frontend.
Telegram receives only an alert/deep link through the notification layer.
```

When this file mentions "Telegram messages" for full lesson delivery, reinterpret that as structured frontend lesson sections:

- mental model
- explanation
- diagram
- code examples
- common mistakes
- review questions
- source references
- next action

Do not send the full lesson as Telegram message sequence in Phase 1.

Current primary output:

```text
structured lesson payload
  -> persisted in curriculum/session state
  -> rendered by frontend
  -> summarized into RAG when useful
  -> announced through Telegram alert/deep link
```

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/teaching.ts` |
| LangGraph node name | `teaching_node` |
| Exported function | `runTeachingAgent(state: LearningGraphState): Promise<Partial<LearningGraphState>>` |
| LLM model | `reasoningLLM()` — `llama-3.3-70b-versatile` |
| Trigger | Daily Learning Workflow at 7:00 AM IST — every day a session is pending |
| Runs in graph | Learning Graph — Route B (after evaluation) and Route C (normal day) |
| Position | Second-to-last node before `delivery_node` |
| Avg runtime | 2-4 minutes |

---

## What This Agent Does — Plain English

The Teaching Agent is the core daily experience. It is the only agent the user directly feels every single day. Everything else in the system exists to make this agent's output better — the Cartographer feeds it real examples, the Curriculum Builder tells it what to cover and at what depth, the RAG gives it personal context, the Evaluation Agent corrects its course when needed.

Its job is to take today's Layer 2 session object — a structured specification of what to teach — and produce a rich, personalised, sequenced learning session delivered as multiple Telegram messages. Not a wall of text. Not a generic explanation copied from the docs. A conversation between a knowledgeable teacher who knows this specific person and exactly where they are in their journey.

Every session follows the 7-phase sequence but only covers the phase relevant to today. Day 3 might be fundamentals phase — so the session is entirely about why this thing exists, what problem it solves, and the first principles behind it. Day 8 might be production phase — so the session is about what breaks at scale, what real companies have done, and what the operational concerns are. The phase determines the character of the entire session.

The Teaching Agent does three things that no static course can do. First, it grounds every explanation in a real example from the Topic Knowledge Base — a named company, a real scenario, what they actually did. Second, it connects today's concept explicitly to something the user learned on a prior day — not vaguely ("this is related to X") but precisely ("on Day 3 you learned how indexes speed up reads by avoiding full table scans — today's concept of query planning is the mechanism that decides whether to use your index or not"). Third, it checks Layer 3 before every session and weaves in any live injections from the Scout or News Agent naturally — not as an interruption but as enrichment.

---

## Inputs

### From LangGraph State
```typescript
{
  userId: string;
  currentTopic: string;
  profile: UserProfile;
  curriculumState: CurriculumState;
}
```

### From Database — All Read at Session Start

```typescript
// Today's session specification from Curriculum Builder
const todaySession = await getTodaySession(userId, currentTopic);

// Live injections from Scout and News agents (consumed and cleared)
const layer3Items = await consumeLayer3Items(userId);

// Personal context — what this user knows, what analogies work, active misconceptions
const ragContext = await queryRAG(userId, {
  topic: currentTopic,
  limit: 15,
  eventTypes: [
    'session_summary',
    'misconception_detected',
    'concept_mastered',
    'gap_detected',
  ],
});

// Real examples, code patterns, interview patterns for today's concepts
const knowledgeBase = await getTopicKnowledgeBase(userId, currentTopic);

// Prior session summaries for explicit connection building
const priorSessions = await queryRAG(userId, {
  topic: currentTopic,
  eventType: 'session_summary',
  limit: 5,
});
```

---

## Outputs

### 1. Telegram Messages — The Lesson

Delivered as multiple sequential messages via Telegraf. Full format specification below.

### 2. Session Record → `curriculum_state`

```typescript
// Mark today's session as delivered
await markSessionDelivered(userId, todaySession.sessionId, 'teaching_node');
```

### 3. Session Summary → `rag_memory`

```typescript
// Written after delivery so future sessions and evaluations have context
await writeToRAG({
  userId,
  content: sessionSummary,        // 2-3 sentence summary of what was taught today
  eventType: 'session_summary',
  topic: currentTopic,
  concept: todaySession.conceptsToCover.join(', '),
  dayNumber: todaySession.dayNumber,
  sourceAgent: 'teaching_node',
  confidence: 1.0,
});
```

---

## Session Structure — Telegram Message Format

Every session is delivered as 5-7 sequential Telegram messages. Each message is a distinct unit with a clear purpose. Never combine multiple purposes into one message — the separation is intentional. It gives the user time to absorb each piece before the next arrives.

---

### Message 1 — Layer 3 Injection (conditional — only if layer3Items exist)

**Condition:** Send only if `layer3Items.length > 0`

**Purpose:** Surface live context before the lesson begins. Connects the real world to what the user is about to learn.

**Format:**
```
⚡ *Before we start today —*

{layer3Item.content}

_Keep this in mind as we go through today's session._
```

**Rules:**
- Maximum 1 Layer 3 item per session. If multiple exist, pick the highest priority.
- Remaining items stay in Layer 3 queue for tomorrow.
- Layer 3 content comes pre-formatted from the agent that wrote it — do not reformat.
- If the item is a news connection: end with "This is directly relevant to what we're covering today."
- If the item is a contradiction flag: end with "We'll address this directly in today's session."

---

### Message 2 — Session Header

**Purpose:** Orient the user. Tell them exactly where they are in the journey and what today is about.

**Format:**
```
📚 *Day {dayNumber} — {topicName}*
_{phase} phase · {conceptsToCover joined with ' + '}_

━━━━━━━━━━━━━━━━━━━━

{connectionToPrior}
```

**Rules:**
- `connectionToPrior` from the session object — show it verbatim if it's good, improve it if it's generic
- Phase name displayed in title case: "Fundamentals", "Architecture", "Under the Hood", "Production", "Tradeoffs", "Code", "Visuals"
- Day number visible always — user needs to know their progress

---

### Message 3 — Core Concept Explanation

**Purpose:** The main teaching. This is the largest and most important message.

**Content varies by phase:**

**Fundamentals phase:**
```
*Why does {concept} exist?*

{problem that existed before}

{what this concept is — explained via the problem it solves, not a definition}

*The mental model:*
{one clear analogy or mental model — grounded in something the user already knows from prior sessions or general knowledge}
```

**Architecture phase:**
```
*How {concept} is designed*

{the key architectural decision and why it was made}

{what the design makes easy and what it makes hard — always both}

*The thing most explanations miss:*
{the non-obvious insight that separates surface understanding from real understanding}
```

**Under the Hood (internals) phase:**
```
*What actually happens when you use {concept}*

{step-by-step of what the system does internally — concrete, not abstract}

*Why this matters:*
{how knowing the internals changes how you use it — practical implication}
```

**Production phase:**
```
*{concept} in production*

{what changes when real traffic hits — what the tutorial never shows you}

*What breaks first:*
{the specific failure mode that hits most teams — precise, not vague}

*The fix:*
{what you actually do — not a generic best practice, a real pattern}
```

**Tradeoffs phase:**
```
*When to use {concept} — and when not to*

✅ *Use it when:*
{2-3 specific scenarios where this is the right choice}

❌ *Don't use it when:*
{2-3 specific scenarios where this is the wrong choice — be specific, not vague}

*The question to ask:*
{the single question that clarifies which situation you're in}
```

**Code phase:**
```
*{concept} in code*

By now you understand what {concept} does and why. Here's what that looks like:

\`\`\`{language}
{clean, minimal, well-commented code snippet from knowledge base}
\`\`\`

*What to notice:*
{2-3 specific things to observe in the code — not line-by-line explanation, highlights}

*Common mistake:*
{the thing most people write wrong on first attempt and why}
```

**Visuals phase:**
```
*{concept} — the full picture*

{text description of the diagram/flowchart — Telegram can't render inline diagrams}

*The flow:*
{step-by-step walkthrough of the process as numbered list}

*How this connects to everything:*
{explicit connections to 3-4 concepts covered in earlier sessions}
```

---

### Message 4 — Real Production Example

**Purpose:** Ground the abstract in the concrete. Every concept must be seen in a real scenario.

**Source:** Pull from `knowledgeBase.productionExamples` — the real example referenced in the session object (`realExampleRef`).

**Format:**
```
🏢 *Real world: {company}*

*The situation:*
{scenario — what the company was dealing with}

*What they did:*
{whatTheyDid — their specific approach}

*The outcome:*
{outcome — what happened, what they learned}

[Source →]({sourceUrl})
```

**Fallback if no real example in knowledge base:**
```
🏢 *How this plays out in practice*

{construct a realistic but clearly fictional scenario: "Imagine a mid-sized SaaS product with 500K users..."}

_Note: This is a constructed example — real-world write-ups on this specific topic are in the Scout's watch list._
```

**Rules:**
- Never fabricate a company name or attribute false actions to real companies
- If using the fallback, always label it as a constructed example
- Keep the example focused on the concept being taught — not a full system design

---

### Message 5 — Misconception Address (conditional)

**Condition:** Send only if `todaySession.misconceptionToAddress` exists (set by Curriculum Builder from Evaluation Agent findings).

**Purpose:** Correct a detected misconception before it gets built upon.

**Format:**
```
⚠️ *A common confusion about {concept}*

Many people (including you, based on our earlier conversation) initially think:
"{the misconception}"

Here's why that's not quite right:
{clear, non-judgmental correction — 2-3 sentences}

*The accurate model:*
{replacement mental model}
```

**Rules:**
- Never say "you were wrong" — say "many people initially think" or "it's easy to believe"
- Always replace the wrong model with the correct one — never just say what's wrong
- Keep tone warm. The user should feel helped, not corrected.

---

### Message 6 — Tomorrow Preview

**Purpose:** Build anticipation. Give the user a reason to come back tomorrow.

**Format:**
```
━━━━━━━━━━━━━━━━━━━━
*Tomorrow:* {tomorrowPreview from session object}

{one sentence on why tomorrow's concept matters — the hook}

_See you at 7am_ 🧠
```

**Rules:**
- Pull `tomorrowPreview` from session object — it was written by Curriculum Builder with full context
- Add one sentence of your own that creates genuine anticipation — not hype, a real hook
- If today is the last session of the topic: replace with a completion message (see below)

---

### Message 7 — Topic Completion (conditional — only on final session)

**Condition:** Send only if `todaySession.dayNumber` equals total sessions for this topic.

**Format:**
```
🎓 *{topicName} — Complete*

You've covered:
• {3-5 key concepts mastered, specific}

In the next evaluation session, we'll confirm you're ready to move to {nextTopicName}.

Your roadmap continues with: *{nextTopicName}*
_{brief sentence on how it connects to what you just learned}_
```

---

## LLM Prompt Structure

The Teaching Agent makes multiple LLM calls — one per message that requires generation (not all messages are LLM-generated).

### System Prompt

```typescript
export function teachingSystemPrompt(): string {
  return `You are the Teaching Agent for LRNR, a Personal AI University.

Your job is to write one section of a daily learning session delivered via Telegram.
You are writing for a specific person — not a generic audience.

CORE PRINCIPLES:
1. Never explain what something is before explaining why it exists. Problem first, solution second. Always.
2. Ground every explanation in a concrete example. Abstract explanations without examples are forbidden.
3. Connect today's concept to something the user already learned. Explicit connections, not vague ones.
4. Respect the phase. A fundamentals-phase session does not include code. A code-phase session does not re-explain fundamentals.
5. Be precise about tradeoffs. "It depends" is never an acceptable answer. Name what it depends on.
6. Write like a knowledgeable friend explaining over a whiteboard — not a textbook, not a tutorial.

TELEGRAM FORMATTING RULES:
- Use *text* for bold
- Use _text_ for italic
- Use \`code\` for inline code
- Use \`\`\`language\\ncode\`\`\` for code blocks
- Use • for bullet points
- Maximum message length: 4000 characters
- No HTML tags

OUTPUT: Return only the message content. No preamble, no "here is the message", just the content.`;
}
```

### Per-Message Prompts

```typescript
export function coreExplanationPrompt(
  session: Layer2Session,
  knowledgeBase: TopicKnowledgeBase,
  ragContext: RAGContext,
  priorSessions: RAGMemoryEntry[],
  topicBrief: TopicBrief,
  userProfile: UserProfile
): string {
  const activeMisconceptions = ragContext.entries
    .filter(e => e.eventType === 'misconception_detected' && !e.isResolved)
    .map(e => e.content);

  const priorConcepts = priorSessions
    .map(s => `Day ${s.dayNumber}: ${s.concept}`)
    .join(', ');

  return `Write the core concept explanation for today's learning session.

SESSION DETAILS:
- Concept(s): ${session.conceptsToCover.join(', ')}
- Phase: ${session.phase}
- Depth required: ${session.depthLevel}
- Day number: ${session.dayNumber}
- Topic: ${topicBrief.topicName}

USER CONTEXT:
- Goal: ${topicBrief.whyLearning}
- Time commitment: ${userProfile.timeCommitmentMins} minutes per day
- Prior concepts covered: ${priorConcepts || 'This is Day 1'}
- Active misconceptions to be aware of (do NOT directly address here — that is Message 5):
  ${activeMisconceptions.length > 0 ? activeMisconceptions.join('\n  ') : 'None'}

KNOWLEDGE BASE CONTEXT:
Relevant core concepts found during research:
${JSON.stringify(
  knowledgeBase.coreConcepts
    .filter(c => session.conceptsToCover.some(sc =>
      c.concept.toLowerCase().includes(sc.toLowerCase())
    ))
    .slice(0, 3),
  null, 2
)}

Relevant architecture decisions:
${JSON.stringify(
  knowledgeBase.archDecisions.slice(0, 2),
  null, 2
)}

Historical context:
${JSON.stringify(knowledgeBase.historicalContext, null, 2)}

CONNECTION TO PRIOR LEARNING:
${session.connectionToPrior}

Follow the ${session.phase} phase format exactly as specified in your instructions.
Maximum 800 words. Write for Telegram — use formatting marks.`;
}

export function productionExamplePrompt(
  session: Layer2Session,
  example: ProductionExample | null,
  concept: string
): string {
  if (example) {
    return `Format this real production example for a Telegram learning session.

Concept being taught: ${concept}

Example data:
Company: ${example.company}
Scenario: ${example.scenario}
What they did: ${example.whatTheyDid}
Outcome: ${example.outcome}
Source: ${example.sourceUrl}

Format using the production example template. Keep it concrete and focused on the concept.
Do not add information not present in the example. Do not fabricate details.`;
  }

  return `Write a realistic constructed example for a Telegram learning session.

Concept being taught: ${concept}

Rules:
- Do not use a real company name
- Use "a mid-sized SaaS product" or similar realistic framing
- Make the scenario specific and plausible
- End with "Note: This is a constructed example"
- Keep it under 200 words`;
}

export function tomorrowPreviewPrompt(
  tomorrowPreview: string,
  tomorrowConcept: string,
  topicName: string
): string {
  return `Write the "tomorrow preview" message for a Telegram learning session.

Tomorrow's concept: ${tomorrowConcept}
Preview text from curriculum: ${tomorrowPreview}
Topic: ${topicName}

Write ONE additional sentence (beyond the preview) that creates genuine anticipation.
Not hype. A real hook — something specific about tomorrow's concept that makes it feel important to understand.
Format for Telegram. Under 100 words total for the full preview message.`;
}
```

---

## Layer 3 Injection Handling

```typescript
async function processLayer3Injections(
  userId: string,
  layer3Items: Layer3Item[],
  session: Layer2Session
): Promise<{ itemToShow: Layer3Item | null; remainingItems: Layer3Item[] }> {
  if (layer3Items.length === 0) {
    return { itemToShow: null, remainingItems: [] };
  }

  // Sort by priority — high first
  const sorted = [...layer3Items].sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    return 0;
  });

  const itemToShow = sorted[0];
  const remainingItems = sorted.slice(1);

  // Mark consumed item
  await markLayer3ItemConsumed(userId, itemToShow.itemId, session.sessionId);

  // Expired items — drop silently
  const now = new Date();
  const validRemaining = remainingItems.filter(
    item => new Date(item.expiresAt) > now
  );

  return { itemToShow, remainingItems: validRemaining };
}
```

---

## Telegram Delivery — Message Sending Logic

```typescript
// src/agents/teaching.ts — delivery section

async function deliverSession(
  userId: string,
  messages: TeachingMessage[],
  telegram: TelegramService
): Promise<void> {
  for (const message of messages) {
    if (!message.content || message.content.trim() === '') continue;

    // Enforce Telegram's 4096 char limit
    const content = message.content.length > 4000
      ? message.content.slice(0, 3990) + '…'
      : message.content;

    await telegram.sendMessage(userId, content, { parseMode: 'Markdown' });

    // Rate limiting — Telegram allows ~30 messages/second but we're gentle
    await sleep(600);
  }
}

// Message assembly — which messages to send and in what order
async function assembleSessionMessages(
  session: Layer2Session,
  layer3Item: Layer3Item | null,
  knowledgeBase: TopicKnowledgeBase,
  ragContext: RAGContext,
  priorSessions: RAGMemoryEntry[],
  topicBrief: TopicBrief,
  userProfile: UserProfile,
  isLastSession: boolean
): Promise<TeachingMessage[]> {
  const messages: TeachingMessage[] = [];

  // Message 1 — Layer 3 injection (conditional)
  if (layer3Item) {
    messages.push({
      type: 'layer3_injection',
      content: formatLayer3Message(layer3Item),
    });
  }

  // Message 2 — Session header (no LLM needed — structured data)
  messages.push({
    type: 'header',
    content: formatSessionHeader(session, topicBrief),
  });

  // Message 3 — Core explanation (LLM)
  const coreExplanation = await reasoningLLM([
    { role: 'system', content: teachingSystemPrompt() },
    { role: 'user', content: coreExplanationPrompt(
        session, knowledgeBase, ragContext, priorSessions, topicBrief, userProfile
      )
    },
  ], { temperature: 0.7, maxTokens: 1500 });

  messages.push({ type: 'core_explanation', content: coreExplanation });

  // Message 4 — Production example (LLM)
  const relevantExample = findRelevantExample(
    session.conceptsToCover,
    knowledgeBase.productionExamples
  );

  const exampleContent = await reasoningLLM([
    { role: 'system', content: teachingSystemPrompt() },
    { role: 'user', content: productionExamplePrompt(
        session, relevantExample, session.conceptsToCover[0]
      )
    },
  ], { temperature: 0.5, maxTokens: 500 });

  messages.push({ type: 'production_example', content: exampleContent });

  // Message 5 — Misconception address (conditional, no LLM — use template)
  if (session.misconceptionToAddress) {
    messages.push({
      type: 'misconception',
      content: formatMisconceptionMessage(session.misconceptionToAddress),
    });
  }

  // Message 6 — Tomorrow preview (LLM) or completion (conditional)
  if (isLastSession) {
    messages.push({
      type: 'completion',
      content: await formatCompletionMessage(session, topicBrief),
    });
  } else {
    const preview = await reasoningLLM([
      { role: 'system', content: teachingSystemPrompt() },
      { role: 'user', content: tomorrowPreviewPrompt(
          session.tomorrowPreview,
          '',
          topicBrief.topicName
        )
      },
    ], { temperature: 0.7, maxTokens: 200 });

    messages.push({ type: 'tomorrow_preview', content: preview });
  }

  return messages;
}
```

---

## Session Summary Generation

After delivery, generate a session summary for the RAG:

```typescript
export function sessionSummaryPrompt(
  session: Layer2Session,
  coreExplanationContent: string,
  topicName: string
): string {
  return `Write a 2-3 sentence factual summary of what was taught in this learning session.
This summary will be used by future sessions and the Evaluation Agent for context.

Topic: ${topicName}
Day: ${session.dayNumber}
Concepts covered: ${session.conceptsToCover.join(', ')}
Phase: ${session.phase}

Core explanation (summarise this):
${coreExplanationContent.slice(0, 1000)}

Write the summary as plain text. No formatting. Factual only — what was taught, not how it felt.
Maximum 3 sentences.`;
}
```

---

## Helper Functions

```typescript
function formatSessionHeader(
  session: Layer2Session,
  topicBrief: TopicBrief
): string {
  const phaseDisplay: Record<string, string> = {
    fundamentals: 'Fundamentals',
    architecture: 'Architecture',
    internals:    'Under the Hood',
    production:   'Production',
    tradeoffs:    'Tradeoffs',
    code:         'Code',
    visuals:      'Visuals',
  };

  return [
    `📚 *Day ${session.dayNumber} — ${topicBrief.topicName}*`,
    `_${phaseDisplay[session.phase]} · ${session.conceptsToCover.join(' + ')}_`,
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    session.connectionToPrior,
  ].join('\n');
}

function formatLayer3Message(item: Layer3Item): string {
  const prefix = item.type === 'news_connection'
    ? '⚡ *Before we start today —*'
    : item.type === 'contradiction_flag'
    ? '⚠️ *Something to keep in mind —*'
    : '🔍 *Fresh from the research —*';

  return `${prefix}\n\n${item.content}\n\n_Keep this in mind as we go through today's session._`;
}

function formatMisconceptionMessage(misconception: string): string {
  // misconception is a pre-formatted string from Curriculum Builder
  // Contains the concept name and the misconception description
  return `⚠️ *A common confusion*\n\n${misconception}`;
}

function findRelevantExample(
  concepts: string[],
  examples: ProductionExample[]
): ProductionExample | null {
  const terms = concepts.flatMap(c => c.toLowerCase().split(/\s+/));
  let best: ProductionExample | null = null;
  let bestScore = 0;

  for (const ex of examples) {
    const text = `${ex.scenario} ${ex.whatTheyDid}`.toLowerCase();
    const score = terms.filter(t => text.includes(t)).length;
    if (score > bestScore) { bestScore = score; best = ex; }
  }
  return best;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Prompts File Structure

All prompts live in `src/prompts/teaching.prompts.ts`:

```typescript
export function teachingSystemPrompt(): string { ... }
export function coreExplanationPrompt(session, knowledgeBase, ragContext, priorSessions, topicBrief, userProfile): string { ... }
export function productionExamplePrompt(session, example, concept): string { ... }
export function misconceptionAddressPrompt(misconception: string): string { ... }
export function tomorrowPreviewPrompt(preview, tomorrowConcept, topicName): string { ... }
export function sessionSummaryPrompt(session, coreContent, topicName): string { ... }
export function completionMessagePrompt(session, topicBrief, nextTopic): string { ... }
```

---

## Database Functions Required

| Function | File | Notes |
|----------|------|-------|
| `getTodaySession(userId, topic)` | `curriculum.ts` | Gets pending Layer 2 session for today |
| `consumeLayer3Items(userId)` | `curriculum.ts` | Reads and returns Layer 3 items, marks consumed |
| `markLayer3ItemConsumed(userId, itemId, sessionId)` | `curriculum.ts` | Updates consumed status |
| `markSessionDelivered(userId, sessionId, callerAgent)` | `curriculum.ts` | Updates session status |
| `getTopicKnowledgeBase(userId, topic)` | `knowledge-base.ts` | Full knowledge base read |
| `queryRAG(userId, filters)` | `rag.ts` | Flexible RAG query |
| `writeToRAG(entry)` | `rag.ts` | Write session summary |
| `getTopicBrief(userId, topic)` | `knowledge-base.ts` | Read topic brief for context |

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| No session found for today | Send Telegram message: "No session scheduled for today — your next session is on [date]." Return `deliveryStatus: 'skipped'`. |
| Knowledge base missing for topic | Teach from topic brief alone. Mark session as partial. Add note to Layer 3 for tomorrow. |
| Core explanation LLM call fails | Retry 3 times. If still failing, send a minimal session with just the concept name and a "we'll retry tomorrow" message. Never silently fail. |
| Production example LLM call fails | Use fallback template with constructed example. Do not block full session delivery. |
| Telegram send fails on one message | Retry once. If still failing, log and continue to next message. Do not block remaining messages. |
| Layer 3 item content is malformed | Log and skip that item. Do not surface to user. |
| Session already delivered today | Check `session.status === 'delivered'` before proceeding. If already delivered, return `deliveryStatus: 'already_delivered'`. Do not re-send. |
| User changed topic mid-session | Not possible in current architecture — topic only changes via Architect Agent which requires explicit user action. |

---

## Testing This Agent Locally

```bash
# Requires session to exist in curriculum_state.layer_2
# Run after architect, cartographer, and curriculum-builder have run
MOCK_LLM=false pnpm run dev:learning
```

**Manual test checklist:**
- [ ] Session header message formatted correctly with day number and phase
- [ ] Core explanation follows the correct phase format (fundamentals/architecture/etc)
- [ ] Production example uses real Knowledge Base data when available
- [ ] Fallback example is clearly labelled as constructed
- [ ] Layer 3 message appears first when items exist
- [ ] Misconception message appears when `misconceptionToAddress` is set
- [ ] Tomorrow preview appears on all sessions except last
- [ ] Completion message appears on final session
- [ ] Messages sent in correct order with 600ms delay
- [ ] Session marked as `delivered` in `curriculum_state`
- [ ] Session summary written to `rag_memory`
- [ ] Agent handles Telegram formatting errors gracefully

---

## What This Agent Must NOT Do

- Must NOT evaluate the user. No questions about understanding. That is Evaluation Agent's job.
- Must NOT modify the curriculum. No writes to Layer 1 or Layer 2. Read-only on curriculum.
- Must NOT teach content from outside the Knowledge Base without clearly marking it as constructed.
- Must NOT combine two different phases in one session. If today is fundamentals, it is entirely fundamentals.
- Must NOT send more than 7 messages per session. If content is too long, trim — never add messages.
- Must NOT write to `user_profile`. No profile writes.
- Must NOT fabricate company names or attribute false scenarios to real companies.
- Must NOT re-send a session that is already marked as `delivered`.
- Must NOT surface Layer 3 items that have expired past their `expiresAt` timestamp.
- Must NOT skip the RAG write at the end. Future sessions depend on this context.
