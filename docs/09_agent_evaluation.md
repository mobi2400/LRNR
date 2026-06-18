# LRNR — Agent 05: Evaluation Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/evaluation.ts` |
| LangGraph node name | `evaluation_node` |
| Exported function | `runEvaluationAgent(state: LearningGraphState): Promise<Partial<LearningGraphState>>` |
| LLM model | `reasoningLLM()` — `llama-3.3-70b-versatile` |
| Trigger | When `profile.nextEvaluationDue <= today` — detected by `route_node` in Learning Graph |
| Runs in graph | Learning Graph — Route B (evaluation due) |
| Position | First node on Route B — runs before Curriculum Builder and Teaching on evaluation days |
| Avg runtime | 5-15 minutes (multi-turn conversation) |

---

## What This Agent Does — Plain English

The Evaluation Agent is the system's truth-teller. Every 2-3 days, instead of delivering a teaching session, it runs a detective-mode conversation with the user. Its sole purpose is to find the difference between what the user genuinely understands and what they can recite — and to find it without the user feeling interrogated.

This distinction is everything. A quiz finds what someone memorised. The Evaluation Agent finds what someone actually understands. It does this through six question angles — each designed to reveal a different layer of comprehension. Direct recall shows surface familiarity. Application shows whether knowledge transfers to real scenarios. Stress-testing shows whether understanding is deep enough to defend. Edge cases reveal production depth. Connection questions reveal whether knowledge is isolated or integrated. Historical questions reveal whether the person understands the problem, not just the solution.

The agent never asks all six angles in one session. It reads the user's profile and RAG history and selects the angles most likely to find gaps given what has been covered and what has been weak in prior sessions. If the user has been strong on direct recall but never tested on edge cases — the agent goes for edge cases. If a prior session noted confusion around a specific concept — the agent probes that concept from a different angle than it was taught.

When the agent finds a gap or misconception, it does not correct immediately. It follows up from a different angle to understand whether this is a surface gap (concept never deeply explained), a foundational gap (the prerequisite concept is shaky), or a misconception (an actively wrong belief). The fix is completely different for each, and the Evaluation Agent must classify correctly before writing to the queue.

The user experience of this agent should feel like a thoughtful conversation with a smart colleague who is curious about your thinking — not an exam. The agent is warm, never dismissive of partial answers, and always finds something to acknowledge before probing deeper.

---

## Voice UX With ElevenLabs

ElevenLabs should be integrated as a voice layer for evaluation in this version of the product experience.

Purpose:

- make evaluation feel more conversational
- reduce fatigue during difficult questions
- let the user hear a question in a more natural tone
- support rephrasing from a different angle
- provide short spoken encouragement between questions
- explain the purpose of a question before the user answers
- allow the user to answer by voice
- convert spoken answers into reviewed transcripts before scoring

Important rule:

```text
Text remains the source of truth. Voice is a UX enhancement.
The confirmed transcript is the evaluated answer.
```

The Evaluation Agent should always produce the written question, written follow-up, written analysis, and structured records first. The backend can then generate audio from the approved text.

For user answers, the Evaluation Agent should evaluate the confirmed transcript, not raw audio. The frontend should let the owner review and edit the transcript before final submission.

Do not let the voice provider decide:

- what question to ask
- whether the answer is correct
- what mastery score to assign
- what remediation should be queued
- whether an unconfirmed transcript is accurate

ElevenLabs should read approved LRNR content and help transcribe spoken answers. It should not become an evaluator.

### Voice use during different question angles

Voice can help each evaluation angle feel distinct:

| Angle | Voice UX idea |
|---|---|
| Direct recall | Ask calmly and briefly |
| Application | Read the scenario like a real engineering situation |
| Stress test | Use a curious challenge tone, not an aggressive tone |
| Edge case | Slow down and emphasize the constraint |
| Connection | Remind the user of the prior concept before asking |
| Historical | Tell the problem context before asking why the solution exists |

### Voice rephrase rule

If the user is stuck, LRNR may offer:

```text
Hear this from another angle
```

That should generate a rephrased explanation or question using the Evaluation Agent/LLM first, validate it, then optionally send it to ElevenLabs for audio.

The system must not skip evaluation scoring just because the learner requested audio help.

### Voice answer rule

The user can answer by speaking.

Required flow:

