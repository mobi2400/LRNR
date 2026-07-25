import { describe, expect, it } from 'vitest';

import {
  gapFindingSchema,
  interviewSessionStateSchema,
  interviewTurnSchema,
} from '@/schemas/evaluation.schema';

describe('evaluation schema', () => {
  it('parses a valid interview session state', () => {
    const state = interviewSessionStateSchema.parse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      topicSlug: 'system-design',
      status: 'awaiting_answer',
      turns: [],
      turnCap: 5,
      currentProbe: 'Walk me through how you would design a URL shortener.',
      detectedGaps: [],
      verdictSummary: null,
    });
    expect(state.turnCap).toBe(5);
    expect(state.status).toBe('awaiting_answer');
  });

  it('parses a valid gap finding with source URI', () => {
    const finding = gapFindingSchema.parse({
      claim: 'You don\'t know when a read replica stops working.',
      evidence: 'You said "add a read replica because it\'s easier" without naming replication lag.',
      sourceUri: 'https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html',
      masteryLevel: 'can_explain',
    });
    expect(finding.sourceUri).toContain('aws');
  });

  it('rejects a gap finding without a source URI', () => {
    expect(() =>
      gapFindingSchema.parse({
        claim: 'Missing concept',
        evidence: 'Did not mention it',
        sourceUri: '',
        masteryLevel: 'can_solve',
      }),
    ).toThrow();
  });

  it('parses a turn with skip and elapsed time', () => {
    const turn = interviewTurnSchema.parse({
      turnIndex: 2,
      probe: 'How would you handle a partition?',
      answer: '',
      startedAt: '2026-07-25T10:00:00Z',
      answeredAt: '2026-07-25T10:00:05Z',
      verdict: null,
      gapFindings: [],
      unscored: false,
      skipped: true,
    });
    expect(turn.skipped).toBe(true);
    expect(turn.answer).toBe('');
  });
});
