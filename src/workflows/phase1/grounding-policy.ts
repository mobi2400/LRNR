import { z } from 'zod';

export const evidenceSpanSchema = z.object({
  sourceId: z.string().min(1),
  sourceUrl: z.string().min(1),
  text: z.string().trim().min(24),
  confidence: z.number().min(0).max(1),
  embeddingVersion: z.string().min(1),
});

export const groundedClaimSchema = z.object({
  claim: z.string().trim().min(1),
  evidence: z.array(evidenceSpanSchema).default([]),
});

export const groundingDecisionSchema = z.object({
  supportedClaims: z.array(groundedClaimSchema),
  unsupportedClaims: z.array(groundedClaimSchema),
  shouldRefuse: z.boolean(),
  reason: z.string().nullable(),
});

export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;
export type GroundedClaim = z.infer<typeof groundedClaimSchema>;
export type GroundingDecision = z.infer<typeof groundingDecisionSchema>;

const MIN_EVIDENCE_CONFIDENCE = 0.7;

function hasLexicalOverlap(claim: string, evidence: string): boolean {
  const claimTokens = new Set(claim.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 4));
  const evidenceTokens = new Set(evidence.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 4));
  const overlap = [...claimTokens].filter((token) => evidenceTokens.has(token));

  return overlap.length >= Math.min(2, claimTokens.size);
}

export function assertEmbeddingVersionCompatible(input: { expectedVersion: string; evidence: EvidenceSpan[] }): void {
  const parsed = z.object({ expectedVersion: z.string().min(1), evidence: z.array(evidenceSpanSchema) }).parse(input);
  const incompatible = parsed.evidence.filter((span) => span.embeddingVersion !== parsed.expectedVersion);

  if (incompatible.length > 0) {
    throw new Error(`Evidence uses incompatible embedding versions: ${[...new Set(incompatible.map((span) => span.embeddingVersion))].join(', ')}`);
  }
}

export function evaluateGroundedClaims(input: { claims: GroundedClaim[]; expectedEmbeddingVersion: string }): GroundingDecision {
  const parsed = z.object({ claims: z.array(groundedClaimSchema), expectedEmbeddingVersion: z.string().min(1) }).parse(input);
  const supportedClaims: GroundedClaim[] = [];
  const unsupportedClaims: GroundedClaim[] = [];

  for (const claim of parsed.claims) {
    assertEmbeddingVersionCompatible({ expectedVersion: parsed.expectedEmbeddingVersion, evidence: claim.evidence });
    const supported = claim.evidence.some((span) => span.confidence >= MIN_EVIDENCE_CONFIDENCE && hasLexicalOverlap(claim.claim, span.text));

    if (supported) {
      supportedClaims.push(claim);
    } else {
      unsupportedClaims.push(claim);
    }
  }

  return groundingDecisionSchema.parse({
    supportedClaims,
    unsupportedClaims,
    shouldRefuse: unsupportedClaims.length > 0,
    reason: unsupportedClaims.length > 0 ? 'unsupported_claims_or_low_confidence_evidence' : null,
  });
}

export function verifyCitationUrls(input: { citedUrls: string[]; evidence: EvidenceSpan[] }): string[] {
  const parsed = z.object({ citedUrls: z.array(z.string().min(1)), evidence: z.array(evidenceSpanSchema) }).parse(input);
  const evidenceUrls = new Set(parsed.evidence.map((span) => span.sourceUrl));

  return parsed.citedUrls.filter((url) => !evidenceUrls.has(url));
}