```text
spoken answer
  -> transcription
  -> transcript shown to user
  -> user confirms or edits
  -> confirmed transcript enters evaluation
  -> transcript is stored in evaluation_sessions
```

Why this matters:

- speech recognition can make mistakes
- wrong transcripts can create false mastery evidence
- text records are easier to review, debug, and use in RAG
- the system remains usable even when audio fails

Raw audio should be temporary by default. The confirmed transcript is the durable learning artifact.

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

### From Database — Read at Evaluation Start

```typescript
// Current position and what has been taught
const curriculumState = await getActiveCurriculumState(userId);
const currentDay = curriculumState.currentDay;

// All session summaries since last evaluation
const recentSessions = await queryRAG(userId, {
  topic: currentTopic,
  eventType: 'session_summary',
  limit: 10,
});

// Prior evaluation results — what was weak before
const priorEvaluations = await getEvaluationSessions(userId, currentTopicId);

// Active misconceptions — what to probe
const activeMisconceptions = await queryRAG(userId, {
  topic: currentTopic,
  eventType: 'misconception_detected',
  isResolved: false,
});

// Knowledge depth map — current state per concept
const knowledgeMap = profile.knowledgeDepthMap;
```

---

## Outputs

### 1. Gap Analysis → `rag_memory`

```typescript
// Written after evaluation completes
await writeToRAG({
  userId,
  content: gapDescription,
  eventType: 'gap_detected',
  topic: currentTopic,
  concept: gapConcept,
  sourceAgent: 'evaluation_node',
  confidence: gapConfidence,     // 0.7-1.0 based on how clearly the gap was demonstrated
  isResolved: false,
});
```

### 2. Misconception Updates → `rag_memory` + `user_profile`

```typescript
// New misconceptions found
await writeToRAG({
  userId,
  content: `Misconception: ${misconceptionText} (concept: ${concept})`,
  eventType: 'misconception_detected',
  topic: currentTopic,
  concept: concept,
  sourceAgent: 'evaluation_node',
  confidence: 0.9,
  isResolved: false,
});

// Resolved misconceptions (if evaluation shows prior misconception is now correct)
await resolveRAGMisconception(userId, misconceptionId);
await updateMisconceptionStatus(userId, concept, 'corrected', 'evaluation_node');
```

### 3. Mastery Score Updates → `user_profile`

```typescript
// Update per-concept mastery scores based on evaluation performance
await updateMasteryScore(userId, concept, {
  canSolve: evaluatedScore,     // 0-1
  canExplain: evaluatedScore,   // 0-1
  canDecide: evaluatedScore,    // 0-1
  overall: weightedAverage,
}, 'evaluation_node');
```

### 4. Remediation Items → `agent_update_queue`

```typescript
// Priority 1 items for Curriculum Builder to process tonight
await addToQueue({
  userId,
  sourceAgent: 'evaluation_node',
  updateType: 'evaluation_gap',
  priority: 1,
  content: {
    concept: gapConcept,
    gapDescription: gapText,
    remediationPlan: remediationPlan,
    targetDayHint: currentDay + 3,    // earliest it can appear (N+2 from tomorrow)
  },
  topicId: currentTopicId,
});
```

### 5. Next Evaluation Date → `user_profile`

```typescript
await updateNextEvaluationDue(userId, calculateNextEvaluationDate(), 'evaluation_node');
```

### 6. Evaluation Session Record → `evaluation_sessions`

```typescript
await createEvaluationSession({
  userId,
  topicId: currentTopicId,
  dayNumber: currentDay,
  conceptsEvaluated,
  qaLog,                          // full conversation with analysis per turn
  gapsFound,
  misconceptions,
  conceptsConfirmed,
  masteryDelta,
  remediationQueued: true,
});
```

---

## The Six Question Angles — Full Specification

### Angle 1 — Direct Recall

**What it reveals:** Whether the user can retrieve and articulate the concept in their own words. Distinguishes "I've seen this" from "I know this."

**When to use:** First evaluation of a concept. Baseline measurement.

**Example questions:**
```
"Explain {concept} to me in your own words. Pretend I've never heard of it."

"Walk me through what happens step by step when you {action using concept}."

"What is the core purpose of {concept}? Not the definition — what problem does it exist to solve?"
```

