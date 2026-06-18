# LRNR — Agent 06: Scout Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Current Implementation Override

Scout is Phase 3, not Phase 1.

This file contains older references to Telegram-formatted Layer 3 content. Current direction:

```text
Scout creates structured findings.
Layer 3 is rendered in the frontend lesson UI.
Telegram may alert/deep-link, but does not carry the full teaching content.
```

When this file says "pre-formatted for Telegram delivery," implement it as frontend-safe structured Layer 3 content plus optional notification summary.

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/scout.ts` |
| LangGraph node name | `scout_node` |
| Exported function | `runScoutAgent(state: ResearchGraphState): Promise<Partial<ResearchGraphState>>` |
| LLM model | `fastLLM()` — `llama-3.1-8b-instant` |
| Trigger | Daily Research Workflow at 2:00 AM IST via GitHub Actions |
| Runs in graph | Research Graph only |
| Position | Second node after `load_profile_node` — runs three parallel branches |
| Avg runtime | 5-8 minutes |

---

## What This Agent Does — Plain English

The Scout is the system's eyes on the world. While the Cartographer maps the full territory of a topic once and deeply, the Scout patrols the frontier every single day looking for what has changed, what has emerged, and what matters to what the user is currently learning.

The Scout runs three parallel branches simultaneously. The news branch watches AI news sources broadly — RSS feeds, Hacker News, Reddit, newsletters — and finds anything relevant to the user's interest profile. The topic watch branch monitors the specific tools and technologies the user is currently learning — their GitHub repos, their documentation changelogs, their maintainer discussions — and flags any significant updates or new issues. The paper watch branch monitors arXiv daily for new research papers in the AI domains the user cares about.

After all three branches complete, every finding goes through a routing decision. High priority findings — directly relevant to what the user is studying this week, from a credible source — go straight to Layer 3 so they appear in tomorrow morning's session. Medium priority findings — relevant to the topic but not this week's specific lesson — go to the agent update queue for Curriculum Builder to weave into an upcoming session. Low priority findings enrich the Topic Knowledge Base for future reference. Everything else gets dropped.

The Scout also does something important that goes beyond finding new things: it watches for signals that the Topic Knowledge Base is becoming outdated. If a major new version of a tool drops, if a core contributor announces a deprecation, if the community collectively pivots away from a pattern the user just learned — the Scout flags this. Not to panic the user, but to ensure the Teaching Agent knows the context has shifted.

The critical distinction from the Cartographer: the Scout never does deep research. It does not crawl documentation sites. It does not extract structured knowledge from articles. It reads headlines, abstracts, and summaries — enough to score relevance and route correctly — and passes the raw finding to the appropriate destination. Deep extraction happens at the destination if needed.

---

## Inputs

### From LangGraph State (Research Graph)
```typescript
{
  userId: string;
  currentTopic: string;
  profile: UserProfile;
}
```

### From Database
```typescript
// Current learning position — what specifically to watch for
const curriculumState = await getActiveCurriculumState(userId);
const todaySession = curriculumState.layer_2.find(s => s.status === 'pending');
const currentConcepts = todaySession?.conceptsToCover ?? [];

// Existing knowledge base — avoid surfacing things already known
const existingKB = await getTopicKnowledgeBase(userId, currentTopic);
const existingSourceUrls = existingKB.sourcesInventory.map(s => s.url);

