# LRNR — Agent 02: Cartographer Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/cartographer.ts` |
| LangGraph node name | `cartographer_node` |
| Exported function | `runCartographerAgent(state: LearningGraphState): Promise<Partial<LearningGraphState>>` |
| LLM model | `reasoningLLM()` — `llama-3.3-70b-versatile` |
| Trigger | Immediately after `architect_node` completes on new topic start |
| Runs in graph | Learning Graph only — Route A (new topic) |
| Position | Second node after architect on Route A |
| Avg runtime | 5-12 minutes (heavy fetching + extraction) |

---

## What This Agent Does — Plain English

The Cartographer is the system's research engine. Its job is to map the entire knowledge territory of a topic before a single lesson is taught. When the Architect hands off "teach this user LangChain at working depth", the Cartographer goes wide and deep across every credible source it can find — official documentation, the actual GitHub repository, research papers that informed the design, engineering blogs from companies that run it in production, known issues and gotchas from maintainer discussions, interview patterns from the community — and structures everything it finds into a Topic Knowledge Base that every downstream agent draws from for the entire learning journey.

The distinction between the Cartographer and the Scout is critical and must never blur. The Cartographer runs once per topic, goes deep, and maps the full territory. The Scout runs daily, goes light, and watches the frontier for new developments. The Cartographer is the explorer who charts the unknown. The Scout is the ranger who monitors the border.

Everything the Cartographer finds gets credibility-tiered. A claim from the official PostgreSQL documentation is Tier 1 — ground truth. A claim from a PostgreSQL core contributor's blog post is Tier 2 — authoritative opinion. A claim from a well-cited Shopify engineering blog is Tier 3 — useful but needs cross-referencing. A claim repeated by 30 Reddit posts is Tier 4 — signal in aggregate, never in isolation. The system never treats these equally, and neither does the Cartographer.

The Cartographer also does something most research systems don't: it actively looks for contradictions. When two credible sources say different things about the same concept, the Cartographer flags it in the `contradiction_queue` for the Contradiction Agent to classify and resolve. It does not try to resolve contradictions itself — that is not its job.

---

## Inputs

### From LangGraph State
```typescript
{
  userId: string;
  currentTopic: string;             // slug: 'langchain', 'databases', 'ann'
  profile: UserProfile;             // needs depthRequired, timeCommitmentMins
}
```

### From Database
```typescript
// Primary input — everything Architect learned about this topic
const topicBrief = await getTopicBrief(userId, currentTopic);
// Contains: depthRequired, estimatedDays, whyLearning,
//           prerequisiteMap, conceptOutline, keySourcesHint,
//           knownControversies, versionContext
```

---

## Outputs

### 1. Topic Knowledge Base → `topic_knowledge_base` table

The single most important output in the system. Everything the Teaching Agent says, every example it uses, every production scenario it references, every interview question it asks — all of it comes from here.

Full schema in `03_DATA_SCHEMA.md`. Fields populated by this agent:

```typescript
{
  coreConcepts: CoreConcept[];           // extracted from Tier 1-2 sources
  archDecisions: ArchDecision[];         // why the tool is designed as it is
  limitations: Limitation[];            // what breaks, when, and how badly
  productionExamples: ProductionExample[]; // real companies, real scenarios
  codePatterns: CodePattern[];          // idiomatic usage patterns
  interviewPatterns: InterviewPattern[]; // what interviewers actually test
  historicalContext: HistoricalContext; // what existed before, why this was built
  versionInfo: VersionInfo;             // current version, breaking changes
  contradictions: ContradictionEntry[]; // conflicts found, pending resolution
  sourcesInventory: SourceEntry[];      // everything fetched with credibility
  researchQuality: 'complete' | 'partial' | 'minimal';
}
```

### 2. Contradiction Queue → `contradiction_queue` table