**What a surface answer looks like:** Repeats definition. Uses the same words as the documentation. Cannot explain without jargon.

**What a working answer looks like:** Explains in plain terms. Uses an analogy. Can say what it replaces or what breaks without it.

**What a deep answer looks like:** Explains the why before the what. Mentions edge cases unprompted. Connects it to adjacent concepts.

---

### Angle 2 — Application

**What it reveals:** Whether knowledge transfers to a real scenario. The gap between knowing a concept and using it.

**When to use:** After Angle 1 shows working-level understanding. Tests whether understanding is practical.

**Example questions:**
```
"You're building {realistic scenario related to current topic}. How do you approach {specific aspect using today's concept}?"

"Your team is debating between {option A using concept} and {option B not using it}. What do you argue and why?"

"Design the data model for {realistic system}. Walk me through your thinking."
```

**What a surface answer looks like:** Describes using the concept without explaining why. Copies the tutorial pattern exactly.

**What a working answer looks like:** Adapts the concept to the scenario. Mentions one or two constraints.

**What a deep answer looks like:** Considers the tradeoffs of the approach. Asks clarifying questions about scale or requirements before answering.

---

### Angle 3 — Stress Testing

**What it reveals:** Whether understanding is deep enough to defend a position or concede when wrong. Tests intellectual honesty and depth.

**When to use:** When prior angles show working knowledge. Finds the ceiling.

**Example questions:**
```
"Someone senior tells you {common but wrong belief about the concept}. How do you respond?"

"A colleague says '{the concept} is just {oversimplification} — we don't need it.' What's your response?"

"Make the strongest case AGAINST using {concept}. When is it genuinely the wrong choice?"
```

**What a surface answer looks like:** Agrees with the premise to avoid conflict. Or disagrees without being able to explain why.

**What a working answer looks like:** Identifies what's wrong with the premise. Can partially defend their position.

**What a deep answer looks like:** Engages with the strongest version of the opposing argument. Can say "they have a point about X, but here's where the argument breaks down..."

---

### Angle 4 — Edge Cases

**What it reveals:** Production depth. Whether the user has thought about failure modes, limits, and what the documentation doesn't cover.

**When to use:** When user has shown working or deep knowledge on other angles. This is the hardest angle.

**Example questions:**
```
"What happens to your system when {the concept fails in a specific way}? Walk through it."

"You're at 10x your current scale. Which assumption you've made about {concept} breaks first?"

"A bug report says {plausible edge case scenario}. Where do you look first and why?"
```

**What a surface answer looks like:** "It would throw an error." "You'd need to handle that." Generic, vague.

**What a working answer looks like:** Identifies the specific failure mode. Has a general approach to investigating.

**What a deep answer looks like:** Traces the failure through the system. Knows exactly which component is responsible. Has seen or read about this specific issue before.

---

### Angle 5 — Connection

**What it reveals:** Whether knowledge is isolated or integrated into a broader mental model. The difference between knowing facts and building wisdom.

**When to use:** Later in the topic when several concepts have been covered. Best used when two recent concepts have an interesting relationship.

**Example questions:**
```
"You learned {concept A} on Day {X} and {concept B} on Day {Y}. How do they relate? Where do they conflict?"

"How is {current concept} similar to {concept from a different domain the user knows}?"

"If you had to explain {today's concept} using only {prior concept} as a reference point, how would you do it?"
```

**What a surface answer looks like:** "They're both part of {topic}." Generic connection. No specifics.

**What a working answer looks like:** Identifies a real relationship between the concepts. Can explain one in terms of the other.

**What a deep answer looks like:** Identifies both the similarity AND the important difference. Knows when the analogy breaks down.

---

### Angle 6 — Historical

**What it reveals:** Whether the user understands the problem that motivated the solution. Deep understanding always includes understanding why something was invented.

**When to use:** Early in a topic when fundamentals have been covered. Also effective as a final check.

**Example questions:**
```
"What was the world like before {concept} existed? What were people doing instead?"

"Why was {concept} built? What was so painful about the alternatives that someone sat down and built this?"

"What would break in your current stack if {concept} suddenly didn't exist? Be specific."
```

**What a surface answer looks like:** "It was more complicated." "People had to do it manually." Vague.

**What a working answer looks like:** Names a specific pain point. Can say what the alternative was.

