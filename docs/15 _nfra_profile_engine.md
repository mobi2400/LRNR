# LRNR — Infrastructure 01: Profile Engine
> **Load alongside all 4 foundation files before coding this layer.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Current Implementation Override

Profile identity is based on authenticated owner/user id.

```text
user_profile.user_id = Auth.js/Supabase authenticated user id
telegram_chat_id = notification preference metadata
```

Do not use Telegram user id as the primary identity key in new code.

For implementation, prefer repository naming from `docs/31_REPOSITORY_STRUCTURE.md`, such as:

```text
src/db/profile.repo.ts
src/types/profile.types.ts
```

---

## What The Profile Engine Is

The Profile Engine is not an agent. It is a service layer — a set of typed TypeScript functions in `src/db/profile.ts` that every agent uses to read and write user profile data. It is the central nervous system of the entire system.

Every agent reads from the profile to personalise its output. Every agent that makes a judgment about the user writes back to the profile. But not every agent can write every field — the Profile Engine enforces field-level write permissions at the application layer. An agent that tries to write a field it has no permission to write gets a typed `ProfilePermissionError` thrown immediately. This is what keeps the system coherent across eight concurrent agents.

The Profile Engine also owns the logic for how the profile evolves over time — not just raw reads and writes, but semantic operations like "add a misconception", "update mastery score", "mark concept as known", "advance curriculum position". These operations have business rules that agents should not need to know about.

---

## File Location

```
src/db/profile.ts          — main implementation
src/types/profile.types.ts — all profile-related TypeScript types
```

---

## Permission Matrix — Full Specification

This is the authoritative source of write permissions. Any code that writes to `user_profile` must check this matrix. The enforcement function is `assertProfilePermission()`.

| Field | Read | Write |
|-------|------|-------|
| `userId` | All | Nobody (set at creation only) |
| `statedGoal` | All | `architect_node` only |
| `whyLearning` | All | `architect_node` only |
| `successDefinition` | All | `architect_node` only |
| `timeCommitmentMins` | All | `architect_node` only |
| `priorAttempts` | All | `architect_node` only |
| `learningSequence` | All | `architect_node` only (set once) |
| `currentTopic` | All | `curriculum_builder_node` only |
| `currentTopicId` | All | `curriculum_builder_node` only |
| `curriculumPosition` | All | `curriculum_builder_node` only |
| `nextEvaluationDue` | All | `curriculum_builder_node`, `evaluation_node` |
| `topicStartedAt` | All | `curriculum_builder_node` only |
| `knowledgeDepthMap` | All | `architect_node`, `evaluation_node` |
| `misconceptionLog` | All | `evaluation_node` only |
| `masteryScores` | All | `evaluation_node` only |
| `thinkingPatterns` | All | `evaluation_node` only |
| `engagementPatterns` | All | `teaching_node` only |
| `interestAreas` | All | `architect_node` only |
| `onboardingComplete` | All | `architect_node` only |

---

## Full Implementation

