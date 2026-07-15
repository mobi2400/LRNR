import { describe, expect, it } from 'vitest';

import { runRagGoldenEval } from '../../src/evals/rag-golden-eval';

describe('RAG golden eval harness', () => {
  it('computes retrieval and citation metrics from fixtures', () => {
    const report = runRagGoldenEval({
      retrievalConfigVersion: 'retrieval-config-v1',
      embeddingVersion: 'deterministic-1536-v1',
      rerankerVersion: 'deterministic-rerank-v1',
      thresholds: { recallAtK: 0.5, precisionAtK: 0.25, citationPrecision: 0.5, citationCompleteness: 0.5 },
      fixtures: [
        {
          id: 'exact-keyword',
          query: 'RAG',
          expectedRelevantIds: ['chunk-1'],
          retrievedIds: ['chunk-1', 'chunk-2'],
          citedIds: ['chunk-1'],
          latencyMs: 12,
        },
        {
          id: 'no-evidence-refusal',
          query: 'unknown private fact',
          expectedRelevantIds: ['none'],
          retrievedIds: [],
          citedIds: [],
          shouldRefuse: true,
          didRefuse: true,
          latencyMs: 3,
        },
      ],
    });

    expect(report.metrics.recallAtK).toBeGreaterThanOrEqual(0.5);
    expect(report.metrics.correctRefusalRate).toBe(1);
    expect(report.embeddingVersion).toBe('deterministic-1536-v1');
  });

  it('reports failed fixtures instead of accepting booleans', () => {
    const report = runRagGoldenEval({
      retrievalConfigVersion: 'retrieval-config-v1',
      embeddingVersion: 'deterministic-1536-v1',
      rerankerVersion: 'deterministic-rerank-v1',
      fixtures: [
        {
          id: 'missed-source',
          query: 'RRF',
          expectedRelevantIds: ['chunk-rrf'],
          retrievedIds: ['wrong'],
          citedIds: ['wrong'],
        },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.failedFixtures).toContain('missed-source');
  });
});