**What a deep answer looks like:** Understands the historical sequence. Can explain why the specific design decisions were made given the context at the time.

---

## Question Selection Logic

The agent never randomly picks angles. It selects based on profile and history:

```typescript
function selectQuestionAngles(
  profile: UserProfile,
  priorEvaluations: EvaluationSession[],
  recentSessions: RAGMemoryEntry[],
  activeMisconceptions: RAGMemoryEntry[]
): QuestionAngle[] {
  const conceptsCovered = recentSessions.map(s => s.concept).filter(Boolean);
  const lastEvaluation = priorEvaluations[priorEvaluations.length - 1];

  const angles: QuestionAngle[] = [];

  // Always start with a warm-up — direct recall on the most recent concept
  angles.push({
    angle: 'direct_recall',
    concept: conceptsCovered[conceptsCovered.length - 1] ?? '',
    reason: 'warm-up — most recent concept',
  });

  // If active misconceptions exist — stress test the specific area
  if (activeMisconceptions.length > 0) {
    angles.push({
      angle: 'stress_testing',
      concept: activeMisconceptions[0].concept ?? '',
      reason: 'target active misconception',
    });
  }

  // If user has been strong on recall — push to application
  const lastAngleStrong = lastEvaluation?.qaLog
    .filter(qa => qa.angle === 'direct_recall')
    .every(qa => qa.analysis.includes('deep') || qa.analysis.includes('working'));

  if (lastAngleStrong) {
    angles.push({
      angle: 'application',
      concept: conceptsCovered[Math.floor(conceptsCovered.length / 2)] ?? '',
      reason: 'user strong on recall — test application',
    });
  }

  // Edge cases if user has completed production phase sessions
  const hasProductionSessions = recentSessions.some(s => s.content.includes('production'));
  if (hasProductionSessions) {
    angles.push({
      angle: 'edge_cases',
      concept: conceptsCovered[0] ?? '',
      reason: 'production phase complete — test edge cases',
    });
  }

  // Connection question if 5+ sessions complete
  if (recentSessions.length >= 5) {
    angles.push({
      angle: 'connection',
      concept: `${conceptsCovered[0]} + ${conceptsCovered[conceptsCovered.length - 1]}`,
      reason: 'enough coverage for connection testing',
    });
  }

  // Maximum 4 questions per session — keep it conversational, not exhausting
  return angles.slice(0, 4);
}
```

---

## Full Evaluation Flow — Step by Step

### Step 1 — Opening Message

```typescript
const openingMessage = `
🔍 *Evaluation Day*

Before your next session, let's check in on what you've been learning.

This is a conversation, not a test. There are no wrong answers — only useful signals 
for both of us about where to go deeper.

Ready?
`;
```

### Step 2 — Run Question Loop

