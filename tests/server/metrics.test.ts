import { describe, expect, it, beforeEach } from 'vitest';

import {
  getMetricsSnapshot,
  incrementMetric,
  observeMetric,
  resetMetricsForTests,
} from '../../src/server/metrics';

describe('metrics registry', () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it('aggregates counters with stable low-cardinality labels', () => {
    incrementMetric('cache_l2_access_total', { kind: 'dashboard', result: 'hit' });
    incrementMetric('cache_l2_access_total', { result: 'hit', kind: 'dashboard' });

    expect(getMetricsSnapshot().counters).toEqual([
      {
        name: 'cache_l2_access_total',
        labels: { kind: 'dashboard', result: 'hit' },
        value: 2,
      },
    ]);
  });

  it('aggregates histogram observations without private payload labels', () => {
    observeMetric('rag_final_context_count', 3);
    observeMetric('rag_final_context_count', 5);

    expect(getMetricsSnapshot().histograms).toEqual([
      {
        name: 'rag_final_context_count',
        labels: {},
        count: 2,
        sum: 8,
        min: 3,
        max: 5,
      },
    ]);
  });
});
