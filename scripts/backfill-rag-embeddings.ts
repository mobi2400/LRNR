import { z } from 'zod';

import { embeddingModelIdSchema, embeddingModelRegistry } from '@/lib/embeddings';

const backfillArgsSchema = z.object({
  model: embeddingModelIdSchema.default('lrnr-deterministic-1536'),
  cursor: z.string().trim().min(1).optional(),
  dryRun: z.boolean().default(true),
});

export function buildEmbeddingBackfillPlan(input: z.input<typeof backfillArgsSchema>) {
  const args = backfillArgsSchema.parse(input);
  const config = embeddingModelRegistry[args.model];

  return {
    dryRun: args.dryRun,
    cursor: args.cursor ?? null,
    model: config.model,
    embeddingVersion: config.embeddingVersion,
    normalizationVersion: config.normalizationVersion,
    dimensions: config.dimensions,
    batchSize: config.maxBatchSize,
    idempotencyKeyPrefix: `embedding-backfill:${config.embeddingVersion}:${config.normalizationVersion}`,
  };
}

if (process.argv[1]?.endsWith('backfill-rag-embeddings.ts')) {
  const plan = buildEmbeddingBackfillPlan({
    model: 'lrnr-deterministic-1536',
    dryRun: true,
  });

  console.log(JSON.stringify(plan, null, 2));
}
