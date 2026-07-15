import { describe, expect, it } from 'vitest';

import {
  assertEmbeddingVersionCompatible,
  evaluateGroundedClaims,
  verifyCitationUrls,
  type EvidenceSpan,
} from '@/workflows/phase1/grounding-policy';

const evidence: EvidenceSpan = {
  sourceId: 'source-1',
  sourceUrl: 'https://example.com/rag',
  text: 'Retrieval augmented generation retrieves relevant source evidence before generating an answer.',
  confidence: 0.91,
  embeddingVersion: 'embedding-v1',
};

describe('phase 1 grounding policy', () => {
  it('supports claims with high-confidence matching evidence', () => {
    const decision = evaluateGroundedClaims({
      expectedEmbeddingVersion: 'embedding-v1',
      claims: [{ claim: 'Retrieval augmented generation retrieves source evidence before answering.', evidence: [evidence] }],
    });

    expect(decision.shouldRefuse).toBe(false);
    expect(decision.supportedClaims).toHaveLength(1);
  });

  it('refuses unsupported or low-confidence claims instead of treating them as truth', () => {
    const decision = evaluateGroundedClaims({
      expectedEmbeddingVersion: 'embedding-v1',
      claims: [
        {
          claim: 'Fine tuning is always the same thing as RAG.',
          evidence: [{ ...evidence, confidence: 0.4 }],
        },
      ],
    });

    expect(decision.shouldRefuse).toBe(true);
    expect(decision.reason).toBe('unsupported_claims_or_low_confidence_evidence');
  });

  it('detects fake citations that do not appear in evidence', () => {
    expect(verifyCitationUrls({ citedUrls: ['https://example.com/rag', 'https://fake.example'], evidence: [evidence] })).toEqual(['https://fake.example']);
  });

  it('blocks incompatible embedding versions', () => {
    expect(() =>
      assertEmbeddingVersionCompatible({
        expectedVersion: 'embedding-v2',
        evidence: [evidence],
      }),
    ).toThrow(/embedding-v1/);
  });
});