For every conflict found between sources during research:
```typescript
{
  userId, topicId,
  claimA, sourceAUrl, sourceAName, sourceATier,
  claimB, sourceBUrl, sourceBName, sourceBTier,
  relatedConcept,
  status: 'pending',
  flaggedBy: 'cartographer_node'
}
```

---

## Source Strategy — What To Fetch and In What Order

### Tier 1 Sources — Always fetch these first

**Official Documentation:**
- Find the official docs URL from the topic brief or construct it:
  - LangChain: `https://python.langchain.com/docs/` and `https://js.langchain.com/docs/`
  - PostgreSQL: `https://www.postgresql.org/docs/current/`
  - PyTorch: `https://pytorch.org/docs/stable/`
  - Pattern: `https://docs.{topicname}.{tld}/`
- Use Firecrawl **crawl mode** on the root docs URL — get the full documentation tree
- Focus crawl on: getting started, concepts, architecture, API reference, production guides
- Max crawl depth: 3 levels. Max pages: 50.

**Official GitHub Repository:**
- Find via `https://github.com/{org}/{repo}`
- Fetch: `README.md`, `ARCHITECTURE.md` or equivalent, `/docs` folder if present
- Fetch recent releases page — extract version history and breaking changes
- Fetch open issues labelled `bug`, `known-issue`, `performance` — these are gold for limitations
- Fetch closed issues with high comment count — community-identified problems
- Do NOT crawl the full codebase — too large. Focus on docs and issues only.

**Research Papers (arXiv):**
- Search arXiv for papers that either introduced or significantly influenced the topic
- For LLM tools: search for the paper that introduced the underlying technique
- For databases: search for original papers (e.g., Dynamo, Bigtable, Spanner for NoSQL)
- Fetch abstract + introduction + conclusion of each paper — skip methodology for now
- Max papers: 5 per topic

---

### Tier 2 Sources — Fetch after Tier 1 complete

**Core Contributor Writing:**
- Find the GitHub profiles of top contributors to the official repo
- Search their blogs, Substack, or Medium for posts about the topic
- Search for conference talks (YouTube, conference sites) by the original authors
- These are authoritative opinions — not ground truth but very high signal

**Official Blog / Changelog:**
- Company behind the tool often has an engineering blog
- Fetch all posts tagged with the topic from the last 2 years
- Changelogs often contain the most honest descriptions of what was wrong and what was fixed

---

### Tier 3 Sources — Fetch selectively

**Engineering Blogs from Practitioners at Scale:**
Priority list of high-signal engineering blogs:
```
engineering.shopify.com
engineering.atspotify.com
netflixtechblog.com
eng.uber.com
airbnb.io
engineering.linkedin.com
discord.com/blog/engineering
slack.engineering
stripe.com/blog/engineering
notion.so/blog/engineering
figma.com/blog/engineering
dropbox.tech
medium.engineering
instagram-engineering.com
```

Search pattern: `"{topic}" site:{blog_url}` — use Firecrawl scrape mode on results.

**Curated Stack Overflow:**
- Search for questions about the topic with `score:50` minimum
- Extract the accepted answer + top-voted answer
- Note any answers where high-voted answer contradicts accepted answer — flag as contradiction

---

### Tier 4 Sources — Aggregate signals only

**Reddit:**
- `r/programming`, `r/MachineLearning`, `r/cscareerquestions`, topic-specific subreddits
- Fetch top posts of all time about the topic
- Do NOT use individual posts as evidence — look for patterns across 20+ posts
- Useful for: finding what frustrates practitioners, what confuses beginners, what interview prep focuses on

**Hacker News:**
- Search `hn.algolia.com` for the topic
- High-score HN threads (200+ points) about the topic are worth reading
- Comments from domain-expert users carry Tier 3 weight individually

---

## Extraction Pipeline — What To Extract From Each Source

For every source fetched, run this extraction:

