import { describe, expect, it } from 'vitest';

import {
  extendCurriculumFromGaps,
  type CurriculumExtensionInput,
} from '@/agents/curriculum-builder/curriculum-builder-agent';
import {
  MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT,
  MAX_TOTAL_SESSIONS,
  type MasterySummary,
} from '@/lib/mastery';
import { curriculumSessionSchema, type CurriculumSession } from '@/schemas/curriculum.schema';
import type { GapFinding } from '@/schemas/evaluation.schema';

const topic = {
  title: 'Apache Kafka',
  goal: 'Run Kafka reliably for backend systems',
  topicSlug: 'apache-kafka',
  requiredDepth: 'intermediate',
};

function session(dayNumber: number): CurriculumSession {
  return curriculumSessionSchema.parse({
    id: `session-${dayNumber}`,
    dayNumber,
    title: `Day ${dayNumber}: concept`,
    status: 'completed',
    phase: 'core',
    conceptsToCover: ['concept'],
    masteryObjective: 'Objective.',
    connectionToPrior: null,
    tomorrowPreview: null,
  });
}

function gap(claim: string): GapFinding {
  return {
    claim,
    evidence: 'Cited evidence for the gap.',
    sourceUri: 'https://kafka.apache.org/documentation/',
    masteryLevel: 'can_explain',
  };
}

const emptySummary: MasterySummary = { concepts: {}, goalMastered: false };

describe('extendCurriculumFromGaps', () => {
  it('creates one grounded reinforcement session per distinct gap', () => {
    const input: CurriculumExtensionInput = {
      existingSessions: [session(1), session(2)],
      gaps: [
        gap('Consumer offset commit strategy is misunderstood'),
        gap('Consumer offset commit strategy is misunderstood'), // duplicate
        gap('Partition rebalancing behaviour is unclear'),
      ],
      masterySummary: emptySummary,
      topic,
    };

    const result = extendCurriculumFromGaps(input);

    // Duplicate gap collapses to one session.
    expect(result.newSessions).toHaveLength(2);
    expect(result.capped).toBe(false);
    // Appended after the existing days, planned, and evaluation-gated.
    expect(result.newSessions[0]?.dayNumber).toBe(3);
    expect(result.newSessions[1]?.dayNumber).toBe(4);
    expect(result.newSessions.every((s) => s.status === 'planned')).toBe(true);
    expect(result.newSessions.every((s) => s.evaluationDue)).toBe(true);
    // Grounded in the gap's own citation.
    expect(result.newSessions[0]?.sourceRefs).toContain(
      'https://kafka.apache.org/documentation/',
    );
    // Round counters advanced for each reinforced concept.
    expect(result.reinforcedConcepts).toHaveLength(2);
    for (const slug of result.reinforcedConcepts) {
      expect(result.masterySummary.concepts[slug]?.reinforcementRounds).toBe(1);
      expect(result.masterySummary.concepts[slug]?.level).toBe('developing');
    }
  });

  it('stops reinforcing a concept that hit the per-concept round cap', () => {
    const claim = 'Exactly-once semantics is misunderstood';
    // Pre-seed that concept at the cap.
    const seeded = extendCurriculumFromGaps({
      existingSessions: [session(1)],
      gaps: [gap(claim)],
      masterySummary: emptySummary,
      topic,
    });
    const slug = seeded.reinforcedConcepts[0]!;
    const atCap: MasterySummary = {
      goalMastered: false,
      concepts: {
        [slug]: {
          level: 'developing',
          reinforcementRounds: MAX_REINFORCEMENT_ROUNDS_PER_CONCEPT,
          lastAssessedAt: null,
        },
      },
    };

    const result = extendCurriculumFromGaps({
      existingSessions: [session(1)],
      gaps: [gap(claim)],
      masterySummary: atCap,
      topic,
    });

    expect(result.newSessions).toHaveLength(0);
    expect(result.capped).toBe(true);
  });

  it('never grows the path past the total-session cap', () => {
    const existing = Array.from({ length: MAX_TOTAL_SESSIONS - 1 }, (_, i) =>
      session(i + 1),
    );
    const gaps = [
      gap('First distinct gap here'),
      gap('Second distinct gap here'),
      gap('Third distinct gap here'),
    ];

    const result = extendCurriculumFromGaps({
      existingSessions: existing,
      gaps,
      masterySummary: emptySummary,
      topic,
    });

    // Only one slot remained under the cap.
    expect(result.newSessions).toHaveLength(1);
    expect(result.capped).toBe(true);
    expect(existing.length + result.newSessions.length).toBe(MAX_TOTAL_SESSIONS);
  });
});
