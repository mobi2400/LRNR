import { describe, expect, it } from 'vitest';

import { decideRagConfidence, rerankDeterministically, type RerankableContextItem } from '../../src/rag/retrieval/rerank';

function item(overrides: Partial<RerankableContextItem>): RerankableContextItem {
  return {
    id: 'a',
    content: 'Evidence',
    sourceUri: 'https://example.com',
    topicSlug: 'rag',
    conceptSlug: 'retrieval',
    rankingSignals: {
      lexicalRank: 1,
      vectorRank: 1,
      rrfScore: 0.03,
      recencyScore: 1,
      qualityScore: 0.8,
    },
    ...overrides,
  };
}

describe('RAG reranking and confidence', () => {
  it('reranks deterministically with quality and source signals', () => {
    const reranked = rerankDeterministically([
      item({ id: 'low', rankingSignals: { lexicalRank: 1, vectorRank: 1, rrfScore: 0.03, recencyScore: 1, qualityScore: 0.2 } }),
      item({ id: 'high', rankingSignals: { lexicalRank: 2, vectorRank: 2, rrfScore: 0.025, recencyScore: 2, qualityScore: 0.95 } }),
    ]);

    expect(reranked[0]?.id).toBe('high');
  });

  it('requires more evidence for high-risk answers', () => {
    const decision = decideRagConfidence({
      riskLevel: 'high',
      items: [item({ id: 'only-source' })],
    });

    expect(decision.decision).toBe('clarify');
    expect(decision.reasons).toContain('high_risk_needs_more_sources');
  });

  it('refines when citations are missing', () => {
    const decision = decideRagConfidence({
      riskLevel: 'low',
      items: [item({ id: 'memory-only', sourceUri: null })],
    });

    expect(decision.decision).toBe('refine');
    expect(decision.reasons).toContain('missing_citations');
  });
});
