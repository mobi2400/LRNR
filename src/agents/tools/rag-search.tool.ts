import { randomUUID } from 'node:crypto';

import type { DbActor } from '@/db/repository-helpers';
import type { LlmToolDefinition, LlmToolExecutor } from '@/lib/llm';
import { retrieveRagContext } from '@/rag/retrieval/controller';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/agents/tools/rag-search.tool.ts');

/**
 * The rag_search tool lets an agent retrieve real, owner-scoped evidence from
 * LRNR's grounded memory instead of inventing it. This is the retrieval half of
 * the hybrid: the model decides what to look up, the tool returns evidence with
 * source URLs, and the model answers over that evidence.
 */
export const ragSearchToolDefinition: LlmToolDefinition = {
  name: 'rag_search',
  description:
    "Search the learner's grounded LRNR memory and topic knowledge for evidence relevant to a question. Returns evidence snippets, each with a source URL.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific thing to search for.',
      },
    },
    required: ['query'],
  },
};

export interface RagSearchOptions {
  topicSlug?: string;
  maxItems?: number;
}

/**
 * Builds an executor bound to one authenticated actor. Retrieval always runs
 * under that actor's user scope, so the tool can never cross ownership
 * boundaries regardless of what the model asks for.
 */
export function createRagSearchExecutor(
  actor: DbActor,
  options: RagSearchOptions = {},
): LlmToolExecutor {
  const maxItems = options.maxItems ?? 6;

  return async (_name, args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';

    if (query.length === 0) {
      return { evidence: [] };
    }

    const pack = await retrieveRagContext({
      requestId: actor.requestId ?? randomUUID(),
      userId: actor.userId,
      agent: 'teaching',
      intent: 'answer_followup',
      originalQuery: query.slice(0, 1000),
      retrievalMode: 'hybrid',
      filters:
        options.topicSlug === undefined
          ? { unresolvedOnly: false }
          : { topicSlug: options.topicSlug, unresolvedOnly: false },
    });

    return {
      evidence: pack.items.slice(0, maxItems).map((item) => ({
        text: item.content.slice(0, 500),
        sourceUri: item.sourceUri,
      })),
    };
  };
}