```typescript
// src/db/profile.ts

import { supabase } from '../lib/supabase';
import {
  UserProfile,
  KnowledgeDepthEntry,
  MisconceptionEntry,
  MasteryScore,
  ThinkingPatterns,
  EngagementPatterns,
} from '../types/profile.types';
import { logger } from '../utils/logger';

// ── Permission enforcement ─────────────────────────────────────────────────

const WRITE_PERMISSIONS: Record<string, string[]> = {
  statedGoal:           ['architect_node'],
  whyLearning:          ['architect_node'],
  successDefinition:    ['architect_node'],
  timeCommitmentMins:   ['architect_node'],
  priorAttempts:        ['architect_node'],
  learningSequence:     ['architect_node'],
  interestAreas:        ['architect_node'],
  onboardingComplete:   ['architect_node'],
  currentTopic:         ['curriculum_builder_node'],
  currentTopicId:       ['curriculum_builder_node'],
  curriculumPosition:   ['curriculum_builder_node'],
  topicStartedAt:       ['curriculum_builder_node'],
  nextEvaluationDue:    ['curriculum_builder_node', 'evaluation_node'],
  knowledgeDepthMap:    ['architect_node', 'evaluation_node'],
  misconceptionLog:     ['evaluation_node'],
  masteryScores:        ['evaluation_node'],
  thinkingPatterns:     ['evaluation_node'],
  engagementPatterns:   ['teaching_node'],
};

export class ProfilePermissionError extends Error {
  constructor(field: string, callerAgent: string) {
    super(
      `Agent '${callerAgent}' attempted to write profile field '${field}'. ` +
      `Allowed agents: ${WRITE_PERMISSIONS[field]?.join(', ') ?? 'none'}`
    );
    this.name = 'ProfilePermissionError';
  }
}

function assertProfilePermission(field: string, callerAgent: string): void {
  const allowed = WRITE_PERMISSIONS[field];
  if (!allowed) throw new ProfilePermissionError(field, callerAgent);
  if (!allowed.includes(callerAgent)) throw new ProfilePermissionError(field, callerAgent);
}

function assertAllPermissions(
  fields: string[],
  callerAgent: string
): void {
  for (const field of fields) {
    assertProfilePermission(field, callerAgent);
  }
}

// ── Snake case conversion helpers ──────────────────────────────────────────

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = value;
  }
  return result;
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

// ── READ OPERATIONS ─────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    logger.error('getProfile failed', { userId, error: error.message });
    throw new Error(`getProfile failed: ${error.message}`);
  }

  return toCamelCase(data) as unknown as UserProfile;
}

export async function profileExists(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_profile')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function getKnowledgeDepth(
  userId: string,
  concept: string
): Promise<KnowledgeDepthEntry | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  return profile.knowledgeDepthMap[concept] ?? null;
}

export async function getActiveMisconceptions(
  userId: string
): Promise<MisconceptionEntry[]> {
  const profile = await getProfile(userId);
  if (!profile) return [];
  return profile.misconceptionLog.filter(m => m.status === 'active');
}

export async function getMasteryScore(
  userId: string,
  concept: string
): Promise<MasteryScore | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  return profile.masteryScores[concept] ?? null;
}

// ── CREATE OPERATION ────────────────────────────────────────────────────────

export async function createProfile(
  userId: string,
  data: Partial<UserProfile>
): Promise<UserProfile> {
  const { data: created, error } = await supabase
    .from('user_profile')
    .insert({
      user_id: userId,
      stated_goal: data.statedGoal ?? null,
      why_learning: data.whyLearning ?? null,
      success_definition: data.successDefinition ?? null,
      time_commitment_mins: data.timeCommitmentMins ?? 60,
      prior_attempts: data.priorAttempts ?? null,
      learning_sequence: data.learningSequence ?? [
        'fundamentals', 'architecture', 'internals',
        'production', 'tradeoffs', 'code', 'visuals',
      ],
      interest_areas: data.interestAreas ?? [
        'llm_research', 'ai_tools', 'agents_automation', 'ai_safety',
      ],
      knowledge_depth_map: data.knowledgeDepthMap ?? {},
      misconception_log: data.misconceptionLog ?? [],
      mastery_scores: data.masteryScores ?? {},
      thinking_patterns: data.thinkingPatterns ?? {},
      engagement_patterns: data.engagementPatterns ?? {},
      onboarding_complete: data.onboardingComplete ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(`createProfile failed: ${error.message}`);
  return toCamelCase(created) as unknown as UserProfile;
}

// ── ARCHITECT-ONLY WRITES ────────────────────────────────────────────────────

export async function updateProfileFromArchitect(
  userId: string,
  data: {
    statedGoal?: string;
    whyLearning?: string;
    successDefinition?: string;
    timeCommitmentMins?: number;
    priorAttempts?: string;
    learningSequence?: string[];
    interestAreas?: string[];
    knowledgeDepthMap?: Record<string, KnowledgeDepthEntry>;
    misconceptionLog?: MisconceptionEntry[];
    onboardingComplete?: boolean;
  },
  callerAgent: string
): Promise<void> {
  assertAllPermissions(Object.keys(data), callerAgent);

  const updatePayload: Record<string, unknown> = {};
  if (data.statedGoal !== undefined)       updatePayload.stated_goal = data.statedGoal;
  if (data.whyLearning !== undefined)      updatePayload.why_learning = data.whyLearning;
  if (data.successDefinition !== undefined) updatePayload.success_definition = data.successDefinition;
  if (data.timeCommitmentMins !== undefined) updatePayload.time_commitment_mins = data.timeCommitmentMins;
  if (data.priorAttempts !== undefined)    updatePayload.prior_attempts = data.priorAttempts;
  if (data.learningSequence !== undefined) updatePayload.learning_sequence = data.learningSequence;
  if (data.interestAreas !== undefined)    updatePayload.interest_areas = data.interestAreas;
  if (data.knowledgeDepthMap !== undefined) updatePayload.knowledge_depth_map = data.knowledgeDepthMap;
  if (data.misconceptionLog !== undefined) updatePayload.misconception_log = data.misconceptionLog;
  if (data.onboardingComplete !== undefined) updatePayload.onboarding_complete = data.onboardingComplete;

  const { error } = await supabase
    .from('user_profile')
    .update(updatePayload)
    .eq('user_id', userId);

  if (error) throw new Error(`updateProfileFromArchitect failed: ${error.message}`);
  logger.debug('profile updated by architect', { userId, fields: Object.keys(data) });
}

// ── CURRICULUM BUILDER WRITES ────────────────────────────────────────────────

export async function updateCurriculumPosition(
  userId: string,
  data: {
    currentTopic?: string;
    currentTopicId?: string;
    curriculumPosition?: number;
    nextEvaluationDue?: string;
    topicStartedAt?: string;
  },
  callerAgent: string
): Promise<void> {
  assertAllPermissions(Object.keys(data), callerAgent);

  const updatePayload: Record<string, unknown> = {};
  if (data.currentTopic !== undefined)      updatePayload.current_topic = data.currentTopic;
  if (data.currentTopicId !== undefined)    updatePayload.current_topic_id = data.currentTopicId;
  if (data.curriculumPosition !== undefined) updatePayload.curriculum_position = data.curriculumPosition;
  if (data.nextEvaluationDue !== undefined) updatePayload.next_evaluation_due = data.nextEvaluationDue;
  if (data.topicStartedAt !== undefined)    updatePayload.topic_started_at = data.topicStartedAt;

  const { error } = await supabase
    .from('user_profile')
    .update(updatePayload)
    .eq('user_id', userId);

  if (error) throw new Error(`updateCurriculumPosition failed: ${error.message}`);
}

export async function advanceCurriculumDay(
  userId: string,
  callerAgent: string
): Promise<number> {
  assertProfilePermission('curriculumPosition', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const newPosition = (profile.curriculumPosition ?? 0) + 1;

  const { error } = await supabase
    .from('user_profile')
    .update({ curriculum_position: newPosition })
    .eq('user_id', userId);

  if (error) throw new Error(`advanceCurriculumDay failed: ${error.message}`);
  return newPosition;
}

export async function updateNextEvaluationDue(
  userId: string,
  date: string,           // ISO date string: '2025-06-15'
  callerAgent: string
): Promise<void> {
  assertProfilePermission('nextEvaluationDue', callerAgent);

  const { error } = await supabase
    .from('user_profile')
    .update({ next_evaluation_due: date })
    .eq('user_id', userId);

  if (error) throw new Error(`updateNextEvaluationDue failed: ${error.message}`);
}

// ── EVALUATION AGENT WRITES ─────────────────────────────────────────────────

export async function updateKnowledgeDepth(
  userId: string,
  concept: string,
  entry: KnowledgeDepthEntry,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('knowledgeDepthMap', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const updatedMap = {
    ...profile.knowledgeDepthMap,
    [concept]: entry,
  };

  const { error } = await supabase
    .from('user_profile')
    .update({ knowledge_depth_map: updatedMap })
    .eq('user_id', userId);

  if (error) throw new Error(`updateKnowledgeDepth failed: ${error.message}`);
}

export async function addMisconception(
  userId: string,
  misconception: Omit<MisconceptionEntry, 'detectedAt' | 'status' | 'correctedAt'>,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('misconceptionLog', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  // Avoid duplicates — check if this concept already has an active misconception
  const existingIndex = profile.misconceptionLog.findIndex(
    m => m.concept === misconception.concept && m.status === 'active'
  );

  const newEntry: MisconceptionEntry = {
    ...misconception,
    detectedAt: new Date().toISOString(),
    status: 'active',
    correctedAt: null,
  };

  let updatedLog: MisconceptionEntry[];
  if (existingIndex >= 0) {
    // Update existing entry rather than creating a duplicate
    updatedLog = [...profile.misconceptionLog];
    updatedLog[existingIndex] = newEntry;
  } else {
    updatedLog = [...profile.misconceptionLog, newEntry];
  }

  const { error } = await supabase
    .from('user_profile')
    .update({ misconception_log: updatedLog })
    .eq('user_id', userId);

  if (error) throw new Error(`addMisconception failed: ${error.message}`);
  logger.debug('misconception added', { userId, concept: misconception.concept });
}

export async function resolveMisconception(
  userId: string,
  concept: string,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('misconceptionLog', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const updatedLog = profile.misconceptionLog.map(m =>
    m.concept === concept && m.status === 'active'
      ? { ...m, status: 'corrected' as const, correctedAt: new Date().toISOString() }
      : m
  );

  const { error } = await supabase
    .from('user_profile')
    .update({ misconception_log: updatedLog })
    .eq('user_id', userId);

  if (error) throw new Error(`resolveMisconception failed: ${error.message}`);
}

export async function updateMasteryScore(
  userId: string,
  concept: string,
  score: MasteryScore,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('masteryScores', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const updatedScores = {
    ...profile.masteryScores,
    [concept]: score,
  };

  const { error } = await supabase
    .from('user_profile')
    .update({ mastery_scores: updatedScores })
    .eq('user_id', userId);

  if (error) throw new Error(`updateMasteryScore failed: ${error.message}`);
}

export async function updateThinkingPatterns(
  userId: string,
  patterns: Partial<ThinkingPatterns>,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('thinkingPatterns', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const updatedPatterns = { ...profile.thinkingPatterns, ...patterns };

  const { error } = await supabase
    .from('user_profile')
    .update({ thinking_patterns: updatedPatterns })
    .eq('user_id', userId);

  if (error) throw new Error(`updateThinkingPatterns failed: ${error.message}`);
}

// ── TEACHING AGENT WRITES ────────────────────────────────────────────────────

export async function updateEngagementPatterns(
  userId: string,
  patterns: Partial<EngagementPatterns>,
  callerAgent: string
): Promise<void> {
  assertProfilePermission('engagementPatterns', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  const updatedPatterns = { ...profile.engagementPatterns, ...patterns };

  const { error } = await supabase
    .from('user_profile')
    .update({ engagement_patterns: updatedPatterns })
    .eq('user_id', userId);

  if (error) throw new Error(`updateEngagementPatterns failed: ${error.message}`);
}

// ── SEMANTIC OPERATIONS ──────────────────────────────────────────────────────
// Higher-level operations that encapsulate business logic

export async function markTopicComplete(
  userId: string,
  completedTopicId: string,
  callerAgent: string
): Promise<void> {
  // Only curriculum builder advances the topic
  assertProfilePermission('currentTopic', callerAgent);

  const profile = await getProfile(userId);
  if (!profile) throw new Error(`Profile not found: ${userId}`);

  // Reset curriculum position and evaluation date for new topic
  const { error } = await supabase
    .from('user_profile')
    .update({
      curriculum_position: 0,
      next_evaluation_due: null,
      topic_started_at: null,
    })
    .eq('user_id', userId);

  if (error) throw new Error(`markTopicComplete failed: ${error.message}`);
  logger.info('topic marked complete', { userId, completedTopicId });
}

export async function isTopicMasteryReached(
  userId: string,
  topicId: string,
  requiredConcepts: string[]
): Promise<boolean> {
  const profile = await getProfile(userId);
  if (!profile) return false;

  // All required concepts must meet minimum mastery thresholds
  return requiredConcepts.every(concept => {
    const score = profile.masteryScores[concept];
    if (!score) return false;
    return (
      score.canExplain >= 0.7 &&
      score.canSolve >= 0.65 &&
      score.canDecide >= 0.6 &&
      score.overall >= 0.65
    );
  });
}

export async function getLearningVelocity(userId: string): Promise<'slow' | 'normal' | 'fast'> {
  const profile = await getProfile(userId);
  if (!profile) return 'normal';

  const velocity = profile.thinkingPatterns?.learningVelocity;
  if (velocity === 'fast' || velocity === 'slow') return velocity;
  return 'normal';
}
```

