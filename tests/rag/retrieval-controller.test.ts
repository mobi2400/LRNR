import { describe, expect, it } from 'vitest';

import {
  inferRetrievalIntent,
  reciprocalRankFusion,
  retrieveRagContext,
  type RagRetrievalRepository,
} from '../../src/rag/retrieval/controller';

const userId = '00000000-0000-4000-8000-000000000001';

describe('RAG retrieval controller', () => {
  it('classifies intent with deterministic rules', () => {
    expect(inferRetrievalIntent('Where am I confused about RAG?')).toBe('diagnose_gap');
    expect(inferRetrievalIntent('review the last lesson')).toBe('review');
    expect(inferRetrievalIntent('What is retrieval fusion?')).toBe('answer_followup');
  });

  it('fuses lexical and vector rankings deterministically', () => {
    const scores = reciprocalRankFusion({
      lexicalIds: ['a', 'b'],
      vectorIds: ['b', 'c'],
      constant: 60,
    });

    expect(scores.get('b')?.rrfScore).toBeGreaterThan(scores.get('a')?.rrfScore ?? 0);
    expect(scores.get('b')?.lexicalRank).toBe(2);
    expect(scores.get('b')?.vectorRank).toBe(1);
  });

  it('uses the repository as the scoped retrieval boundary', async () => {
    const calls: Array<{ actorUserId: string; embeddingVersion: string | undefined; queryEmbeddingLength: number }> = [];
    const repository: RagRetrievalRepository = {
      async retrieveContext(actor, input) {
        calls.push({
          actorUserId: actor.userId,
          embeddingVersion: input.embeddingVersion,
          queryEmbeddingLength: input.queryEmbedding?.length ?? 0,
        });

        return {
          items: [
            {
              id: '00000000-0000-4000-8000-000000000111',
              topicSlug: 'rag',
              conceptSlug: 'retrieval',
              eventType: 'question_asked',
              content: 'Hybrid retrieval combines lexical and vector evidence.',
              sourceAgent: 'teaching',
              sourceUri: null,
              confidence: '0.9000',
              embeddingVersion: 'deterministic-1536-v1',
              score: 1,
              createdAt: new Date('2026-07-15T00:00:00.000Z'),
            },
          ],
          lexicalCandidateCount: 1,
          vectorCandidateCount: 1,
          finalContextCount: 1,
          embeddingVersion: 'deterministic-1536-v1',
        };
      },
    };

    const pack = await retrieveRagContext(
      {
        requestId: 'req-1',
        userId,
        agent: 'teaching',
        originalQuery: '  What is hybrid retrieval?  ',
        retrievalMode: 'hybrid',
        filters: { topicSlug: 'rag' },
      },
      { repository },
    );

    expect(calls).toEqual([
      {
        actorUserId: userId,
        embeddingVersion: 'deterministic-1536-v1',
        queryEmbeddingLength: 1536,
      },
    ]);
    expect(pack.trace.normalizedQuery).toBe('What is hybrid retrieval?');
    expect(pack.trace.inferredIntent).toBe('answer_followup');
    expect(pack.items[0]?.rankingSignals.qualityScore).toBe(0.9);
  });
});