// Recent news items — avoid duplicates
const recentNewsUrls = await getRecentNewsUrls(userId, { days: 7 });
```

---

## Outputs

### 1. High Priority Findings → `curriculum_state.layer_3`

```typescript
// Written directly to Layer 3 queue
await addToLayer3Queue(userId, {
  itemId: generateId(),
  type: 'scout_finding',          // or 'news_connection' if it connects to curriculum
  content: formattedContent,      // pre-formatted for Telegram delivery
  sourceAgent: 'scout_node',
  priority: 'high',
  expiresAt: addHours(new Date(), 48),
  consumedAt: null,
  sessionId: null,
});
```

### 2. Medium Priority Findings → `agent_update_queue`

```typescript
await addToQueue({
  userId,
  sourceAgent: 'scout_node',
  updateType: 'scout_finding',
  priority: 2,
  content: {
    finding: findingDescription,
    sourceUrl: url,
    tier: credibilityTier,
    relevanceToConcept: concept,
  },
  topicId: currentTopicId,
});
```

### 3. Low Priority Findings → `topic_knowledge_base`

```typescript
// Append to existing knowledge base — enrichment only
await appendToKnowledgeBase(userId, currentTopic, {
  type: 'scout_update',
  content: finding,
  sourceUrl: url,
  tier: credibilityTier,
  addedAt: new Date().toISOString(),
});
```

### 4. Contradictions Found → `contradiction_queue`

```typescript
await createContradiction({
  userId,
  topicId: currentTopicId,
  claimA, sourceAUrl, sourceAName, sourceATier,
  claimB, sourceBUrl, sourceBName, sourceBTier,
  relatedConcept,
  status: 'pending',
  flaggedBy: 'scout_node',
});
```

### 5. Research Graph State Update

```typescript
return {
  scoutResults: allFindings,
  contradictions: contradictionsFound,
  layer3Queue: highPriorityItems,
  layer2Queue: mediumPriorityItems,
};
```

---

## The Three Parallel Branches

### Branch 1 — News Fetch

**Purpose:** Pull from broad AI news sources. Score relevance against user's interest profile and current curriculum position.

**Sources to fetch:**

```typescript
const NEWS_SOURCES = [
  // RSS feeds
  { name: 'Anthropic Blog',     url: 'https://www.anthropic.com/rss.xml',              tier: 1 },
  { name: 'OpenAI Blog',        url: 'https://openai.com/blog/rss.xml',                tier: 1 },
  { name: 'Google DeepMind',    url: 'https://deepmind.google/blog/rss.xml',           tier: 1 },
  { name: 'Meta AI',            url: 'https://ai.meta.com/blog/rss/',                  tier: 1 },
  { name: 'Mistral AI',         url: 'https://mistral.ai/news/rss',                    tier: 1 },
  { name: 'Hugging Face Blog',  url: 'https://huggingface.co/blog/feed.xml',           tier: 1 },
  { name: 'Papers With Code',   url: 'https://paperswithcode.com/latest.rss',          tier: 2 },
  { name: 'The Batch',          url: 'https://www.deeplearning.ai/thebatch/feed/',     tier: 2 },
  { name: 'TLDR AI',            url: 'https://tldr.tech/ai/rss',                       tier: 2 },
  { name: 'Import AI',          url: 'https://importai.substack.com/feed',             tier: 2 },
  { name: 'Last Week in AI',    url: 'https://lastweekin.ai/feed',                     tier: 2 },
  { name: 'Ahead of AI',        url: 'https://magazine.sebastianraschka.com/feed',     tier: 2 },
];

// Hacker News — AI-filtered top stories
const HN_API = 'https://hacker-news.firebaseio.com/v0';