---

## Types File

```typescript
// src/types/profile.types.ts

export interface UserProfile {
  id: string;
  userId: string;

  // Goal context
  statedGoal: string | null;
  whyLearning: string | null;
  successDefinition: string | null;
  timeCommitmentMins: number;
  priorAttempts: string | null;

  // Learning preferences
  learningSequence: string[];
  interestAreas: string[];

  // Current state
  currentTopic: string | null;
  currentTopicId: string | null;
  curriculumPosition: number;
  nextEvaluationDue: string | null;
  topicStartedAt: string | null;

  // Knowledge tracking
  knowledgeDepthMap: Record<string, KnowledgeDepthEntry>;
  misconceptionLog: MisconceptionEntry[];
  masteryScores: Record<string, MasteryScore>;
  thinkingPatterns: ThinkingPatterns;
  engagementPatterns: EngagementPatterns;

  // Status
  onboardingComplete: boolean;

  // Transient flags — set by load_profile_node, not persisted
  hasPendingContradictions?: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDepthEntry {
  depth: 'surface' | 'working' | 'deep' | 'expert';
  lastAssessed: string;       // ISO datetime
  confidence: number;         // 0-1
}

export interface MisconceptionEntry {
  concept: string;
  misconception: string;      // the specific wrong belief
  detectedAt: string;         // ISO datetime
  status: 'active' | 'corrected';
  correctedAt: string | null;
}

export interface MasteryScore {
  canSolve: number;           // 0-1 — can apply in real scenarios
  canExplain: number;         // 0-1 — can articulate clearly
  canDecide: number;          // 0-1 — can evaluate tradeoffs
  overall: number;            // weighted: solve*0.4 + explain*0.3 + decide*0.3
}

export interface ThinkingPatterns {
  overconfidenceAreas: string[];    // concepts user consistently overestimates
  strongAreas: string[];            // concepts user consistently performs well on
  reasoningStyle: string;           // 'bottom-up' | 'top-down' | 'example-driven' | 'theory-driven'
  learningVelocity: string;         // 'slow' | 'normal' | 'fast'
}

export interface EngagementPatterns {
  avgResponseTimeMins: number;      // how long they take to respond to teaching messages
  reReadRate: number;               // 0-1 — how often they re-read (estimated)
  questionFrequency: number;        // questions asked per session
  skipRate: number;                 // 0-1 — how often they skip optional content
}
```