```typescript
export function extractionPrompt(
  sourceContent: string,
  sourceName: string,
  sourceTier: number,
  topicName: string,
  topicBrief: TopicBrief
): string {
  return `You are extracting structured knowledge from a source about ${topicName}.

SOURCE: ${sourceName} (Credibility Tier ${sourceTier})
TOPIC CONTEXT: ${topicBrief.whyLearning}
DEPTH NEEDED: ${topicBrief.depthRequired}

SOURCE CONTENT:
${sourceContent.slice(0, 8000)}

Extract ALL of the following that appear in this source.
If something doesn't appear, return an empty array for that field.
Return JSON only, no other text:

{
  "coreConcepts": [
    {
      "concept": string,
      "explanation": string,
      "tier": ${sourceTier},
      "sourceUrl": string,
      "sourceName": "${sourceName}"
    }
  ],
  "archDecisions": [
    {
      "decision": string,
      "rationale": string,
      "tradeoff": string,
      "sourceUrl": string,
      "tier": ${sourceTier}
    }
  ],
  "limitations": [
    {
      "limitation": string,
      "context": string,
      "severity": "minor|major|critical",
      "sourceUrl": string
    }
  ],
  "productionExamples": [
    {
      "company": string,
      "scenario": string,
      "whatTheyDid": string,
      "outcome": string,
      "sourceUrl": string
    }
  ],
  "codePatterns": [
    {
      "patternName": string,
      "description": string,
      "code": string,
      "language": string,
      "concept": string
    }
  ],
  "interviewPatterns": [
    {
      "question": string,
      "angle": "recall|application|stress|edge_case|connection|historical",
      "whatItTests": string,
      "depthRequired": string
    }
  ],
  "historicalContext": {
    "problemBefore": string | null,
    "whatExisted": string | null,
    "whyThisWasBuilt": string | null,
    "whatItReplaced": string | null
  },
  "versionInfo": {
    "currentVersion": string | null,
    "majorBreakingChanges": string[],
    "versionSpecificNotes": string[]
  }
}`;
}
```

---

## Contradiction Detection

After extracting from all sources, run a contradiction scan across the full corpus.

```typescript
export function contradictionScanPrompt(
  allClaims: ExtractedClaim[],
  topicName: string
): string {
  return `You are scanning a research corpus about ${topicName} for contradictions.

Here are all claims extracted from multiple sources:
${JSON.stringify(allClaims, null, 2)}

Find pairs of claims that directly contradict each other.
A contradiction is when two claims make incompatible statements about the same concept.
Not a contradiction: two claims that discuss different aspects of the same concept.
Not a contradiction: a newer source updating an older source (note the version difference instead).

Return JSON only, no other text:
{
  "contradictions": [
    {
      "claimA": string,
      "sourceAUrl": string,
      "sourceAName": string,
      "sourceATier": number,
      "claimB": string,
      "sourceBUrl": string,
      "sourceBName": string,
      "sourceBTier": number,
      "relatedConcept": string,
      "notes": string
    }
  ]
}`;
}
```

---

## Research Quality Assessment

After all fetching and extraction, assess the quality of what was gathered:

```typescript
export function researchQualityPrompt(
  knowledgeBase: Partial<TopicKnowledgeBase>,
  topicBrief: TopicBrief
): string {
  return `Assess the research quality for this Topic Knowledge Base.

TOPIC: ${topicBrief.topicName}
DEPTH REQUIRED: ${topicBrief.depthRequired}
CONCEPTS NEEDED: ${topicBrief.conceptOutline.map(c => c.concept).join(', ')}

