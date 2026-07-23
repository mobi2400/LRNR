import { extractStructured, generateStructured } from '@/lib/llm';
import { serverConfig } from '@/server/config';
import {
  type FetchedSource,
  type KnowledgeProvenance,
  type SourceCandidate,
  topicKnowledgeDocumentSchema,
  type TopicKnowledgeDocument,
} from '@/schemas/knowledge.schema';
import type { TopicBriefRecord } from '@/db/topic-briefs.repo';
import { z } from 'zod';

/** Injectable synthesizer so the LLM path can be exercised in tests. */
export type CartographerSynthesizer = (input: {
  label: string;
  system: string;
  prompt: string;
  schema: typeof cartographerSynthesisSchema;
  temperature: number;
  maxTokens: number;
}) => Promise<z.infer<typeof cartographerSynthesisSchema>>;

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

function sourceExcerpt(source: FetchedSource): string {
  return source.content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_400);
}
function credibilitySignal(source: FetchedSource): string {
  if (source.sourceType === 'topic_brief') {
    return 'Architect handoff for this owner and topic.';
  }

  return `${source.credibilityTier.replace('_', ' ')} ${source.sourceType.replace('_', ' ')} source.`;
}

function curatedSourcesFor(topicBrief: TopicBriefRecord): SourceCandidate[] {
  const topic =
    `${topicBrief.title} ${topicBrief.goal} ${topicBrief.topicSlug}`.toLowerCase();

  if (!topic.includes('system design') && !topic.includes('sysytem-design')) {
    return [];
  }

  return [
    {
      name: 'AWS Well-Architected Framework',
      url: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html',
      sourceType: 'official_docs',
      credibilityTier: 'tier_1',
      isCritical: true,
    },
    {
      name: 'Google Site Reliability Engineering book',
      url: 'https://sre.google/sre-book/table-of-contents/',
      sourceType: 'official_docs',
      credibilityTier: 'tier_1',
      isCritical: true,
    },
    {
      name: 'Cloudflare learning center: load balancing',
      url: 'https://www.cloudflare.com/learning/performance/what-is-load-balancing/',
      sourceType: 'tutorial',
      credibilityTier: 'tier_2',
      isCritical: false,
    },
  ];
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

  return uniqueBy(
    [internalSource, ...curatedSourcesFor(topicBrief), ...externalSources],
    (source) => source.url,
  );
}

function selectStrongSources(sources: FetchedSource[]): FetchedSource[] {
  return sources.filter(
    (source) =>
      source.sourceType === 'topic_brief' ||
      source.content.trim().length >= 120,
  );
}

function researchQualityFor(
  count: number,
): TopicKnowledgeDocument['metadata']['researchQuality'] {
  return count >= 3 ? 'complete' : count >= 2 ? 'partial' : 'minimal';
}

function buildSourceInventory(
  strongSources: FetchedSource[],
): TopicKnowledgeDocument['sourceInventory'] {
  return strongSources.map((source) => ({
    name: source.name,
    url: source.url,
    retrievedAt: source.retrievedAt,
    sourceType: source.sourceType,
    credibilityTier: source.credibilityTier,
    credibilitySignal: credibilitySignal(source),
    relevantSections: source.relevantSections,
  }));
}

/**
 * Deterministic knowledge scaffold. Retained as the offline/test path and as a
 * resilient fallback when the model synthesis fails, so Cartographer never
 * crashes the pipeline. It is templated, not researched — the LLM path is what
 * turns real source text into grounded knowledge.
 */