// Reddit — top posts of the day
const REDDIT_SOURCES = [
  'https://www.reddit.com/r/MachineLearning/top/.rss?t=day',
  'https://www.reddit.com/r/artificial/top/.rss?t=day',
  'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day',
];
```

**Fetch logic:**

```typescript
async function runNewsFetchBranch(
  profile: UserProfile,
  currentTopic: string,
  existingUrls: string[]
): Promise<RawFinding[]> {
  const findings: RawFinding[] = [];

  // RSS feeds — parse and filter last 24 hours
  for (const source of NEWS_SOURCES) {
    try {
      const feed = await parseFeed(source.url);
      const recentItems = feed.items.filter(item =>
        isWithinHours(item.pubDate, 24) &&
        !existingUrls.includes(item.link)
      );

      findings.push(...recentItems.map(item => ({
        title: item.title,
        url: item.link,
        summary: item.contentSnippet ?? '',
        sourceName: source.name,
        sourceTier: source.tier,
        publishedAt: item.pubDate,
        branch: 'news' as const,
      })));
    } catch (error) {
      logger.warn('scout: RSS feed failed', { source: source.name, error: String(error) });
    }
  }

  // Hacker News — top stories filtered by AI keywords
  const hnStories = await fetchHNTopStories(60);
  const aiKeywords = [
    'AI', 'LLM', 'GPT', 'Claude', 'Gemini', 'machine learning', 'neural',
    'agent', 'OpenAI', 'Anthropic', 'transformer', 'inference', 'fine-tun',
    'RAG', 'embedding', 'benchmark', 'reasoning', 'safety', 'alignment',
  ];

  const aiHNStories = hnStories.filter(story =>
    story.score >= 50 &&
    aiKeywords.some(kw => story.title.toLowerCase().includes(kw.toLowerCase())) &&
    !existingUrls.includes(story.url ?? '')
  );

  findings.push(...aiHNStories.map(story => ({
    title: story.title,
    url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
    summary: '',
    sourceName: `Hacker News (⬆${story.score})`,
    sourceTier: 3 as const,
    publishedAt: new Date(story.time * 1000).toISOString(),
    branch: 'news' as const,
  })));

  // Reddit
  for (const redditUrl of REDDIT_SOURCES) {
    try {
      const feed = await parseFeed(redditUrl, {
        headers: { 'User-Agent': 'LRNR-Scout/1.0' }
      });
      findings.push(...feed.items.slice(0, 8).map(item => ({
        title: item.title,
        url: item.link,
        summary: item.contentSnippet ?? '',
        sourceName: 'Reddit',
        sourceTier: 4 as const,
        publishedAt: item.pubDate,
        branch: 'news' as const,
      })));
    } catch (error) {
      logger.warn('scout: Reddit feed failed', { url: redditUrl, error: String(error) });
    }
  }

  return findings;
}
```

---

### Branch 2 — Topic Watch

**Purpose:** Monitor the specific tools and technologies the user is currently studying. Catch version updates, deprecations, significant bugs, and community pivots.

```typescript
async function runTopicWatchBranch(
  currentTopic: string,
  topicBrief: TopicBrief,
  existingUrls: string[]
): Promise<RawFinding[]> {
  const findings: RawFinding[] = [];

  // Get topic-specific sources from knowledge base
  const kb = await getTopicKnowledgeBase(undefined, currentTopic);
  const officialRepo = kb.sourcesInventory.find(s => s.type === 'github' && s.tier === 1);
  const officialDocs = kb.sourcesInventory.find(s => s.type === 'docs' && s.tier === 1);

  // Monitor GitHub releases
  if (officialRepo) {
    try {
      const repoPath = extractGithubPath(officialRepo.url);  // 'org/repo'
      const releases = await fetchGithubReleases(repoPath);
      const recentRelease = releases.find(r => isWithinHours(r.published_at, 48));

      if (recentRelease && !existingUrls.includes(recentRelease.html_url)) {
        findings.push({
          title: `${topicBrief.topicName} ${recentRelease.tag_name} released`,
          url: recentRelease.html_url,
          summary: recentRelease.body?.slice(0, 500) ?? '',
          sourceName: `${topicBrief.topicName} GitHub`,
          sourceTier: 1,
          publishedAt: recentRelease.published_at,
          branch: 'topic_watch',
          isVersionUpdate: true,
          versionTag: recentRelease.tag_name,
        });
      }
    } catch (error) {
      logger.warn('scout: GitHub releases fetch failed', { error: String(error) });
    }

    // Monitor high-activity issues (potential breaking bugs)
    try {
      const repoPath = extractGithubPath(officialRepo.url);
      const hotIssues = await fetchGithubIssues(repoPath, {
        state: 'open',
        labels: 'bug,breaking-change',
        sort: 'created',
        since: subtractHours(new Date(), 48).toISOString(),
      });

      for (const issue of hotIssues.slice(0, 3)) {
        if (!existingUrls.includes(issue.html_url)) {
          findings.push({
            title: `[Issue] ${issue.title}`,
            url: issue.html_url,
            summary: issue.body?.slice(0, 300) ?? '',
            sourceName: `${topicBrief.topicName} GitHub Issues`,
            sourceTier: 2,
            publishedAt: issue.created_at,
            branch: 'topic_watch',
            isIssue: true,
          });
        }
      }
    } catch (error) {
      logger.warn('scout: GitHub issues fetch failed', { error: String(error) });
    }
  }

  // Monitor docs changelog if available
  if (officialDocs) {
    const changelogUrls = [
      `${officialDocs.url}/changelog`,
      `${officialDocs.url}/release-notes`,
      `${officialDocs.url}/whats-new`,
    ];

    for (const changelogUrl of changelogUrls) {
      try {
        const content = await fetchPage(changelogUrl);
        if (content && hasRecentUpdate(content, 48)) {
          findings.push({
            title: `${topicBrief.topicName} documentation updated`,
            url: changelogUrl,
            summary: extractRecentChangelogEntry(content),
            sourceName: `${topicBrief.topicName} Docs`,
            sourceTier: 1,
            publishedAt: new Date().toISOString(),
            branch: 'topic_watch',
            isDocUpdate: true,
          });
          break;  // Only need one changelog finding
        }
      } catch {
        // Changelog URL doesn't exist — expected for many tools
      }
    }
  }

  return findings;
}
```

---

### Branch 3 — Paper Watch

**Purpose:** Monitor arXiv daily for new research papers relevant to the user's interest areas and current topic.

```typescript
const ARXIV_CATEGORIES = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.MA'];