WHAT WAS FOUND:
- Core concepts: ${knowledgeBase.coreConcepts?.length ?? 0}
- Architecture decisions: ${knowledgeBase.archDecisions?.length ?? 0}
- Limitations: ${knowledgeBase.limitations?.length ?? 0}
- Production examples: ${knowledgeBase.productionExamples?.length ?? 0}
- Code patterns: ${knowledgeBase.codePatterns?.length ?? 0}
- Interview patterns: ${knowledgeBase.interviewPatterns?.length ?? 0}
- Historical context: ${knowledgeBase.historicalContext ? 'present' : 'missing'}
- Sources fetched: ${knowledgeBase.sourcesInventory?.length ?? 0}
- Tier 1 sources: ${knowledgeBase.sourcesInventory?.filter(s => s.tier === 1).length ?? 0}

Return JSON only, no other text:
{
  "quality": "complete|partial|minimal",
  "missingCritical": string[],
  "recommendations": string[],
  "canProceed": boolean,
  "rationale": string
}`;
}
```

**Quality thresholds:**
- `complete`: Tier 1 source found, 5+ core concepts, 2+ production examples, historical context present
- `partial`: Tier 1 source found but some content areas thin. Proceed but note gaps.
- `minimal`: No Tier 1 source found or fewer than 3 core concepts. Flag to user. Still proceed.

---

## Complete Agent Implementation Structure

