import { z } from 'zod';

import { packedContextSchema, type PackedContext } from '@/rag/context-pack';

export const answerStatusSchema = z.enum(['answered', 'clarified', 'refused', 'contradiction_detected']);

export const groundedCitationSchema = z.object({
  citationId: z.string().min(1),
  sourceId: z.string().nullable(),
  chunkId: z.string(),
  title: z.string(),
  url: z.string().url().nullable(),
  anchor: z.string(),
  supportingExcerpt: z.string().min(1),
});

export const groundedClaimSchema = z.object({
  claimId: z.string().min(1),
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)).min(1),
});

export const groundedAnswerSchema = z.object({
  answer: z.string().min(1),
  claims: z.array(groundedClaimSchema),
  citations: z.array(groundedCitationSchema),
  uncertainty: z.string(),
  answerStatus: answerStatusSchema,
});

export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;

export const safeRagRefusal = 'I do not have enough reliable evidence in the available LRNR sources to answer that confidently.';

function excerpt(value: string): string {
  return value.length <= 280 ? value : `${value.slice(0, 277)}...`;
}

export function draftGroundedAnswerFromContext(input: { question: string; context: PackedContext }): GroundedAnswer {
  const context = packedContextSchema.parse(input.context);

  if (context.items.length === 0) {
    return groundedAnswerSchema.parse({
      answer: safeRagRefusal,
      claims: [],
      citations: [],
      uncertainty: 'No permitted context items were available.',
      answerStatus: 'refused',
    });
  }

  const citations = context.items.map((item) => ({
    citationId: item.allowedCitationLabel,
    sourceId: item.documentId,
    chunkId: item.id,
    title: item.title,
    url: item.sourceUri,
    anchor: item.citationAnchor,
    supportingExcerpt: excerpt(item.untrustedEvidenceText),
  }));
  const primary = context.items[0];

  if (primary === undefined) {
    throw new Error('Grounded answer draft expected a non-empty context pack.');
  }

  return groundedAnswerSchema.parse({
    answer: `${primary.untrustedEvidenceText} [${primary.allowedCitationLabel}]`,
    claims: [
      {
        claimId: 'claim-1',
        text: primary.untrustedEvidenceText,
        citationIds: [primary.allowedCitationLabel],
      },
    ],
    citations,
    uncertainty: 'Deterministic draft based only on the provided LRNR context pack.',
    answerStatus: 'answered',
  });
}

function lexicalSupport(claim: string, evidence: string): boolean {
  const claimTerms = new Set(
    claim
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 3),
  );
  const evidenceTerms = new Set(evidence.toLowerCase().split(/\W+/));

  if (claimTerms.size === 0) {
    return false;
  }

  const supported = [...claimTerms].filter((term) => evidenceTerms.has(term)).length;

  return supported / claimTerms.size >= 0.6;
}

export function verifyGroundedAnswer(input: { answer: GroundedAnswer; context: PackedContext }): {
  valid: boolean;
  errors: string[];
} {
  const answer = groundedAnswerSchema.parse(input.answer);
  const context = packedContextSchema.parse(input.context);
  const contextByCitation = new Map(context.items.map((item) => [item.allowedCitationLabel, item]));
  const citationIds = new Set(answer.citations.map((citation) => citation.citationId));
  const errors: string[] = [];

  for (const citation of answer.citations) {
    const contextItem = contextByCitation.get(citation.citationId);

    if (contextItem === undefined) {
      errors.push(`fake_citation:${citation.citationId}`);
      continue;
    }

    if (contextItem.id !== citation.chunkId) {
      errors.push(`citation_chunk_mismatch:${citation.citationId}`);
    }
  }

  for (const claim of answer.claims) {
    for (const citationId of claim.citationIds) {
      if (!citationIds.has(citationId) || !contextByCitation.has(citationId)) {
        errors.push(`claim_fake_citation:${claim.claimId}:${citationId}`);
        continue;
      }

      const evidence = contextByCitation.get(citationId)?.untrustedEvidenceText ?? '';

      if (!lexicalSupport(claim.text, evidence)) {
        errors.push(`claim_not_supported:${claim.claimId}:${citationId}`);
      }
    }
  }

  if (answer.answerStatus === 'answered' && answer.claims.length === 0) {
    errors.push('answered_without_claims');
  }

  return { valid: errors.length === 0, errors };
}
