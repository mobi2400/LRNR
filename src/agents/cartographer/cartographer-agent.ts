import {
  extractStructured,
} from '@/lib/llm';
import {
  type FetchedSource,
  type KnowledgeProvenance,
  type SourceCandidate,
  topicKnowledgeDocumentSchema,
  type TopicKnowledgeDocument,
} from '@/schemas/knowledge.schema';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'concept'
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function provenanceFromSource(source: FetchedSource): KnowledgeProvenance {
  return {
    sourceName: source.name,
    sourceUrl: source.url,
    credibilityTier: source.credibilityTier,
  };
}

function credibilitySignal(source: FetchedSource): string {
  if (source.sourceType === 'topic_brief') {
    return 'Architect handoff for this owner and topic.';
  }

  return `${source.credibilityTier.replace('_', ' ')} ${source.sourceType.replace('_', ' ')} source.`;
}

export function discoverCartographerSources(
  topicBrief: TopicBriefRecord,
): SourceCandidate[] {
  const recommendedSources = stringArray(
    topicBrief.learnerContext.recommendedSources,
  );
  const internalSource: SourceCandidate = {
    name: `${topicBrief.title} topic brief`,
    url: `lrnr://topic-briefs/${topicBrief.id}`,
    sourceType: 'topic_brief',
    credibilityTier: 'tier_1',
    isCritical: true,
    seedText: [
      `Goal: ${topicBrief.goal}`,
      `Required depth: ${topicBrief.requiredDepth}`,
      `Prerequisites: ${stringArray(topicBrief.prerequisiteMap).join(', ')}`,
      `Concept outline: ${stringArray(topicBrief.conceptOutline).join(', ')}`,
      `Learner context: ${JSON.stringify(topicBrief.learnerContext)}`,
    ].join('\n'),
  };
  const externalSources = recommendedSources.map((url, index) => ({
    name: `Recommended source ${index + 1}`,
    url,
    sourceType: 'tutorial' as const,
    credibilityTier: 'tier_3' as const,
    isCritical: false,
  }));

  return [internalSource, ...externalSources];
}

export async function buildTopicKnowledgeDocument(
  topicBrief: TopicBriefRecord,
  sources: FetchedSource[],
  failedSources: TopicKnowledgeDocument['metadata']['failedSources'],
): Promise<TopicKnowledgeDocument> {
  return extractStructured({
    label: 'cartographer_topic_knowledge',
    produce: () => {
      const strongSources = sources.filter(
        (source) =>
          source.sourceType === 'topic_brief' ||
          source.content.trim().length >= 120,
      );

      if (strongSources.length === 0) {
        throw new Error('Cartographer could not produce knowledge without a usable source.');
      }

      const primarySource = strongSources[0] as FetchedSource;
      const primaryProvenance = [provenanceFromSource(primarySource)];
      const prerequisites = stringArray(topicBrief.prerequisiteMap);
      const concepts = stringArray(topicBrief.conceptOutline);
      const conceptMap = uniqueBy(
        concepts.map((concept, index) => ({
          slug: slugify(concept),
          title: concept,
          summary: `Understand ${concept} in the context of ${topicBrief.title}.`,
          prerequisiteSlugs: prerequisites.map(slugify),
          orderingHint: index,
          provenance: primaryProvenance,
        })),
        (concept) => concept.slug,
      );
      const sourceInventory = strongSources.map((source) => ({
        name: source.name,
        url: source.url,
        retrievedAt: source.retrievedAt,
        sourceType: source.sourceType,
        credibilityTier: source.credibilityTier,
        credibilitySignal: credibilitySignal(source),
        relevantSections: source.relevantSections,
      }));
      const researchQuality =
        strongSources.length >= 3
          ? 'complete'
          : strongSources.length >= 2
            ? 'partial'
            : 'minimal';

      return topicKnowledgeDocumentSchema.parse({
        sourceInventory,
        conceptMap:
          conceptMap.length > 0
            ? conceptMap
            : [
                {
                  slug: topicBrief.topicSlug,
                  title: topicBrief.title,
                  summary: `Map the core ideas needed to reach: ${topicBrief.goal}`,
                  prerequisiteSlugs: prerequisites.map(slugify),
                  orderingHint: 0,
                  provenance: primaryProvenance,
                },
              ],
        claims: [
          {
            claim: `The learning path should target ${topicBrief.requiredDepth} depth for ${topicBrief.title}.`,
            conceptSlug: topicBrief.topicSlug,
            provenance: primaryProvenance,
          },
        ],
        limitations: [
          {
            limitation:
              'This Phase 1 research pass is bounded and should be refreshed when official external sources are attached.',
            severity: researchQuality === 'minimal' ? 'medium' : 'low',
            provenance: primaryProvenance,
          },
        ],
        codePatterns: [
          {
            title: `${topicBrief.title} practice loop`,
            pattern:
              'Introduce one concept, inspect a concrete example, then ask the learner to explain the tradeoff in their own words.',
            whenToUse:
              'Use during early lessons when the learner needs grounded practice before broader synthesis.',
            provenance: primaryProvenance,
          },
        ],
        versionNotes: [],
        interviewPatterns: [
          {
            claim:
              'Probe for demonstrated reasoning rather than asking the learner whether they know a prerequisite.',
            conceptSlug: topicBrief.topicSlug,
            provenance: primaryProvenance,
          },
        ],
        metadata: {
          researchQuality,
          failedSources,
          generatedBy: 'cartographer_node',
        },
      });
    },
  });
}