```typescript
// src/agents/cartographer.ts

import { reasoningLLM, fastLLM } from '../lib/groq';
import { fetchAndExtract, crawlDocs } from '../lib/firecrawl';
import { getTopicBrief } from '../db/knowledge-base';
import { createTopicKnowledgeBase } from '../db/knowledge-base';
import { createContradiction } from '../db/contradictions';
import { safeJsonParse } from '../utils/json';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import {
  extractionPrompt,
  contradictionScanPrompt,
  researchQualityPrompt,
  sourceDiscoveryPrompt,
} from '../prompts/cartographer.prompts';
import { LearningGraphState } from '../types/graph-state.types';

export async function runCartographerAgent(
  state: LearningGraphState
): Promise<Partial<LearningGraphState>> {
  logger.info('cartographer_node started', {
    userId: state.userId,
    topic: state.currentTopic,
  });

  try {
    // 1. Load topic brief from Architect
    const topicBrief = await getTopicBrief(state.userId, state.currentTopic);
    if (!topicBrief) throw new Error(`No topic brief found for ${state.currentTopic}`);

    const knowledgeBase: Partial<TopicKnowledgeBase> = {
      coreConcepts: [],
      archDecisions: [],
      limitations: [],
      productionExamples: [],
      codePatterns: [],
      interviewPatterns: [],
      contradictions: [],
      sourcesInventory: [],
    };

    // 2. Discover source URLs via LLM
    const sourceUrls = await discoverSources(state.currentTopic, topicBrief);

    // 3. Fetch and extract Tier 1 sources first
    const tier1Sources = sourceUrls.filter(s => s.tier === 1);
    for (const source of tier1Sources) {
      await fetchAndMerge(source, topicBrief, knowledgeBase);
    }

    // 4. Fetch and extract Tier 2 sources
    const tier2Sources = sourceUrls.filter(s => s.tier === 2);
    for (const source of tier2Sources) {
      await fetchAndMerge(source, topicBrief, knowledgeBase);
    }

    // 5. Fetch Tier 3 sources (engineering blogs) in parallel batches
    const tier3Sources = sourceUrls.filter(s => s.tier === 3);
    const tier3Batches = chunk(tier3Sources, 3);
    for (const batch of tier3Batches) {
      await Promise.all(batch.map(s => fetchAndMerge(s, topicBrief, knowledgeBase)));
    }

    // 6. Scan for contradictions across full corpus
    const allClaims = buildClaimsArray(knowledgeBase);
    if (allClaims.length > 1) {
      const contradictionRaw = await reasoningLLM([
        { role: 'user', content: contradictionScanPrompt(allClaims, state.currentTopic) }
      ], { jsonMode: true, maxTokens: 2000 });

      const { contradictions } = safeJsonParse<{ contradictions: ContradictionEntry[] }>(
        contradictionRaw,
        { contradictions: [] }
      );

      knowledgeBase.contradictions = contradictions;

      // Write each contradiction to queue
      for (const contradiction of contradictions) {
        await createContradiction({
          userId: state.userId,
          topicId: topicBrief.id,
          ...contradiction,
          status: 'pending',
          flaggedBy: 'cartographer_node',
        });
      }
    }

    // 7. Assess research quality
    const qualityRaw = await fastLLM([
      { role: 'user', content: researchQualityPrompt(knowledgeBase, topicBrief) }
    ], { jsonMode: true });

    const quality = safeJsonParse<ResearchQuality>(qualityRaw);
    knowledgeBase.researchQuality = quality.quality;

    // 8. Write Topic Knowledge Base to Supabase
    await createTopicKnowledgeBase({
      userId: state.userId,
      topicId: topicBrief.id,
      topicSlug: state.currentTopic,
      ...knowledgeBase,
      totalSourcesFetched: knowledgeBase.sourcesInventory?.length ?? 0,
      cartographerRanAt: new Date().toISOString(),
    });

    logger.info('cartographer_node completed', {
      userId: state.userId,
      topic: state.currentTopic,
      sourcesCount: knowledgeBase.sourcesInventory?.length,
      conceptsCount: knowledgeBase.coreConcepts?.length,
      contradictionsFound: knowledgeBase.contradictions?.length,
      quality: quality.quality,
    });

    return {};   // no state changes needed — Curriculum Builder reads from DB

  } catch (error) {
    logger.error('cartographer_node failed', { userId: state.userId, error });
    return {
      errors: [...(state.errors ?? []), `cartographer_node: ${String(error)}`],
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchAndMerge(
  source: SourceToFetch,
  topicBrief: TopicBrief,
  knowledgeBase: Partial<TopicKnowledgeBase>
): Promise<void> {
  try {
    const content = source.crawl
      ? await crawlDocs(source.url, { maxPages: 50, maxDepth: 3 })
      : await fetchAndExtract(source.url);

    if (!content || content.length < 100) {
      logger.warn('cartographer: empty content', { url: source.url });
      return;
    }

    const extractedRaw = await reasoningLLM([
      { role: 'user', content: extractionPrompt(content, source.name, source.tier, topicBrief.topicName, topicBrief) }
    ], { jsonMode: true, maxTokens: 4000 });

    const extracted = safeJsonParse<ExtractedKnowledge>(extractedRaw, {} as ExtractedKnowledge);

    // Merge into knowledge base
    knowledgeBase.coreConcepts!.push(...(extracted.coreConcepts ?? []));
    knowledgeBase.archDecisions!.push(...(extracted.archDecisions ?? []));
    knowledgeBase.limitations!.push(...(extracted.limitations ?? []));
    knowledgeBase.productionExamples!.push(...(extracted.productionExamples ?? []));
    knowledgeBase.codePatterns!.push(...(extracted.codePatterns ?? []));
    knowledgeBase.interviewPatterns!.push(...(extracted.interviewPatterns ?? []));

    // Historical context — merge, don't overwrite (first non-null wins per field)
    if (extracted.historicalContext && !knowledgeBase.historicalContext?.problemBefore) {
      knowledgeBase.historicalContext = extracted.historicalContext;
    }

    // Version info — higher tier source wins
    if (extracted.versionInfo?.currentVersion && source.tier <= (knowledgeBase.versionInfo ? 2 : 4)) {
      knowledgeBase.versionInfo = extracted.versionInfo;
    }

    // Record source
    knowledgeBase.sourcesInventory!.push({
      url: source.url,
      name: source.name,
      tier: source.tier,
      type: source.type,
      fetchedAt: new Date().toISOString(),
    });

    logger.debug('cartographer: source extracted', {
      url: source.url,
      tier: source.tier,
      conceptsFound: extracted.coreConcepts?.length ?? 0,
    });

  } catch (error) {
    // Never let a single source failure stop the research
    logger.warn('cartographer: source fetch failed', { url: source.url, error: String(error) });
    // Continue to next source
  }
}

async function discoverSources(
  topicSlug: string,
  topicBrief: TopicBrief
): Promise<SourceToFetch[]> {
  const raw = await reasoningLLM([
    { role: 'user', content: sourceDiscoveryPrompt(topicSlug, topicBrief) }
  ], { jsonMode: true, maxTokens: 2000 });

  const { sources } = safeJsonParse<{ sources: SourceToFetch[] }>(raw, { sources: [] });
  return sources;
}
```

