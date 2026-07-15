import { describe, expect, it } from 'vitest';

import { buildGraphTraversalPlan } from '../../src/rag/graph-compat';

const userId = '00000000-0000-4000-8000-000000000001';

describe('Graph RAG compatibility helpers', () => {
  it('builds a PostgreSQL-first traversal plan without graph infrastructure', () => {
    const plan = buildGraphTraversalPlan({ userId, conceptSlug: 'retrieval', topicSlug: 'rag' });

    expect(plan.steps).toContain('concept_prerequisites');
    expect(plan.steps).toContain('source_chunk_concepts');
    expect(plan.steps).toContain('contradiction_claims');
    expect(plan.maxDepth).toBe(2);
  });

  it('respects bounded traversal depth', () => {
    expect(() => buildGraphTraversalPlan({ userId, conceptSlug: 'retrieval', maxDepth: 4 })).toThrow();
  });
});