---

## Usage Patterns — How Agents Call The Profile Engine

```typescript
// ── Architect Agent ──────────────────────────────────────────────────────────

// Create profile on first run
const profile = await createProfile(userId, {
  statedGoal: 'Learn Agentic AI',
  whyLearning: 'Building production agents at work',
  timeCommitmentMins: 60,
  onboardingComplete: false,
});

// Update after discovery conversation
await updateProfileFromArchitect(userId, {
  whyLearning: extractedWhyLearning,
  timeCommitmentMins: parsedTimeCommitment,
  knowledgeDepthMap: probedKnowledge,
  misconceptionLog: detectedMisconceptions,
  onboardingComplete: true,
}, 'architect_node');

// ── Curriculum Builder ────────────────────────────────────────────────────────

await updateCurriculumPosition(userId, {
  currentTopic: 'langchain',
  currentTopicId: topicBriefId,
  curriculumPosition: 0,
  nextEvaluationDue: '2025-06-14',
  topicStartedAt: new Date().toISOString(),
}, 'curriculum_builder_node');

// Advance day after session delivered
await advanceCurriculumDay(userId, 'curriculum_builder_node');

// ── Evaluation Agent ─────────────────────────────────────────────────────────

// Update concept knowledge after evaluation
await updateKnowledgeDepth(userId, 'langchain-chains', {
  depth: 'working',
  lastAssessed: new Date().toISOString(),
  confidence: 0.75,
}, 'evaluation_node');

// Add new misconception found during evaluation
await addMisconception(userId, {
  concept: 'langchain-memory',
  misconception: 'User believes all memory types persist across processes by default',
}, 'evaluation_node');

// Resolve an old misconception
await resolveMisconception(userId, 'langchain-chains', 'evaluation_node');

// Update mastery after evaluation session
await updateMasteryScore(userId, 'langchain-chains', {
  canSolve: 0.7,
  canExplain: 0.8,
  canDecide: 0.6,
  overall: 0.71,
}, 'evaluation_node');

// ── Teaching Agent ────────────────────────────────────────────────────────────

await updateEngagementPatterns(userId, {
  questionFrequency: 2.3,
  avgResponseTimeMins: 8,
}, 'teaching_node');

// ── Any Agent — Read Operations ───────────────────────────────────────────────

const profile = await getProfile(userId);
const misconceptions = await getActiveMisconceptions(userId);
const velocity = await getLearningVelocity(userId);
const isComplete = await isTopicMasteryReached(userId, topicId, concepts);
```

