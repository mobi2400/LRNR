import { z } from 'zod';

export const ragEvalFixtureSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedRelevantIds: z.array(z.string()).min(1),
  retrievedIds: z.array(z.string()),
  citedIds: z.array(z.string()),
  shouldRefuse: z.boolean().default(false),
  didRefuse: z.boolean().default(false),
  latencyMs: z.number().min(0).default(0),
});

export const ragEvalReportSchema = z.object({
  passed: z.boolean(),
  retrievalConfigVersion: z.string(),
  embeddingVersion: z.string(),
  rerankerVersion: z.string(),
  metrics: z.object({
    recallAtK: z.number(),
    precisionAtK: z.number(),
    mrr: z.number(),
    citationPrecision: z.number(),
    citationCompleteness: z.number(),
    correctRefusalRate: z.number(),
    falseRefusalRate: z.number(),
    averageLatencyMs: z.number(),
  }),
  thresholds: z.record(z.string(), z.number()),
  failedFixtures: z.array(z.string()),
});

export type RagEvalFixture = z.input<typeof ragEvalFixtureSchema>;
export type RagEvalReport = z.infer<typeof ragEvalReportSchema>;

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runRagGoldenEval(input: {
  fixtures: RagEvalFixture[];
  k?: number;
  thresholds?: Partial<RagEvalReport['thresholds']>;
  retrievalConfigVersion: string;
  embeddingVersion: string;
  rerankerVersion: string;
}): RagEvalReport {
  const fixtures = z.array(ragEvalFixtureSchema).parse(input.fixtures);
  const k = input.k ?? 5;
  const thresholds = {
    recallAtK: 0.7,
    precisionAtK: 0.5,
    citationPrecision: 0.8,
    citationCompleteness: 0.8,
    correctRefusalRate: 0.8,
    falseRefusalRate: 0.1,
    ...(input.thresholds ?? {}),
  };
  const recallValues: number[] = [];
  const precisionValues: number[] = [];
  const mrrValues: number[] = [];
  const citationPrecisionValues: number[] = [];
  const citationCompletenessValues: number[] = [];
  const failedFixtures = new Set<string>();

  for (const fixture of fixtures) {
    const topK = fixture.retrievedIds.slice(0, k);
    const expected = new Set(fixture.expectedRelevantIds);
    const hits = topK.filter((id) => expected.has(id));
    const firstHitIndex = topK.findIndex((id) => expected.has(id));
    const citedRelevant = fixture.citedIds.filter((id) => expected.has(id));

    recallValues.push(hits.length / expected.size);
    precisionValues.push(topK.length === 0 ? 0 : hits.length / topK.length);
    mrrValues.push(firstHitIndex === -1 ? 0 : 1 / (firstHitIndex + 1));
    citationPrecisionValues.push(fixture.citedIds.length === 0 ? 0 : citedRelevant.length / fixture.citedIds.length);
    citationCompletenessValues.push(citedRelevant.length / expected.size);

    if (!fixture.shouldRefuse && hits.length === 0) {
      failedFixtures.add(fixture.id);
    }

    if (fixture.shouldRefuse !== fixture.didRefuse) {
      failedFixtures.add(fixture.id);
    }
  }

  const refusalFixtures = fixtures.filter((fixture) => fixture.shouldRefuse);
  const nonRefusalFixtures = fixtures.filter((fixture) => !fixture.shouldRefuse);
  const correctRefusalRate = refusalFixtures.length === 0 ? 1 : refusalFixtures.filter((fixture) => fixture.didRefuse).length / refusalFixtures.length;
  const falseRefusalRate = nonRefusalFixtures.length === 0 ? 0 : nonRefusalFixtures.filter((fixture) => fixture.didRefuse).length / nonRefusalFixtures.length;
  const metrics = {
    recallAtK: average(recallValues),
    precisionAtK: average(precisionValues),
    mrr: average(mrrValues),
    citationPrecision: average(citationPrecisionValues),
    citationCompleteness: average(citationCompletenessValues),
    correctRefusalRate,
    falseRefusalRate,
    averageLatencyMs: average(fixtures.map((fixture) => fixture.latencyMs)),
  };

  for (const [name, threshold] of Object.entries(thresholds)) {
    const value = metrics[name as keyof typeof metrics];

    if (name === 'falseRefusalRate' ? value > threshold : value < threshold) {
      fixtures.forEach((fixture) => failedFixtures.add(fixture.id));
    }
  }

  return ragEvalReportSchema.parse({
    passed: failedFixtures.size === 0,
    retrievalConfigVersion: input.retrievalConfigVersion,
    embeddingVersion: input.embeddingVersion,
    rerankerVersion: input.rerankerVersion,
    metrics,
    thresholds,
    failedFixtures: [...failedFixtures].sort(),
  });
}