---

## Source Discovery Prompt

```typescript
export function sourceDiscoveryPrompt(
  topicSlug: string,
  topicBrief: TopicBrief
): string {
  return `You are identifying the best sources for researching "${topicBrief.topicName}".

DEPTH REQUIRED: ${topicBrief.depthRequired}
VERSION CONTEXT: ${topicBrief.versionContext ?? 'latest stable'}
KEY SOURCES HINT FROM ARCHITECT: ${topicBrief.keySourcesHint?.join(', ') ?? 'none'}

Return a prioritised list of sources to fetch. Include:
- Official documentation URL (Tier 1) — set crawl: true
- Official GitHub repo URL (Tier 1) — set crawl: false
- Any arXiv papers that introduced or significantly influenced this topic (Tier 1)
- Core contributor blogs if known (Tier 2)
- Official changelog or engineering blog (Tier 2)
- 3-5 engineering blog posts from major tech companies (Tier 3)
- 2-3 high-quality Stack Overflow questions (Tier 3)

Return JSON only, no other text:
{
  "sources": [
    {
      "url": string,
      "name": string,
      "tier": 1 | 2 | 3 | 4,
      "type": "docs|paper|blog|github|community",
      "crawl": boolean,
      "rationale": string
    }
  ]
}

IMPORTANT:
- Only include URLs you are highly confident exist and are relevant
- Do not fabricate URLs — only include real, known sources
- Official docs and GitHub always come first
- Maximum 20 sources total`;
}
```

---

## Firecrawl Usage Patterns

```typescript
// src/lib/firecrawl.ts — patterns this agent uses

// Pattern 1 — Scrape a single page (most sources)
export async function fetchAndExtract(url: string): Promise<string> {
  const result = await firecrawl.scrapeUrl(url, {
    formats: ['markdown'],
  });
  return result.markdown ?? '';
}

// Pattern 2 — Crawl a documentation site (Tier 1 docs only)
export async function crawlDocs(
  url: string,
  options: { maxPages: number; maxDepth: number }
): Promise<string> {
  const result = await firecrawl.crawlUrl(url, {
    limit: options.maxPages,
    maxDepth: options.maxDepth,
    scrapeOptions: { formats: ['markdown'] },
  });

  // Concatenate all pages into single string
  return result.data
    .map(page => `\n\n## ${page.metadata?.title ?? page.url}\n\n${page.markdown}`)
    .join('\n');
}
```

**Firecrawl rate limiting:**
- Free tier: 500 credits/month
- Scrape = 1 credit per page
- Crawl = 1 credit per page crawled
- Max 5 concurrent requests
- Implement 500ms delay between non-concurrent requests

---

## Database Functions Required

These must exist in `src/db/` before coding this agent:

| Function | File | Notes |
|----------|------|-------|
| `getTopicBrief(userId, topicSlug)` | `knowledge-base.ts` | Reads from `topic_briefs` |
| `createTopicKnowledgeBase(data)` | `knowledge-base.ts` | Inserts into `topic_knowledge_base` |
| `createContradiction(data)` | `contradictions.ts` | Inserts into `contradiction_queue` |

---

## Prompts File Structure

All prompts live in `src/prompts/cartographer.prompts.ts`:

```typescript
export function sourceDiscoveryPrompt(topicSlug: string, topicBrief: TopicBrief): string { ... }
export function extractionPrompt(content, sourceName, sourceTier, topicName, topicBrief): string { ... }
export function contradictionScanPrompt(allClaims: ExtractedClaim[], topicName: string): string { ... }
export function researchQualityPrompt(kb: Partial<TopicKnowledgeBase>, brief: TopicBrief): string { ... }
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| Firecrawl fails on a URL | Log warning, skip source, continue. Never block on one source failure. |
| Official docs URL not found by LLM | Attempt common patterns: `docs.{topic}.com`, `{topic}.readthedocs.io`. If still not found, log and mark research quality as `partial`. |
| No arXiv papers found | Acceptable — not all tools have academic papers. Skip, do not error. |
| Extraction returns empty JSON | Log, skip this source's contribution, continue. |
| Zero sources fetchable | This is a hard error. Return error state. User will be notified. |
| Firecrawl credits exhausted | Fall back to direct `fetch()` + basic HTML stripping for remaining sources. Log that fallback was used. |
| Content too large for LLM context | Chunk content into 8000 char segments, extract from each, merge results. |
| Contradiction scan times out | Skip contradiction detection, mark contradictions as empty, log warning. Proceed. |