async function runPaperWatchBranch(
  currentTopic: string,
  profile: UserProfile,
  existingUrls: string[]
): Promise<RawFinding[]> {
  const findings: RawFinding[] = [];

  for (const category of ARXIV_CATEGORIES) {
    try {
      const url = [
        'http://export.arxiv.org/api/query',
        `?search_query=cat:${category}`,
        '&sortBy=submittedDate',
        '&sortOrder=descending',
        '&max_results=15',
      ].join('');

      const response = await fetch(url);
      const text = await response.text();
      const feed = await parseFeed(text);

      const recentPapers = feed.items.filter(item =>
        isWithinHours(item.pubDate, 48) &&
        !existingUrls.includes(item.link)
      );

      findings.push(...recentPapers.map(item => ({
        title: item.title?.replace(/\n/g, ' ') ?? '',
        url: item.link,
        summary: item.contentSnippet?.slice(0, 600) ?? '',
        sourceName: `arXiv (${category})`,
        sourceTier: 1 as const,
        publishedAt: item.pubDate,
        branch: 'paper_watch' as const,
        isPaper: true,
      })));
    } catch (error) {
      logger.warn('scout: arXiv fetch failed', { category, error: String(error) });
    }
  }

  return findings;
}
```

---

## Relevance Scoring — The Routing Decision

After all three branches complete, every finding goes through relevance scoring. This is the most important logic in the Scout — bad routing wastes user attention or misses valuable signals.

```typescript
export function relevanceScoringPrompt(
  finding: RawFinding,
  profile: UserProfile,
  currentTopic: string,
  currentConcepts: string[],
  topicBrief: TopicBrief
): string {
  return `Score the relevance of this finding for a learner.

LEARNER CONTEXT:
- Currently studying: ${currentTopic}
- This week's concepts: ${currentConcepts.join(', ')}
- Interest areas: ${profile.interestAreas.join(', ')}
- Learning goal: ${topicBrief.whyLearning}

FINDING:
Title: ${finding.title}
Source: ${finding.sourceName} (Tier ${finding.sourceTier})
Summary: ${finding.summary.slice(0, 400)}
URL: ${finding.url}
Is version update: ${finding.isVersionUpdate ?? false}
Is paper: ${finding.isPaper ?? false}

Score on three dimensions (1-10 each):

RELEVANCE: How directly relevant is this to the learner's current topic and concepts?
10 = directly about what they're studying this week
7-9 = closely related to their topic
4-6 = loosely related to their interest area
1-3 = not really relevant

NOVELTY: How genuinely new is this information?
10 = breaking news, just published, not common knowledge yet
7-9 = recent and not widely discussed
4-6 = somewhat known but worth knowing
1-3 = old news or widely covered already

IMPACT: How significant is this for a practitioner?
10 = major breaking change or paradigm shift
7-9 = significant development worth knowing
4-6 = useful to know but not urgent
1-3 = minor or niche

Return JSON only, no other text:
{
  "relevance": <1-10>,
  "novelty": <1-10>,
  "impact": <1-10>,
  "compositeScore": <weighted average: relevance*0.5 + novelty*0.25 + impact*0.25>,
  "routing": "high|medium|low|drop",
  "routingReason": "<one sentence>",
  "curriculumConnection": <boolean>,
  "curriculumConnectionNote": "<which concept this connects to, or null>",
  "isContradiction": <boolean>,
  "contradictionNote": "<what it contradicts in the existing knowledge base, or null>"
}

ROUTING RULES:
- high: compositeScore >= 7.5 AND (curriculumConnection OR isVersionUpdate OR isPaper with relevance >= 8)
- medium: compositeScore >= 5.5 AND relevance >= 5
- low: compositeScore >= 3.5
- drop: compositeScore < 3.5 OR sourceTier === 4 AND compositeScore < 6`;
}
```

**Batch scoring — process findings efficiently:**

```typescript
async function scoreAllFindings(
  findings: RawFinding[],
  profile: UserProfile,
  currentTopic: string,
  currentConcepts: string[],
  topicBrief: TopicBrief
): Promise<ScoredFinding[]> {
  const scored: ScoredFinding[] = [];

  // Score in batches of 8 to respect rate limits
  const batches = chunk(findings, 8);

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async finding => {
        try {
          const raw = await fastLLM([
            { role: 'user', content: relevanceScoringPrompt(
                finding, profile, currentTopic, currentConcepts, topicBrief
              )
            },
          ], { jsonMode: true, maxTokens: 300, temperature: 0.2 });

          const scores = safeJsonParse<FindingScore>(raw);
          return { ...finding, ...scores };
        } catch {
          // Scoring failure — default to drop
          return { ...finding, routing: 'drop' as const, compositeScore: 0 };
        }
      })
    );

    scored.push(...results);
    await sleep(500);  // respect rate limits between batches
  }

  return scored;
}
```

---

## Content Formatting for Layer 3

High-priority findings need to be pre-formatted for direct Telegram delivery by the Teaching Agent:

```typescript
export function formatLayer3ContentPrompt(
  finding: ScoredFinding,
  curriculumConnectionNote: string,
  topicName: string
): string {
  return `Format this finding for delivery in a Telegram learning session.

FINDING:
Title: ${finding.title}
Source: ${finding.sourceName}
URL: ${finding.url}
Summary: ${finding.summary}
Curriculum connection: ${curriculumConnectionNote}

Write a SHORT, punchy Layer 3 injection (max 150 words) that:
1. States what happened in 1-2 sentences
2. Explains why it matters to someone studying ${topicName}
3. Ends with: "This connects to [specific concept] in your current study."

Use Telegram markdown. No JSON wrapper — return the formatted text directly.`;
}
```

---

## Deduplication Logic

Before routing, deduplicate across all three branches and against recent history:

```typescript
function deduplicateFindings(
  findings: ScoredFinding[],
  recentUrls: string[]
): ScoredFinding[] {
  const seenUrls = new Set<string>(recentUrls);
  const seenTitles = new Set<string>();

  return findings.filter(finding => {
    // URL dedup
    if (seenUrls.has(finding.url)) return false;
    seenUrls.add(finding.url);

    // Title similarity dedup (crude but effective)
    const titleKey = finding.title.toLowerCase().slice(0, 40);
    if (seenTitles.has(titleKey)) return false;
    seenTitles.add(titleKey);

    return true;
  });
}
```

---

## Complete Agent Implementation Structure

```typescript
// src/agents/scout.ts

