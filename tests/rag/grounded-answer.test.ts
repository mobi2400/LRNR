import { describe, expect, it } from 'vitest';

import { buildContextPack } from '../../src/rag/context-pack';
import {
  draftGroundedAnswerFromContext,
  safeRagRefusal,
  verifyGroundedAnswer,
} from '../../src/rag/generation/grounded-answer';

const context = buildContextPack({
  items: [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      title: 'RAG source',
      citationAnchor: 'https://example.com/rag#chunk-1',
      synthesisText: 'Hybrid retrieval combines lexical and vector evidence for grounded answers.',
      conceptSlug: 'retrieval',
      sourceUri: 'https://example.com/rag',
      tokenCount: 24,
      sourceQuality: 0.9,
      freshnessScore: 0.8,
      rerankScore: 0.04,
    },
  ],
});

describe('grounded answer verification', () => {
  it('drafts and verifies an answer using only context-pack citations', () => {
    const answer = draftGroundedAnswerFromContext({ question: 'What is hybrid retrieval?', context });
    const verification = verifyGroundedAnswer({ answer, context });

    expect(answer.answerStatus).toBe('answered');
    expect(answer.citations[0]?.citationId).toBe('S1');
    expect(verification.valid).toBe(true);
  });

  it('rejects fake citation ids', () => {
    const answer = draftGroundedAnswerFromContext({ question: 'What is hybrid retrieval?', context });
    const verification = verifyGroundedAnswer({
      context,
      answer: {
        ...answer,
        claims: [{ claimId: 'claim-1', text: 'Hybrid retrieval combines lexical and vector evidence.', citationIds: ['S99'] }],
      },
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('claim_fake_citation:claim-1:S99');
  });

  it('refuses safely when no context is available', () => {
    const emptyContext = buildContextPack({ items: [] });
    const answer = draftGroundedAnswerFromContext({ question: 'What should I learn?', context: emptyContext });

    expect(answer.answerStatus).toBe('refused');
    expect(answer.answer).toBe(safeRagRefusal);
  });
});