---

## Error Handling

```typescript
// Every write function throws on failure — callers must handle:

try {
  await updateKnowledgeDepth(userId, concept, entry, 'architect_node');  // WRONG AGENT
} catch (error) {
  if (error instanceof ProfilePermissionError) {
    // Permission violation — this is a coding error, not a runtime error
    logger.error('Profile permission violation', { error: error.message });
    throw error;  // Re-throw — this should never happen in production
  }
  // Database error — log and handle gracefully
  logger.error('Profile update failed', { error });
}
```

**Permission errors vs database errors:**
- `ProfilePermissionError` = coding bug. An agent is trying to do something it should never do. Always re-throw. Fix the code.
- Regular `Error` from Supabase = runtime failure. Log, retry once, then surface to state.

---

## Setup Script

```typescript
// scripts/seed-profile.ts
// Run once to create the initial user profile before first Learning Graph run

import { createProfile, profileExists } from '../src/db/profile';

async function seedProfile() {
  const userId = process.env.USER_ID;
  if (!userId) throw new Error('USER_ID required');

  const exists = await profileExists(userId);
  if (exists) {
    console.log('Profile already exists — skipping seed');
    return;
  }

  await createProfile(userId, {
    onboardingComplete: false,
  });

  console.log(`Profile created for user: ${userId}`);
  console.log('Run the daily-learning workflow to start onboarding.');
}

seedProfile();
```