import { fastLLM } from '../lib/groq';
import { parseFeed } from '../lib/feeds';
import { fetchPage } from '../lib/firecrawl';
import { getActiveCurriculumState, addToLayer3Queue } from '../db/curriculum';
import { getTopicKnowledgeBase, appendToKnowledgeBase } from '../db/knowledge-base';
import { addToQueue } from '../db/queue';
import { createContradiction } from '../db/contradictions';
import { getRecentNewsUrls } from '../db/news';
import { safeJsonParse } from '../utils/json';
import { logger } from '../utils/logger';
import { chunk, sleep, isWithinHours } from '../utils/helpers';
import { ResearchGraphState } from '../types/graph-state.types';

export async function runScoutAgent(
  state: ResearchGraphState
): Promise<Partial<ResearchGraphState>> {
  logger.info('scout_node started', { userId: state.userId, topic: state.currentTopic });

  try {
    // Load context
    const [curriculumState, existingKB, recentUrls, topicBrief] = await Promise.all([
      getActiveCurriculumState(state.userId),
      getTopicKnowledgeBase(state.userId, state.currentTopic),
      getRecentNewsUrls(state.userId, { days: 7 }),
      getTopicBrief(state.userId, state.currentTopic),
    ]);

    const todaySession = curriculumState.layer_2.find((s: Layer2Session) => s.status === 'pending');
    const currentConcepts = todaySession?.conceptsToCover ?? [];
    const existingUrls = [
      ...existingKB.sourcesInventory.map((s: SourceEntry) => s.url),
      ...recentUrls,
    ];

    // Run three branches in parallel
    const [newsFindings, topicFindings, paperFindings] = await Promise.all([
      runNewsFetchBranch(state.profile, state.currentTopic, existingUrls),
      runTopicWatchBranch(state.currentTopic, topicBrief, existingUrls),
      runPaperWatchBranch(state.currentTopic, state.profile, existingUrls),
    ]);

    const allFindings = [...newsFindings, ...topicFindings, ...paperFindings];
    logger.info('scout: branches complete', {
      news: newsFindings.length,
      topic: topicFindings.length,
      papers: paperFindings.length,
      total: allFindings.length,
    });

    // Deduplicate
    const deduplicated = deduplicateFindings(allFindings, existingUrls);

    // Score all findings
    const scored = await scoreAllFindings(
      deduplicated,
      state.profile,
      state.currentTopic,
      currentConcepts,
      topicBrief
    );

    // Separate by routing decision
    const highPriority  = scored.filter(f => f.routing === 'high');
    const mediumPriority = scored.filter(f => f.routing === 'medium');
    const lowPriority   = scored.filter(f => f.routing === 'low');
    const contradictions = scored.filter(f => f.isContradiction);

    logger.info('scout: routing decisions', {
      high: highPriority.length,
      medium: mediumPriority.length,
      low: lowPriority.length,
      contradictions: contradictions.length,
    });

    // Route high priority → Layer 3
    const layer3Items: Layer3Item[] = [];
    for (const finding of highPriority.slice(0, 2)) {  // max 2 Layer 3 items per day
      const content = await fastLLM([
        { role: 'user', content: formatLayer3ContentPrompt(
            finding,
            finding.curriculumConnectionNote ?? '',
            state.currentTopic
          )
        },
      ], { maxTokens: 300 });

      const item = await addToLayer3Queue(state.userId, {
        type: finding.curriculumConnection ? 'news_connection' : 'scout_finding',
        content,
        sourceAgent: 'scout_node',
        priority: 'high',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });

      layer3Items.push(item);
    }

    // Route medium priority → agent_update_queue
    const queueItems: AgentUpdateItem[] = [];
    for (const finding of mediumPriority.slice(0, 5)) {  // max 5 queue items per day
      const item = await addToQueue({
        userId: state.userId,
        sourceAgent: 'scout_node',
        updateType: 'scout_finding',
        priority: 2,
        content: {
          finding: finding.title,
          sourceUrl: finding.url,
          tier: finding.sourceTier,
          relevanceToConcept: finding.curriculumConnectionNote ?? state.currentTopic,
        },
        topicId: topicBrief.id,
      });
      queueItems.push(item);
    }

    // Route low priority → knowledge base enrichment
    for (const finding of lowPriority.slice(0, 5)) {
      await appendToKnowledgeBase(state.userId, state.currentTopic, {
        type: 'scout_update',
        title: finding.title,
        url: finding.url,
        summary: finding.summary,
        tier: finding.sourceTier,
        addedAt: new Date().toISOString(),
      });
    }

    // Route contradictions → contradiction queue
    for (const finding of contradictions) {
      if (finding.contradictionNote) {
        await createContradiction({
          userId: state.userId,
          topicId: topicBrief.id,
          claimA: finding.title,
          sourceAUrl: finding.url,
          sourceAName: finding.sourceName,
          sourceATier: finding.sourceTier,
          claimB: finding.contradictionNote,
          sourceBUrl: existingKB.sourcesInventory[0]?.url ?? '',
          sourceBName: 'Existing Knowledge Base',
          sourceBTier: 1,
          relatedConcept: finding.curriculumConnectionNote ?? state.currentTopic,
          status: 'pending',
          flaggedBy: 'scout_node',
        });
      }
    }

    logger.info('scout_node completed', { userId: state.userId });

    return {
      scoutResults: scored,
      layer3Queue: layer3Items,
      layer2Queue: queueItems,
      contradictions: contradictions,
    };

  } catch (error) {
    logger.error('scout_node failed', { userId: state.userId, error });
    return {
      errors: [...(state.errors ?? []), `scout_node: ${String(error)}`],
    };
  }
}
```

---

## Feed Parsing Helper

```typescript
// src/lib/feeds.ts