```typescript
async function runEvaluationLoop(
  userId: string,
  angles: QuestionAngle[],
  knowledgeBase: TopicKnowledgeBase,
  profile: UserProfile,
  telegram: TelegramService
): Promise<EvaluationQALog[]> {
  const qaLog: EvaluationQALog[] = [];
  const conversationHistory: LLMMessage[] = [];

  for (const angleSpec of angles) {
    // Generate question for this angle
    const questionRaw = await reasoningLLM([
      { role: 'system', content: evaluationSystemPrompt() },
      ...conversationHistory,
      { role: 'user', content: questionGenerationPrompt(angleSpec, knowledgeBase, profile, qaLog) },
    ], { temperature: 0.6, maxTokens: 300 });

    const question = questionRaw.trim();

    // Send question to user
    await telegram.sendMessage(userId, question);

    // Wait for user response (via Telegraf webhook/polling)
    const userAnswer = await waitForUserResponse(userId, { timeoutMs: 300000 }); // 5 min timeout

    if (!userAnswer) {
      // User didn't respond — skip this angle
      qaLog.push({ angle: angleSpec.angle, concept: angleSpec.concept, question, userAnswer: '[no response]', analysis: 'skipped', score: 0 });
      continue;
    }

    // Analyse the answer
    const analysisRaw = await reasoningLLM([
      { role: 'system', content: evaluationSystemPrompt() },
      ...conversationHistory,
      { role: 'user', content: question },
      { role: 'assistant', content: userAnswer },
      { role: 'user', content: answerAnalysisPrompt(angleSpec, question, userAnswer, knowledgeBase) },
    ], { jsonMode: true, maxTokens: 800 });

    const analysis = safeJsonParse<AnswerAnalysis>(analysisRaw);

    qaLog.push({
      angle: angleSpec.angle,
      concept: angleSpec.concept,
      question,
      userAnswer,
      analysis: analysis.summary,
      score: analysis.score,
      gapFound: analysis.gapFound,
      gapDescription: analysis.gapDescription,
      misconceptionFound: analysis.misconceptionFound,
      misconceptionText: analysis.misconceptionText,
      followUpNeeded: analysis.followUpNeeded,
    });

    // Add to conversation history for continuity
    conversationHistory.push(
      { role: 'assistant', content: question },
      { role: 'user', content: userAnswer }
    );

    // Follow up if gap detected
    if (analysis.followUpNeeded && analysis.followUpQuestion) {
      await telegram.sendMessage(userId, analysis.followUpQuestion);
      const followUpAnswer = await waitForUserResponse(userId, { timeoutMs: 300000 });

      if (followUpAnswer) {
        const followUpAnalysisRaw = await reasoningLLM([
          { role: 'system', content: evaluationSystemPrompt() },
          ...conversationHistory,
          { role: 'user', content: analysis.followUpQuestion },
          { role: 'assistant', content: followUpAnswer },
          { role: 'user', content: followUpAnalysisPrompt(angleSpec, analysis, followUpAnswer) },
        ], { jsonMode: true, maxTokens: 500 });

        const followUpAnalysis = safeJsonParse<FollowUpAnalysis>(followUpAnalysisRaw);

        // Merge follow-up findings into the QA log entry
        qaLog[qaLog.length - 1] = {
          ...qaLog[qaLog.length - 1],
          gapFound: followUpAnalysis.gapConfirmed,
          gapDescription: followUpAnalysis.gapClassification,
          misconceptionFound: followUpAnalysis.misconceptionConfirmed,
        };

        conversationHistory.push(
          { role: 'assistant', content: analysis.followUpQuestion },
          { role: 'user', content: followUpAnswer }
        );
      }
    }

    // Brief acknowledgment between questions — keeps it conversational
    if (angles.indexOf(angleSpec) < angles.length - 1) {
      const ack = generateAcknowledgment(analysis.score, angleSpec.angle);
      await telegram.sendMessage(userId, ack);
      await sleep(1000);
    }
  }

  return qaLog;
}
```

---

## LLM Prompts

### System Prompt

```typescript
export function evaluationSystemPrompt(): string {
  return `You are the Evaluation Agent for LRNR — a detective-mode learning evaluator.

YOUR JOB: Find the precise boundary between what this user genuinely understands and what they only appear to understand.

PRINCIPLES:
1. You are not testing memory. You are mapping understanding.
2. Never ask "do you know X?" — ask questions that require demonstrating X.
3. Warm but persistent. Acknowledge partial answers before probing deeper.
4. One question at a time. Never combine multiple questions.
5. When you find a gap, classify it: surface gap, foundational gap, or active misconception. They require different fixes.
6. Surface knowledge: user knows the right words but cannot apply them.
   Foundational gap: user is missing a prerequisite concept.
   Active misconception: user believes something that is factually wrong.

TONE: Curious colleague, not examiner. "That's interesting — walk me through that more" not "Incorrect."`;
}
```

### Question Generation Prompt

```typescript
export function questionGenerationPrompt(
  angleSpec: QuestionAngle,
  knowledgeBase: TopicKnowledgeBase,
  profile: UserProfile,
  priorQA: EvaluationQALog[]
): string {
  const priorWeakAreas = priorQA
    .filter(qa => qa.score < 0.6)
    .map(qa => qa.concept);

  return `Generate ONE evaluation question for this angle.

ANGLE: ${angleSpec.angle}
CONCEPT TO PROBE: ${angleSpec.concept}
REASON SELECTED: ${angleSpec.reason}

USER CONTEXT:
- Days into topic: ${profile.curriculumPosition}
- Known weak areas from prior questions today: ${priorWeakAreas.join(', ') || 'none yet'}
- Active misconceptions: ${profile.misconceptionLog.filter(m => m.status === 'active').map(m => m.concept).join(', ') || 'none'}

