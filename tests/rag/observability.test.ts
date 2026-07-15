import { describe, expect, it } from 'vitest';

import { getMetricsSnapshot, resetMetricsForTests } from '../../src/server/metrics';
import { hashUserIdForTrace, recordRagTraceEvent } from '../../src/rag/observability';

const userId = '00000000-0000-4000-8000-000000000001';

describe('RAG observability', () => {
  it('hashes user ids for trace metadata', () => {
    const hash = hashUserIdForTrace(userId);

    expect(hash).toHaveLength(24);
    expect(hash).not.toBe(userId);
  });

  it('records low-cardinality RAG metrics', () => {
    resetMetricsForTests();

    recordRagTraceEvent({
      stage: 'rag.citation_verify',
      requestId: 'req-1',
      traceId: 'trace-1',
      userId,
      agent: 'teaching',
      latencyMs: 12,
      citationResult: 'failed',
      contextTokenCount: 120,
    });

    const snapshot = getMetricsSnapshot();

    expect(snapshot.histograms.some((metric) => metric.name === 'rag_stage_latency_ms')).toBe(true);
    expect(snapshot.histograms.some((metric) => metric.name === 'rag_context_token_count')).toBe(true);
    expect(snapshot.counters.some((metric) => metric.name === 'rag_citation_verification_failure_total')).toBe(true);
  });
});