import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail'],
  },
});

export async function parseFeed(
  url: string,
  options: { headers?: Record<string, string> } = {}
): Promise<Parser.Output<Parser.Item>> {
  return parser.parseURL(url);
}
```

---

## GitHub API Helpers

```typescript
// Inside src/lib/firecrawl.ts or a new src/lib/github.ts

export async function fetchGithubReleases(repoPath: string): Promise<GithubRelease[]> {
  const response = await fetch(
    `https://api.github.com/repos/${repoPath}/releases?per_page=5`,
    { headers: { 'Accept': 'application/vnd.github.v3+json' } }
  );
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  return response.json();
}

export async function fetchGithubIssues(
  repoPath: string,
  params: Record<string, string>
): Promise<GithubIssue[]> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(
    `https://api.github.com/repos/${repoPath}/issues?${query}`,
    { headers: { 'Accept': 'application/vnd.github.v3+json' } }
  );
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  return response.json();
}

export function extractGithubPath(url: string): string {
  // 'https://github.com/langchain-ai/langchain' → 'langchain-ai/langchain'
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) throw new Error(`Cannot extract GitHub path from: ${url}`);
  return match[1].replace(/\.git$/, '');
}
```

---

## Database Functions Required

| Function | File | Notes |
|----------|------|-------|
| `getActiveCurriculumState(userId)` | `curriculum.ts` | Current position and Layer 2 sessions |
| `addToLayer3Queue(userId, item)` | `curriculum.ts` | Writes to Layer 3 |
| `getTopicKnowledgeBase(userId, topic)` | `knowledge-base.ts` | Existing sources to avoid duplication |
| `appendToKnowledgeBase(userId, topic, item)` | `knowledge-base.ts` | Low-priority enrichment |
| `getTopicBrief(userId, topic)` | `knowledge-base.ts` | Topic context for scoring |
| `addToQueue(item)` | `queue.ts` | Medium priority findings |
| `createContradiction(data)` | `contradictions.ts` | Flag contradictions |
| `getRecentNewsUrls(userId, options)` | `news.ts` | Last 7 days of URLs to avoid duplicates |

---

## Prompts File Structure

```typescript
// src/prompts/scout.prompts.ts
export function relevanceScoringPrompt(finding, profile, currentTopic, currentConcepts, topicBrief): string { ... }
export function formatLayer3ContentPrompt(finding, connectionNote, topicName): string { ... }
export function contradictionCheckPrompt(finding, existingClaims): string { ... }
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| RSS feed URL unreachable | Log warning, skip source, continue to next. Never block on one source. |
| GitHub API rate limited | Catch 403/429, log, skip GitHub branch for this run. |
| arXiv API down | Log warning, return empty findings for paper branch. |
| All branches return zero findings | Not an error — some days are quiet. Return empty state. |
| Scoring LLM fails for a batch | Default all findings in that batch to `drop`. Log. Continue. |
| Layer 3 already has 3+ items | Cap at 2 new items. Leave the rest in medium priority queue. |
| Firecrawl credits exhausted | Skip changelog monitoring. Use only RSS/API sources. Log prominently. |