RELEVANT KNOWLEDGE BASE CONTENT:
${JSON.stringify(
  knowledgeBase.coreConcepts
    .filter(c => c.concept.toLowerCase().includes(angleSpec.concept.toLowerCase()))
    .slice(0, 2),
  null, 2
)}

Write one question only. No preamble. No "Here is your question:".
The question should:
- Be specific enough to require genuine knowledge to answer
- Not be answerable by simply repeating a definition
- Feel like a natural conversation, not an exam
- Be 1-3 sentences maximum`;
}
```

### Answer Analysis Prompt

```typescript
export function answerAnalysisPrompt(
  angleSpec: QuestionAngle,
  question: string,
  userAnswer: string,
  knowledgeBase: TopicKnowledgeBase
): string {
  return `Analyse this answer to an evaluation question.

ANGLE: ${angleSpec.angle}
CONCEPT BEING TESTED: ${angleSpec.concept}
QUESTION ASKED: ${question}
USER'S ANSWER: ${userAnswer}

CORRECT UNDERSTANDING (from knowledge base):
${JSON.stringify(
  knowledgeBase.coreConcepts
    .filter(c => c.concept.toLowerCase().includes(angleSpec.concept.toLowerCase()))
    .slice(0, 1),
  null, 2
)}

Return JSON only, no other text:
{
  "score": <0.0 to 1.0 — 0 is completely wrong, 1 is expert-level>,
  "depthLevel": "none|surface|working|deep|expert",
  "summary": "<2 sentence factual summary of what the answer showed>",
  "gapFound": <boolean>,
  "gapType": "surface|foundational|none",
  "gapDescription": "<specific description of what is missing, or null>",
  "misconceptionFound": <boolean>,
  "misconceptionText": "<the specific wrong belief stated, or null>",
  "followUpNeeded": <boolean — true if gap or misconception found and needs classification>,
  "followUpQuestion": "<one follow-up question to probe the gap, or null>",
  "whatUserGotRight": "<what was correct or partially correct>",
  "acknowledgment": "<a warm 1-sentence acknowledgment of their answer to send before next question>"
}`;
}
```

### Follow-up Analysis Prompt

```typescript
export function followUpAnalysisPrompt(
  angleSpec: QuestionAngle,
  priorAnalysis: AnswerAnalysis,
  followUpAnswer: string
): string {
  return `Analyse this follow-up answer to classify a detected gap.

CONCEPT: ${angleSpec.concept}
INITIAL GAP DETECTED: ${priorAnalysis.gapDescription}
INITIAL MISCONCEPTION SUSPECTED: ${priorAnalysis.misconceptionText}
FOLLOW-UP ANSWER: ${followUpAnswer}

Classify the gap type precisely. The fix depends on the classification:
- surface: user knows the words but not the substance. Fix: more depth in upcoming sessions.
- foundational: user is missing a prerequisite concept. Fix: remediate the prerequisite first.
- misconception: user has an actively wrong belief. Fix: explicit correction in upcoming session.

Return JSON only, no other text:
{
  "gapConfirmed": <boolean>,
  "gapClassification": "surface|foundational|misconception|none",
  "foundationalConcept": "<which prerequisite concept is missing, if foundational>",
  "misconceptionConfirmed": <boolean>,
  "remediationPlan": "<1-2 sentences: what should happen in upcoming sessions to address this>",
  "urgency": "low|medium|high"
}`;
}
```

---

## Closing the Evaluation Session

After all questions complete, send a closing message and process all findings:

