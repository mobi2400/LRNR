import { describe, expect, it } from 'vitest';

import { classifyQueryRoute, rewriteQueryDeterministically } from '../../src/rag/query-routing';

describe('RAG query routing', () => {
  it('classifies deterministic routes without inventing filters', () => {
    expect(classifyQueryRoute('debug why RAG retrieved the wrong citation')).toBe('rag_debugging');
    expect(classifyQueryRoute('what did I misunderstand last time?')).toBe('learner_history_personalization');
    expect(classifyQueryRoute('build my next lesson plan')).toBe('curriculum_planning');
  });

  it('normalizes, preserves identifiers, and expands known acronyms', () => {
    const rewrite = rewriteQueryDeterministically({ query: ' Explain   RAG and RRF ', maxRefinementAttempts: 1 });

    expect(rewrite.normalizedQuery).toBe('Explain RAG and RRF');
    expect(rewrite.preservedIdentifiers).toEqual(['RAG', 'RRF']);
    expect(rewrite.expandedAcronyms.RAG).toBe('retrieval augmented generation');
    expect(rewrite.subqueries).toEqual(['Explain RAG', 'RRF']);
    expect(rewrite.queryHash).toHaveLength(64);
  });

  it('bounds refinement attempts and subqueries', () => {
    const rewrite = rewriteQueryDeterministically({ query: 'a and b and c and d', maxRefinementAttempts: 2 });

    expect(rewrite.subqueries).toHaveLength(3);
    expect(rewrite.refinement.maxAttempts).toBe(2);
  });
});
