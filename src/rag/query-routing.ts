import { createHash } from 'node:crypto';

import { z } from 'zod';

export const queryRouteSchema = z.enum([
  'factual_lookup',
  'conceptual_teaching',
  'curriculum_planning',
  'learner_history_personalization',
  'source_exploration',
  'evaluation_feedback',
  'contradiction_resolution',
  'rag_debugging',
]);

export const queryRewriteSchema = z.object({
  normalizedQuery: z.string().min(1),
  queryHash: z.string().length(64),
  route: queryRouteSchema,
  subqueries: z.array(z.string().min(1)).max(3),
  preservedIdentifiers: z.array(z.string()),
  expandedAcronyms: z.record(z.string(), z.string()),
  refinement: z.object({
    maxAttempts: z.number().int().min(0).max(2),
    alternateLexicalTerms: z.array(z.string()).max(5),
    retryModes: z.array(z.enum(['lexical', 'vector', 'hybrid'])).max(2),
  }),
});

export type QueryRoute = z.infer<typeof queryRouteSchema>;
export type QueryRewrite = z.infer<typeof queryRewriteSchema>;

const acronymExpansions: Record<string, string> = {
  RAG: 'retrieval augmented generation',
  RRF: 'reciprocal rank fusion',
  LLM: 'large language model',
};

function hashQuery(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function classifyQueryRoute(query: string): QueryRoute {
  const normalized = query.toLowerCase();

  if (/debug|trace|why.*retriev|rag.*fail|citation.*wrong/.test(normalized)) {
    return 'rag_debugging';
  }

  if (/contradict|conflict|inconsistent|does.*not match/.test(normalized)) {
    return 'contradiction_resolution';
  }

  if (/quiz|evaluate|score|feedback|mistake|gap/.test(normalized)) {
    return 'evaluation_feedback';
  }

  if (/source|citation|paper|article|where.*from/.test(normalized)) {
    return 'source_exploration';
  }

  if (/curriculum|roadmap|plan|sequence|next lesson/.test(normalized)) {
    return 'curriculum_planning';
  }

  if (/my|me|i\s|previous|last time|history/.test(normalized)) {
    return 'learner_history_personalization';
  }

  if (/teach|explain|concept|why|how/.test(normalized)) {
    return 'conceptual_teaching';
  }

  return 'factual_lookup';
}

export function rewriteQueryDeterministically(input: { query: string; maxRefinementAttempts?: number }): QueryRewrite {
  const normalizedQuery = input.query.replace(/\s+/g, ' ').trim();
  const preservedIdentifiers = normalizedQuery.match(/\b[A-Z][A-Z0-9_-]{1,}\b/g) ?? [];
  const expandedAcronyms = Object.fromEntries(
    preservedIdentifiers
      .filter((identifier) => acronymExpansions[identifier] !== undefined)
      .map((identifier) => [identifier, acronymExpansions[identifier] as string]),
  );
  const subqueries = normalizedQuery
    .split(/\s+(?:and|then|also)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const alternateLexicalTerms = Object.values(expandedAcronyms).slice(0, 5);

  return queryRewriteSchema.parse({
    normalizedQuery,
    queryHash: hashQuery(normalizedQuery),
    route: classifyQueryRoute(normalizedQuery),
    subqueries: subqueries.length > 0 ? subqueries : [normalizedQuery],
    preservedIdentifiers,
    expandedAcronyms,
    refinement: {
      maxAttempts: input.maxRefinementAttempts ?? 1,
      alternateLexicalTerms,
      retryModes: ['hybrid', 'lexical'],
    },
  });
}
