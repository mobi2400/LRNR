import { z } from 'zod';

export const ragRolloutModeSchema = z.enum(['legacy', 'shadow', 'hybrid_enabled', 'verification_enabled']);

export const ragRetrievalRuntimeConfigSchema = z.object({
  retrievalConfigVersion: z.literal('retrieval-config-v1').default('retrieval-config-v1'),
  rolloutMode: ragRolloutModeSchema.default('shadow'),
  embeddingVersion: z.literal('deterministic-1536-v1').default('deterministic-1536-v1'),
  rerankerVersion: z.literal('deterministic-rerank-v1').default('deterministic-rerank-v1'),
  maxCandidatePool: z.number().int().positive().max(100).default(20),
  enableFinalAnswerCache: z.literal(false).default(false),
});

export const backfillCheckpointSchema = z.object({
  jobName: z.string().min(1),
  cursor: z.string().nullable(),
  processedRows: z.number().int().min(0),
  failedRows: z.array(z.object({ rowId: z.string(), errorCode: z.string() })).default([]),
  embeddingVersion: z.string().min(1),
  dryRun: z.boolean().default(true),
});

export type RagRetrievalRuntimeConfig = z.infer<typeof ragRetrievalRuntimeConfigSchema>;
export type BackfillCheckpoint = z.infer<typeof backfillCheckpointSchema>;

export function defaultRagRuntimeConfig(): RagRetrievalRuntimeConfig {
  return ragRetrievalRuntimeConfigSchema.parse({});
}

export function assertNoMixedEmbeddingVersions(input: { requestedVersion: string; storedVersions: string[] }): void {
  const versions = new Set(input.storedVersions);

  if (versions.size > 1 || !versions.has(input.requestedVersion)) {
    throw new Error('Mixed or incompatible embedding versions detected for retrieval.');
  }
}

export function advanceBackfillCheckpoint(input: {
  checkpoint: BackfillCheckpoint;
  rowId: string;
  nextCursor: string | null;
  errorCode?: string;
}): BackfillCheckpoint {
  const checkpoint = backfillCheckpointSchema.parse(input.checkpoint);

  return backfillCheckpointSchema.parse({
    ...checkpoint,
    cursor: input.nextCursor,
    processedRows: checkpoint.processedRows + 1,
    failedRows:
      input.errorCode === undefined
        ? checkpoint.failedRows
        : [...checkpoint.failedRows, { rowId: input.rowId, errorCode: input.errorCode }],
  });
}