---

## Deduplication Logic

After merging from multiple sources, deduplicate before writing to database:

```typescript
function deduplicateConcepts(concepts: CoreConcept[]): CoreConcept[] {
  // Keep highest-tier version of duplicate concepts
  const seen = new Map<string, CoreConcept>();
  for (const concept of concepts) {
    const key = concept.concept.toLowerCase().replace(/\s+/g, '-');
    const existing = seen.get(key);
    if (!existing || concept.tier < existing.tier) {
      seen.set(key, concept);
    }
  }
  return Array.from(seen.values());
}

function deduplicateExamples(examples: ProductionExample[]): ProductionExample[] {
  // Deduplicate by company + scenario similarity
  const seen = new Set<string>();
  return examples.filter(ex => {
    const key = `${ex.company.toLowerCase()}-${ex.scenario.slice(0, 50).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

---

## Testing This Agent Locally

```bash
# Requires real Firecrawl and Groq API keys — cannot mock meaningfully
# Set MOCK_LLM=false

# Test with a simple topic first (fewer sources)
CURRENT_TOPIC="python-async" pnpm run dev:learning

# Test with full topic
CURRENT_TOPIC="langchain" pnpm run dev:learning
```

**Manual test checklist:**
- [ ] Source discovery returns at least one Tier 1 source
- [ ] Official docs URL is correctly identified for the topic
- [ ] Firecrawl successfully fetches at least one source
- [ ] Extraction produces valid JSON from at least 3 sources
- [ ] Core concepts array has at least 5 entries
- [ ] Production examples array has at least 1 entry (for mature tools)
- [ ] Historical context is populated
- [ ] `topic_knowledge_base` row created in Supabase
- [ ] Contradictions (if found) written to `contradiction_queue`
- [ ] Research quality is assessed and stored
- [ ] Agent returns without errors even if individual sources fail

---

## What This Agent Must NOT Do

- Must NOT teach anything. Zero teaching. That is Teaching Agent's job.
- Must NOT design the curriculum. That is Curriculum Builder's job.
- Must NOT resolve contradictions. Flag them and move on — Contradiction Agent resolves.
- Must NOT skip Tier 1 sources. If official docs cannot be fetched, this is a serious problem that must be logged prominently.
- Must NOT write to `curriculum_state` in any layer. No curriculum writes.
- Must NOT write to `user_profile`. No profile writes.
- Must NOT run again during the learning journey unless a new topic starts. That is the Scout's job.
- Must NOT fabricate sources. Only real, verified URLs go into `sourcesInventory`.
- Must NOT use Tier 4 sources as individual evidence for any claim. Tier 4 is aggregate signal only.