```typescript
async function closeEvaluationSession(
  userId: string,
  qaLog: EvaluationQALog[],
  profile: UserProfile,
  telegram: TelegramService
): Promise<void> {
  const gapsFound = qaLog.filter(qa => qa.gapFound);
  const misconceptions = qaLog.filter(qa => qa.misconceptionFound);
  const strongAreas = qaLog.filter(qa => qa.score >= 0.8);

  // Build closing message
  let closing = `✅ *That's a wrap on today's check-in.*\n\n`;

  if (strongAreas.length > 0) {
    closing += `*Strong understanding of:*\n`;
    closing += strongAreas.map(qa => `• ${qa.concept}`).join('\n');
    closing += '\n\n';
  }

  if (gapsFound.length > 0 || misconceptions.length > 0) {
    closing += `*I've flagged a few areas to revisit in upcoming sessions.*\n`;
    closing += `You won't need to do anything — it'll be woven into the next few days.\n\n`;
  }

  closing += `Your next learning session starts tomorrow morning. 🧠`;

  await telegram.sendMessage(userId, closing);
}
```

---

## Mastery Score Calculation

```typescript
function calculateMasteryScore(
  qaLog: EvaluationQALog[],
  concept: string
): MasteryScore {
  const conceptQA = qaLog.filter(qa =>
    qa.concept.toLowerCase().includes(concept.toLowerCase())
  );

  if (conceptQA.length === 0) {
    return { canSolve: 0, canExplain: 0, canDecide: 0, overall: 0 };
  }

  // Map angles to mastery dimensions
  const canExplainScore = conceptQA
    .filter(qa => qa.angle === 'direct_recall' || qa.angle === 'historical')
    .reduce((sum, qa) => sum + qa.score, 0) /
    Math.max(1, conceptQA.filter(qa => qa.angle === 'direct_recall' || qa.angle === 'historical').length);

  const canSolveScore = conceptQA
    .filter(qa => qa.angle === 'application' || qa.angle === 'edge_cases')
    .reduce((sum, qa) => sum + qa.score, 0) /
    Math.max(1, conceptQA.filter(qa => qa.angle === 'application' || qa.angle === 'edge_cases').length);

  const canDecideScore = conceptQA
    .filter(qa => qa.angle === 'stress_testing' || qa.angle === 'connection')
    .reduce((sum, qa) => sum + qa.score, 0) /
    Math.max(1, conceptQA.filter(qa => qa.angle === 'stress_testing' || qa.angle === 'connection').length);

  const overall = (canExplainScore * 0.3 + canSolveScore * 0.4 + canDecideScore * 0.3);

  return {
    canSolve: Math.round(canSolveScore * 100) / 100,
    canExplain: Math.round(canExplainScore * 100) / 100,
    canDecide: Math.round(canDecideScore * 100) / 100,
    overall: Math.round(overall * 100) / 100,
  };
}
```

---

## Mastery Threshold — When Is a Topic Complete

A topic is complete when ALL of the following are true across two consecutive evaluation sessions:

```typescript
function isTopicComplete(
  masteryScores: Record<string, MasteryScore>,
  topicBrief: TopicBrief
): boolean {
  const requiredConcepts = topicBrief.conceptOutline.map(c => c.concept);

  return requiredConcepts.every(concept => {
    const score = masteryScores[concept];
    if (!score) return false;

    // Minimum thresholds per mastery dimension
    return (
      score.canExplain >= 0.7 &&
      score.canSolve >= 0.65 &&
      score.canDecide >= 0.6 &&
      score.overall >= 0.65
    );
  });
}
```

If topic is complete, write to `topic_briefs` (status: 'completed') and update `curriculum_state.layer_1` to advance `currentTopicIndex`.

---

## Acknowledgment Generation

Between questions, send a brief warm acknowledgment. Never let the evaluation feel like a one-way interrogation.

```typescript
function generateAcknowledgment(score: number, angle: string): string {
  if (score >= 0.8) {
    return [
      "That's a clear understanding — let's go a bit deeper.",
      "Good. Now let's look at this from a different angle.",
      "Solid. One more area to check.",
    ][Math.floor(Math.random() * 3)];
  }

  if (score >= 0.5) {
    return [
      "You've got the right idea — let's test how it holds up in practice.",
      "That's partially there. Let me ask it a different way.",
      "Good starting point. Let's dig into the specifics.",
    ][Math.floor(Math.random() * 3)];
  }

  return [
    "Interesting — let me ask this from another direction.",
    "Let's explore that a bit more.",
    "That's a starting point. Let's see where it goes.",
  ][Math.floor(Math.random() * 3)];
}
```

---

## Database Functions Required

| Function | File | Notes |
|----------|------|-------|
| `getActiveCurriculumState(userId)` | `curriculum.ts` | Current curriculum position |
| `getEvaluationSessions(userId, topicId)` | `evaluation.ts` (new file) | Prior eval history |
| `createEvaluationSession(data)` | `evaluation.ts` | Write evaluation record |
| `queryRAG(userId, filters)` | `rag.ts` | Get sessions, misconceptions, gaps |
| `writeToRAG(entry)` | `rag.ts` | Write gaps, misconceptions, confirmations |
| `resolveRAGMisconception(userId, id)` | `rag.ts` | Mark misconception resolved |
| `updateMasteryScore(userId, concept, scores, callerAgent)` | `profile.ts` | Write mastery scores |
| `updateMisconceptionStatus(userId, concept, status, callerAgent)` | `profile.ts` | Update misconception log |
| `updateNextEvaluationDue(userId, date, callerAgent)` | `profile.ts` | Schedule next evaluation |
| `addToQueue(item)` | `queue.ts` | Add remediation to agent queue |
| `updateTopicStatus(userId, topicId, status)` | `knowledge-base.ts` | Mark topic complete |

---

## Prompts File Structure

All prompts live in `src/prompts/evaluation.prompts.ts`:

```typescript
export function evaluationSystemPrompt(): string { ... }
export function questionGenerationPrompt(angleSpec, knowledgeBase, profile, priorQA): string { ... }
export function answerAnalysisPrompt(angleSpec, question, userAnswer, knowledgeBase): string { ... }
export function followUpAnalysisPrompt(angleSpec, priorAnalysis, followUpAnswer): string { ... }
export function remediationPlanPrompt(gapsFound, misconceptions, currentDay): string { ... }
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| User doesn't respond to a question (timeout) | Skip that angle. Log as `[no response]`. Continue to next angle. Do not block. |
| User sends a very short answer ("idk", "not sure") | Log score as 0.2, mark as surface gap, do not follow up — this is a clear signal. Move on. |
| User sends a very long answer that likely covers everything | Analyse the full text. High scores here are genuine. Do not penalise thoroughness. |
| LLM answer analysis returns invalid JSON | Use fallback scoring: score = 0.5, gapFound = false. Log the raw response. |
| All questions show strong performance | Do not extend the session. Write high mastery scores and schedule next evaluation normally. |
| User asks to skip evaluation | Send: "Understood — we'll continue your regular sessions. I'll check back in a few days." Set next_evaluation_due to today + 2. |
| Topic mastery thresholds not met after 3 evaluations | Flag to Curriculum Builder via queue to restructure upcoming sessions. Consider going back to reinforce weakest concepts. |
| Database write fails mid-session | Log all findings locally. Retry writes up to 3 times. If still failing, surface error to user: "Your session was recorded but I had trouble saving the full analysis. I'll check back tomorrow." |

