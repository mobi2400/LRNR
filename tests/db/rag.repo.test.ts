import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ragRepository } from '../../src/db/rag.repo';

describe('rag repository surface', () => {
  it('exposes onboarding and session-summary writers as typed wrappers', () => {
    expect(typeof ragRepository.writeOnboardingSeed).toBe('function');
    expect(typeof ragRepository.writeSessionSummary).toBe('function');
    expect(typeof ragRepository.writeMemories).toBe('function');
  });

  it('exposes a filtered bounded context retrieval method', () => {
    expect(typeof ragRepository.retrieveContext).toBe('function');
  });

  it('keeps retrieval filters before limits and does not project embeddings', () => {
    const source = readFileSync('src/db/rag.repo.ts', 'utf8');
    const retrieveContextSource = source.slice(source.indexOf('async retrieveContext'));

    expect(retrieveContextSource).toContain('buildActiveRagConditions');
    expect(retrieveContextSource).toContain('embeddingVersion');
    expect(retrieveContextSource).toContain('lexicalCandidateCount');
    expect(retrieveContextSource).toContain('vectorCandidateCount');
    expect(retrieveContextSource).toContain('finalContextCount');
    expect(retrieveContextSource).not.toContain('embedding: ragMemory.embedding');
  });
});
