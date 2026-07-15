import { createHash } from 'node:crypto';

import { z } from 'zod';

import { appLogger } from '@/lib/logger';
import { incrementMetric, observeMetric } from '@/server/metrics';

export const ragStageSchema = z.enum([
  'rag.request',
  'rag.route_intent',
  'rag.query_rewrite',
  'rag.permission_filter',
  'rag.lexical_retrieval',
  'rag.vector_retrieval',
  'rag.rank_fusion',
  'rag.rerank',
  'rag.confidence_gate',
  'rag.context_pack_build',
  'llm.generate',
  'rag.citation_verify',
  'rag.refinement',
  'rag.evaluation_log',
]);

export const ragTraceEventSchema = z.object({
  stage: ragStageSchema,
  requestId: z.string().min(1),
  traceId: z.string().min(1),
  userId: z.string().uuid(),
  agent: z.string().min(1),
  intent: z.string().min(1).optional(),
  retrievalMode: z.string().min(1).optional(),
  queryHash: z.string().length(64).optional(),
  embeddingVersion: z.string().optional(),
  rerankerVersion: z.string().optional(),
  candidateCount: z.number().int().min(0).optional(),
  selectedItemCount: z.number().int().min(0).optional(),
  contextTokenCount: z.number().int().min(0).optional(),
  confidenceDecision: z.string().optional(),
  citationResult: z.enum(['passed', 'failed']).optional(),
  cacheStatus: z.enum(['hit', 'miss', 'bypass', 'corrupt', 'rebuild']).optional(),
  latencyMs: z.number().min(0),
  errorCode: z.string().optional(),
});

export type RagTraceEvent = z.input<typeof ragTraceEventSchema>;

export function hashUserIdForTrace(userId: string): string {
  return createHash('sha256').update(z.string().uuid().parse(userId), 'utf8').digest('hex').slice(0, 24);
}

export function recordRagTraceEvent(input: RagTraceEvent): void {
  const event = ragTraceEventSchema.parse(input);
  const labels = { stage: event.stage, agent: event.agent };

  observeMetric('rag_stage_latency_ms', event.latencyMs, labels);

  if (event.candidateCount !== undefined) {
    observeMetric('rag_candidate_count', event.candidateCount, labels);
  }

  if (event.contextTokenCount !== undefined) {
    observeMetric('rag_context_token_count', event.contextTokenCount, labels);
  }

  if (event.confidenceDecision === 'refuse') {
    incrementMetric('rag_confidence_refusal_total', labels);
  }

  if (event.citationResult === 'failed') {
    incrementMetric('rag_citation_verification_failure_total', labels);
  }

  appLogger.info('rag.trace', {
    stage: event.stage,
    requestId: event.requestId,
    traceId: event.traceId,
    userIdHash: hashUserIdForTrace(event.userId),
    agent: event.agent,
    intent: event.intent,
    retrievalMode: event.retrievalMode,
    queryHash: event.queryHash,
    embeddingVersion: event.embeddingVersion,
    rerankerVersion: event.rerankerVersion,
    candidateCount: event.candidateCount,
    selectedItemCount: event.selectedItemCount,
    contextTokenCount: event.contextTokenCount,
    confidenceDecision: event.confidenceDecision,
    citationResult: event.citationResult,
    cacheStatus: event.cacheStatus,
    latencyMs: event.latencyMs,
    errorCode: event.errorCode,
  });
}