---

## Testing This Agent Locally

```bash
# Requires sessions to have been delivered (teaching agent must have run)
# Set nextEvaluationDue to today in the database first
MOCK_LLM=false pnpm run dev:learning
```

**Manual test checklist:**
- [ ] Opening message sent with correct warm tone
- [ ] Question selection uses profile and prior history — not random
- [ ] Each question is specific to the angle and concept
- [ ] Acknowledgment sent between questions
- [ ] Follow-up question triggered when gap detected
- [ ] Gap classified correctly (surface / foundational / misconception)
- [ ] Closing message reflects actual findings (not generic)
- [ ] `rag_memory` rows written for each gap and misconception
- [ ] `user_profile` mastery scores updated
- [ ] `agent_update_queue` has Priority 1 items for each gap
- [ ] `evaluation_sessions` record created with full QA log
- [ ] `next_evaluation_due` updated in profile
- [ ] Topic marked complete if thresholds met

---

## What This Agent Must NOT Do

- Must NOT teach or explain concepts. If the user is confused, acknowledge it and note the gap — do not fix it in the evaluation session. That is Teaching Agent's job.
- Must NOT ask more than 4 questions per session. Evaluation fatigue destroys the experience.
- Must NOT ask multiple questions in one message. One question per message, always.
- Must NOT tell the user their score or what they got right or wrong in clinical terms. Keep it conversational.
- Must NOT skip the RAG writes. Every gap and misconception must be persisted — this is what the Curriculum Builder reads.
- Must NOT write to `curriculum_state` directly. All curriculum updates go through `agent_update_queue` for Curriculum Builder to process.
- Must NOT run on a day when a teaching session is also scheduled. Route B is evaluation-only — the Teaching Agent does not run on evaluation days.
- Must NOT use the same question angle twice in the same session.
- Must NOT penalise the user for thinking out loud or giving a long answer. Analyse the content, not the length.
