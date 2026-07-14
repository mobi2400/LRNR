import { knowledgeRepository } from '@/db/knowledge.repo';
import { type DbActor, requireRow } from '@/db/repository-helpers';
import { topicBriefsRepository } from '@/db/topic-briefs.repo';
import {
  buildTopicKnowledgeDocument,
  discoverCartographerSources,
} from '@/agents/cartographer/cartographer-agent';
import { fetchSources, type FetchSourcesOptions } from '@/lib/scraper';
import type { TopicKnowledgeBaseRecord } from '@/db/knowledge.repo';

export interface RunCartographerResearchInput {
  topicSlug: string;
  fetchOptions?: FetchSourcesOptions;
}

export async function runCartographerResearch(
  actor: DbActor,
  input: RunCartographerResearchInput,
): Promise<TopicKnowledgeBaseRecord> {
  const topicBrief = requireRow(
    await topicBriefsRepository.getByTopicSlug(actor, input.topicSlug),
    'Topic brief not found for Cartographer research.',
    {
      topicSlug: input.topicSlug,
    },
  );
  const candidates = discoverCartographerSources(topicBrief);
  const { fetched, failed } = await fetchSources(candidates, input.fetchOptions);
  const criticalFailures = failed.filter((source) => source.isCritical);

  if (fetched.length === 0 || criticalFailures.length > 0) {
    throw new Error('Cartographer research failed because no critical source was usable.');
  }

  const knowledgeDocument = await buildTopicKnowledgeDocument(
    topicBrief,
    fetched,
    failed,
  );

  return knowledgeRepository.upsertTopicKnowledgeBase(actor, {
    topicBriefId: topicBrief.id,
    topicSlug: topicBrief.topicSlug,
    sourceInventory: knowledgeDocument.sourceInventory,
    conceptMap: knowledgeDocument.conceptMap,
    claims: knowledgeDocument.claims,
    limitations: knowledgeDocument.limitations,
    codePatterns: knowledgeDocument.codePatterns,
    versionNotes: knowledgeDocument.versionNotes,
    interviewPatterns: knowledgeDocument.interviewPatterns,
    metadata: knowledgeDocument.metadata,
  });
}