---

## Testing

```typescript
// Manual test — verify permission enforcement works
import { updateMasteryScore, ProfilePermissionError } from '../src/db/profile';

async function testPermissions() {
  try {
    // This should throw — teaching_node cannot write masteryScores
    await updateMasteryScore('test-user', 'langchain', {
      canSolve: 0.7, canExplain: 0.8, canDecide: 0.6, overall: 0.71,
    }, 'teaching_node');  // WRONG AGENT

    console.error('FAIL: Should have thrown ProfilePermissionError');
  } catch (error) {
    if (error instanceof ProfilePermissionError) {
      console.log('PASS: Permission correctly rejected');
    }
  }
}
```

**Test checklist:**
- [ ] `getProfile` returns `null` for non-existent user (not error)
- [ ] `createProfile` creates a row with all defaults set correctly
- [ ] `updateProfileFromArchitect` succeeds with `architect_node` caller
- [ ] `updateProfileFromArchitect` throws `ProfilePermissionError` with `teaching_node` caller
- [ ] `addMisconception` deduplicates — does not create two entries for the same concept
- [ ] `resolveMisconception` only marks `active` entries as corrected
- [ ] `isTopicMasteryReached` returns `false` when any concept is below threshold
- [ ] `advanceCurriculumDay` correctly increments the position field
- [ ] Snake case / camelCase conversion works correctly in both directions

---

## What This File Must NOT Do

- Must NOT contain any LLM calls. Pure database operations only.
- Must NOT bypass permission checks for "convenience". Every write must go through `assertProfilePermission`.
- Must NOT silently ignore permission violations. `ProfilePermissionError` must always be thrown.
- Must NOT cache profile data in memory. Always read fresh from Supabase — the profile changes between agent runs.
- Must NOT write to any table other than `user_profile`. This file is scoped to the profile table only.
- Must NOT expose the Supabase client directly to agents. All database access goes through this service layer.
