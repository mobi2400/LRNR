import { z } from 'zod';

export const graphTraversalRequestSchema = z.object({
  userId: z.string().uuid(),
  conceptSlug: z.string().min(1),
  topicSlug: z.string().min(1).optional(),
  includePrerequisites: z.boolean().default(true),
  includeChunks: z.boolean().default(true),
  includeClaims: z.boolean().default(true),
  maxDepth: z.number().int().min(1).max(3).default(2),
});

export type GraphTraversalRequest = z.input<typeof graphTraversalRequestSchema>;

export function buildGraphTraversalPlan(input: GraphTraversalRequest) {
  const request = graphTraversalRequestSchema.parse(input);
  const steps = ['concept'];

  if (request.includePrerequisites) {
    steps.push('concept_prerequisites');
  }

  if (request.includeChunks) {
    steps.push('source_chunk_concepts', 'source_chunks');
  }

  if (request.includeClaims) {
    steps.push('source_claims', 'claim_sources', 'contradiction_claims');
  }

  return {
    userId: request.userId,
    topicSlug: request.topicSlug ?? null,
    conceptSlug: request.conceptSlug,
    maxDepth: request.maxDepth,
    steps,
  };
}
