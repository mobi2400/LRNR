import { z } from 'zod';

export const ragConfidenceDecisionSchema = z.enum([
  'sufficient',
  'clarify',
  'refine',
  'refuse',
  'contradiction_review',
]);

export const rerankableContextItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  sourceUri: z.string().nullable(),
  topicSlug: z.string().nullable(),
  conceptSlug: z.string().nullable(),
  rankingSignals: z.object({
    lexicalRank: z.number().int().positive().nullable(),
    vectorRank: z.number().int().positive().nullable(),
    rrfScore: z.number(),
    recencyScore: z.number(),
    qualityScore: z.number(),
  }),
});

export const confidenceInputSchema = z.object({
  riskLevel: z.enum(['low', 'medium', 'high']),
  items: z.array(rerankableContextItemSchema),
});

export type RagConfidenceDecision = z.infer<typeof ragConfidenceDecisionSchema>;
export type RerankableContextItem = z.infer<typeof rerankableContextItemSchema>;

function normalizeRecency(items: RerankableContextItem[], item: RerankableContextItem): number {
  const values = items.map((candidate) => candidate.rankingSignals.recencyScore);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return 0.5;
  }

  return (item.rankingSignals.recencyScore - min) / (max - min);
}

export function rerankDeterministically(items: RerankableContextItem[]): RerankableContextItem[] {
  return [...items].sort((left, right) => {
    const leftScore =
      left.rankingSignals.rrfScore * 8 +
      left.rankingSignals.qualityScore * 2 +
      normalizeRecency(items, left) +
      (left.sourceUri === null ? 0 : 0.2);
    const rightScore =
      right.rankingSignals.rrfScore * 8 +
      right.rankingSignals.qualityScore * 2 +
      normalizeRecency(items, right) +
      (right.sourceUri === null ? 0 : 0.2);

    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

export function decideRagConfidence(input: z.input<typeof confidenceInputSchema>): {
  decision: RagConfidenceDecision;
  reasons: string[];
} {
  const { riskLevel, items } = confidenceInputSchema.parse(input);
  const reasons: string[] = [];

  if (items.length === 0) {
    return { decision: 'refuse', reasons: ['no_retrieved_evidence'] };
  }

  const sourcedItems = items.filter((item) => item.sourceUri !== null).length;
  const averageQuality =
    items.reduce((sum, item) => sum + item.rankingSignals.qualityScore, 0) / items.length;
  const hasHybridSupport = items.some(
    (item) => item.rankingSignals.lexicalRank !== null && item.rankingSignals.vectorRank !== null,
  );

  if (averageQuality < 0.45) {
    reasons.push('low_average_quality');
  }

  if (sourcedItems === 0) {
    reasons.push('missing_citations');
  }

  if (!hasHybridSupport) {
    reasons.push('single_retrieval_signal');
  }

  if (riskLevel === 'high' && sourcedItems < 2) {
    return { decision: 'clarify', reasons: [...reasons, 'high_risk_needs_more_sources'] };
  }

  if (reasons.includes('missing_citations')) {
    return { decision: 'refine', reasons };
  }

  if (averageQuality < 0.35) {
    return { decision: 'refuse', reasons };
  }

  if (reasons.length > 0) {
    return { decision: 'clarify', reasons };
  }

  return { decision: 'sufficient', reasons: ['evidence_baseline_met'] };
}