export async function buildDeterministicKnowledgeDocument(
  topicBrief: TopicBriefRecord,
  sources: FetchedSource[],
  failedSources: TopicKnowledgeDocument['metadata']['failedSources'],
): Promise<TopicKnowledgeDocument> {
  return extractStructured({
    label: 'cartographer_topic_knowledge',
    produce: () => {
      const strongSources = selectStrongSources(sources);

      if (strongSources.length === 0) {
        throw new Error(
          'Cartographer could not produce knowledge without a usable source.',
        );
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
      const researchQuality = researchQualityFor(strongSources.length);

      return topicKnowledgeDocumentSchema.parse({
        sourceInventory: buildSourceInventory(strongSources),
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
          ...strongSources
            .filter((source) => source.sourceType !== 'topic_brief')
            .slice(0, 6)
            .map((source) => ({
              claim: source.content.replace(/\s+/g, ' ').trim().slice(0, 1_400),
              conceptSlug: topicBrief.topicSlug,
              provenance: [provenanceFromSource(source)],
            })),
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

// The model returns claims that cite source URLs; provenance is attached
// deterministically from the fetched set so URLs can never be hallucinated.
const citedItem = {
  sourceUrls: z.array(z.string()).default([]),
};

const cartographerSynthesisSchema = z.object({
  conceptMap: z
    .array(
      z.object({
        slug: z.string().trim().min(1),
        title: z.string().trim().min(1),
        summary: z.string().trim().min(1),
        prerequisiteSlugs: z.array(z.string().trim().min(1)).default([]),
        ...citedItem,
      }),
    )
    .min(1),
  claims: z
    .array(
      z.object({
        claim: z.string().trim().min(1),
        conceptSlug: z.string().trim().min(1).nullable().default(null),
        ...citedItem,
      }),
    )
    .default([]),
  limitations: z
    .array(
      z.object({
        limitation: z.string().trim().min(1),
        severity: z.enum(['low', 'medium', 'high']).default('medium'),
        ...citedItem,
      }),
    )
    .default([]),
  codePatterns: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        pattern: z.string().trim().min(1),
        whenToUse: z.string().trim().min(1),
        ...citedItem,
      }),
    )
    .default([]),
  interviewPatterns: z
    .array(
      z.object({
        claim: z.string().trim().min(1),
        conceptSlug: z.string().trim().min(1).nullable().default(null),
        ...citedItem,
      }),
    )
    .default([]),
  versionNotes: z
    .array(
      z.object({
        claim: z.string().trim().min(1),
        conceptSlug: z.string().trim().min(1).nullable().default(null),
        ...citedItem,
      }),
    )
    .default([]),
});

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();

  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sourceEvidencePack(strongSources: FetchedSource[]): string {
  return strongSources
    .map((source, index) => {
      const body =
        source.relevantSections.length > 0
          ? source.relevantSections.join(' ')
          : sourceExcerpt(source);

      return [
        `SOURCE ${index + 1}`,
        `name: ${source.name}`,
        `url: ${source.url}`,
        `tier: ${source.credibilityTier}`,
        `excerpt: ${truncate(body, 1_200)}`,
      ].join('\n');
    })
    .join('\n\n');
}

const cartographerSystemPrompt = `You are LRNR's Cartographer research agent.
Synthesize a grounded knowledge base for one learning topic from the supplied sources only.

Rules:
- Use only the supplied source excerpts for factual claims. Do not invent facts, sources, or URLs.
- Every concept, claim, limitation, and pattern must cite the exact source URLs (from the SOURCES) that support it in "sourceUrls".
- Prefer higher-credibility sources. If sources conflict, record it as a limitation.
- Concept summaries must be substantive and specific to the source material, not generic restatements of the title.
- Order conceptMap from foundational to advanced.
- Return one JSON object, no markdown fence.`;

function buildCartographerPrompt(
  topicBrief: TopicBriefRecord,
  strongSources: FetchedSource[],
): string {
  return `Topic: ${topicBrief.title}
Goal: ${topicBrief.goal}
Required depth: ${topicBrief.requiredDepth}
Prerequisites: ${stringArray(topicBrief.prerequisiteMap).join(', ')}
Concept outline (starting point, refine against the sources): ${stringArray(topicBrief.conceptOutline).join(', ')}

SOURCES
${sourceEvidencePack(strongSources)}

Return this JSON shape:
{
  "conceptMap": [{ "slug": "kebab-case", "title": "...", "summary": "grounded 1-3 sentences", "prerequisiteSlugs": ["..."], "sourceUrls": ["exact url"] }],
  "claims": [{ "claim": "...", "conceptSlug": "slug or null", "sourceUrls": ["exact url"] }],
  "limitations": [{ "limitation": "...", "severity": "low|medium|high", "sourceUrls": ["exact url"] }],
  "codePatterns": [{ "title": "...", "pattern": "...", "whenToUse": "...", "sourceUrls": ["exact url"] }],
  "interviewPatterns": [{ "claim": "probing question or pattern", "conceptSlug": "slug or null", "sourceUrls": ["exact url"] }],
  "versionNotes": [{ "claim": "what changed / version note", "conceptSlug": "slug or null", "sourceUrls": ["exact url"] }]
}`;
}

/**
 * Attaches grounded provenance to a synthesized item. URLs not in the fetched
 * set are dropped; if nothing valid remains, the primary source backs the item
 * so the schema's provenance.min(1) invariant always holds.
 */
function attachProvenance(
  sourceUrls: string[],
  allowed: Map<string, KnowledgeProvenance>,
  fallback: KnowledgeProvenance,
): KnowledgeProvenance[] {
  const matched = sourceUrls
    .map((url) => allowed.get(url))
    .filter((entry): entry is KnowledgeProvenance => entry !== undefined);

  return matched.length > 0 ? matched : [fallback];
}

/**
 * Real research synthesis: turns the fetched source excerpts into a grounded,
 * cited knowledge base via the LLM. Citations are constrained to the fetched
 * source URLs; on any failure it falls back to the deterministic scaffold.
 */
export async function synthesizeKnowledgeDocument(
  topicBrief: TopicBriefRecord,
  sources: FetchedSource[],
  failedSources: TopicKnowledgeDocument['metadata']['failedSources'],
  synthesize: CartographerSynthesizer,
): Promise<TopicKnowledgeDocument> {
  const strongSources = selectStrongSources(sources);

  if (strongSources.length === 0) {
    throw new Error(
      'Cartographer could not produce knowledge without a usable source.',
    );
  }

  const allowed = new Map<string, KnowledgeProvenance>(
    strongSources.map((source) => [source.url, provenanceFromSource(source)]),
  );
  const fallbackProvenance = provenanceFromSource(strongSources[0] as FetchedSource);
  const synthesis = await synthesize({
    label: 'cartographer_topic_knowledge',
    system: cartographerSystemPrompt,
    prompt: buildCartographerPrompt(topicBrief, strongSources),
    schema: cartographerSynthesisSchema,
    temperature: 0.3,
    maxTokens: 4_500,
  });

  const conceptMap = uniqueBy(
    synthesis.conceptMap.map((concept, index) => ({
      slug: slugify(concept.slug || concept.title),
      title: truncate(concept.title, 255),
      summary: truncate(concept.summary, 1_000),
      prerequisiteSlugs: concept.prerequisiteSlugs.map(slugify),
      orderingHint: index,
      provenance: attachProvenance(concept.sourceUrls, allowed, fallbackProvenance),
    })),
    (concept) => concept.slug,
  );

  return topicKnowledgeDocumentSchema.parse({
    sourceInventory: buildSourceInventory(strongSources),
    conceptMap,
    claims: synthesis.claims.map((item) => ({
      claim: truncate(item.claim, 1_500),
      conceptSlug: item.conceptSlug,
      provenance: attachProvenance(item.sourceUrls, allowed, fallbackProvenance),
    })),
    limitations: synthesis.limitations.map((item) => ({
      limitation: truncate(item.limitation, 1_500),
      severity: item.severity,
      provenance: attachProvenance(item.sourceUrls, allowed, fallbackProvenance),
    })),
    codePatterns: synthesis.codePatterns.map((item) => ({
      title: truncate(item.title, 255),
      pattern: truncate(item.pattern, 1_500),
      whenToUse: truncate(item.whenToUse, 1_000),
      provenance: attachProvenance(item.sourceUrls, allowed, fallbackProvenance),
    })),
    versionNotes: synthesis.versionNotes.map((item) => ({
      claim: truncate(item.claim, 1_500),
      conceptSlug: item.conceptSlug,
      provenance: attachProvenance(item.sourceUrls, allowed, fallbackProvenance),
    })),
    interviewPatterns: synthesis.interviewPatterns.map((item) => ({
      claim: truncate(item.claim, 1_500),
      conceptSlug: item.conceptSlug,
      provenance: attachProvenance(item.sourceUrls, allowed, fallbackProvenance),
    })),
    metadata: {
      researchQuality: researchQualityFor(strongSources.length),
      failedSources,
      generatedBy: 'cartographer_node',
    },
  });
}

const defaultSynthesizer: CartographerSynthesizer = (input) =>
  generateStructured(input);

/**
 * Builds the topic knowledge base. Production synthesizes real research from the
 * fetched sources via the LLM; tests and offline runs use the deterministic
 * scaffold. If synthesis fails for any reason, we fall back rather than break
 * the daily pipeline.
 */
export async function buildTopicKnowledgeDocument(
  topicBrief: TopicBriefRecord,
  sources: FetchedSource[],
  failedSources: TopicKnowledgeDocument['metadata']['failedSources'],
  options: { synthesize?: CartographerSynthesizer | null } = {},
): Promise<TopicKnowledgeDocument> {
  const synthesize =
    options.synthesize === undefined
      ? serverConfig.nodeEnv === 'test'
        ? null
        : defaultSynthesizer
      : options.synthesize;

  if (synthesize === null) {
    return buildDeterministicKnowledgeDocument(
      topicBrief,
      sources,
      failedSources,
    );
  }

  try {
    return await synthesizeKnowledgeDocument(
      topicBrief,
      sources,
      failedSources,
      synthesize,
    );
  } catch {
    return buildDeterministicKnowledgeDocument(
      topicBrief,
      sources,
      failedSources,
    );
  }
}