---

## Testing This Agent Locally

```bash
# This agent runs in the Research Graph workflow
MOCK_LLM=false pnpm run dev:research
```

**Manual test checklist:**
- [ ] All three branches run in parallel (check timing in logs)
- [ ] At least one RSS source successfully parsed
- [ ] GitHub releases check runs without error
- [ ] arXiv at least one category returns results
- [ ] Scoring runs on all deduplicated findings
- [ ] Routing decisions match expected logic (high/medium/low/drop)
- [ ] High priority items written to Layer 3
- [ ] Medium priority items written to agent_update_queue
- [ ] Low priority items appended to knowledge base
- [ ] Contradictions written to contradiction_queue
- [ ] No duplicate URLs in any output

---

## What This Agent Must NOT Do

- Must NOT do deep content extraction. It reads titles, summaries, and abstracts only. Full extraction is Cartographer's job.
- Must NOT write to `curriculum_state.layer_1` or `layer_2`. It only writes to `layer_3`.
- Must NOT modify `user_profile`. No profile writes at all.
- Must NOT crawl documentation sites. That is Cartographer's job on topic start.
- Must NOT score Tier 4 sources with more than 6/10 relevance individually — aggregate signal only.
- Must NOT route more than 2 items to Layer 3 per day. User attention is finite.
- Must NOT try to resolve contradictions it finds. Flag to `contradiction_queue` and stop.
- Must NOT run the Learning Graph. It only populates state that the Learning Graph reads from.
- Must NOT block on any individual source failure. Always continue to the next source.
- Must NOT fabricate or infer content beyond what the source actually contains.
