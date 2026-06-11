# LRNR — Agent 08: News Intelligence Agent
> **Load alongside all 4 foundation files before coding this agent.**
> **Foundation files: 01_PROJECT_OVERVIEW.md, 02_ARCHITECTURE.md, 03_DATA_SCHEMA.md, 04_STACK_AND_CONVENTIONS.md**

---

## Agent Identity

| Property | Value |
|----------|-------|
| File to create | `src/agents/news-intelligence.ts` |
| LangGraph node name | `news_intelligence_node` |
| Exported function | `runNewsIntelligenceAgent(state: ResearchGraphState): Promise<Partial<ResearchGraphState>>` |
| LLM model | `fastLLM()` for scoring — `reasoningLLM()` for digest writing |
| Trigger | Daily Research Workflow at 2:00 AM IST — runs in parallel with Scout |
| Runs in graph | Research Graph only |
| Position | Third node — runs in parallel with `scout_node` after `load_profile_node` |
| Avg runtime | 4-6 minutes |

---

## What This Agent Does — Plain English

The News Intelligence Agent is the user's daily briefing on what is happening in the world of AI — not as a passive reader but as a strategic advisor. Every morning before the learning session begins, the user receives a curated digest of 5-8 AI developments scored against their specific interest profile, ranked by what actually matters, and connected to what they are currently learning whenever a connection exists.

The distinction from a newsletter is everything. A newsletter treats every subscriber identically. This agent knows the user is currently on Day 6 of LangChain, has a working understanding of chains and agents, is weak on memory management, and is ultimately building toward production Agentic AI systems. A LangChain memory update lands completely differently for this user than it does for someone who has never heard of LangChain. The News Intelligence Agent surfaces that connection explicitly — not just "here is a LangChain update" but "here is a LangChain update that directly affects the memory management concepts you are studying this week."

The agent also makes the strategic advisor judgment that most news systems avoid: should the user invest time in this or not? When a new tool drops, the agent does not just describe it. It tells the user whether this is worth learning now, whether it is likely to become important, whether it replaces something they already know, and what the opportunity cost is of spending time on it. This judgment is grounded in the user's profile, their current stack, their goals, and what the community signal looks like.

The News Intelligence Agent runs at the same time as the Scout but serves a different purpose. The Scout watches for things relevant to the current topic and feeds the curriculum. The News Intelligence Agent watches the full AI landscape for things relevant to the user's broader interests and feeds their awareness. The Scout feeds learning. The News Intelligence Agent feeds intelligence.

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
// Full profile — interest areas, current topic, learning position
const profile = await getProfile(userId);

// Current curriculum state — for connection detection
const curriculumState = await getActiveCurriculumState(userId);
const currentConcepts = curriculumState.layer_2
  .find((s: Layer2Session) => s.status === 'pending')
  ?.conceptsToCover ?? [];

// Recent news items — for deduplication
const recentNewsUrls = await getRecentNewsUrls(userId, { days: 3 });

// Topic brief — for context on what the user is learning
const topicBrief = await getTopicBrief(userId, currentTopic);
```

---

## Outputs

### 1. News Items → `news_items` table

```typescript
// One record per item included in today's digest
await createNewsItem({
  userId,
  title, url, sourceName, sourceTier, publishedAt, rawSummary,
  headlineRewrite, tldr, explainer, soWhat, category, itemEmoji,
  relevanceScore, noveltyScore, impactScore, compositeScore,
  curriculumConnected, connectionNote, connectionConcept,
  includedInDigest: true,
  deliveredAt: new Date().toISOString(),
  digestDate: today,
});
```

### 2. Connected Items → `curriculum_state.layer_3`

```typescript
// High-relevance items that connect to current learning → Layer 3
// So Teaching Agent can reference them in tomorrow's session
await addToLayer3Queue(userId, {
  type: 'news_connection',
  content: formattedConnectionContent,
  sourceAgent: 'news_intelligence_node',
  priority: 'medium',                    // news connections are medium, not high
  expiresAt: addHours(new Date(), 48),
  consumedAt: null,
  sessionId: null,
});
```

### 3. Telegram Digest Messages

Delivered directly to Telegram via Telegraf. Multiple sequential messages — one header + one per digest item + one footer.

---

## Sources Configuration

Same sources as Scout Branch 1 — shared source list to avoid double-fetching. In the Research Graph, Scout and News Intelligence run in parallel — they should not both independently fetch the same RSS feeds.

**Architecture decision:** News Intelligence receives Scout's raw news findings via shared ResearchGraphState. It does NOT re-fetch sources. It scores and processes what Scout Branch 1 already fetched.

```typescript
// In Research Graph — Scout runs first, passes findings to News Intelligence
// research-graph.ts:
// 1. scout_node runs (including news_fetch branch)
// 2. news_intelligence_node receives state.scoutResults
// 3. news_intelligence_node filters to news branch results and processes them

const newsBranchFindings = state.scoutResults.filter(f => f.branch === 'news');
```

If Scout has not run yet or its results are empty — News Intelligence falls back to fetching its own sources.

---

## The Four Interest Areas — Scoring Profile

```typescript
const INTEREST_PROFILE = {
  llm_research: {
    label: 'LLM Research & Papers',
    keywords: [
      'transformer', 'attention', 'fine-tuning', 'RLHF', 'alignment',
      'benchmark', 'reasoning', 'chain-of-thought', 'multimodal',
      'scaling', 'architecture', 'pre-training', 'inference', 'quantisation',
      'context window', 'RAG', 'embedding', 'vector', 'retrieval',
    ],
    sourceBoost: ['arXiv', 'Papers With Code', 'Anthropic Blog', 'OpenAI Blog', 'Google DeepMind'],
  },
  ai_tools: {
    label: 'AI Tools & Products',
    keywords: [
      'release', 'launch', 'API', 'model', 'SDK', 'open source',
      'open-weight', 'Hugging Face', 'Ollama', 'LM Studio', 'Groq',
      'available', 'update', 'version', 'pricing', 'free tier',
    ],
    sourceBoost: ['Hugging Face Blog', 'The Batch', 'TLDR AI'],
  },
  agents_automation: {
    label: 'Agents & Automation',
    keywords: [
      'agent', 'agentic', 'autonomous', 'LangChain', 'LangGraph', 'CrewAI',
      'AutoGen', 'tool use', 'function calling', 'workflow', 'orchestration',
      'memory', 'planning', 'multi-agent', 'MCP', 'computer use',
    ],
    sourceBoost: ['Import AI', 'Last Week in AI', 'Ahead of AI'],
  },
  ai_safety: {
    label: 'AI Safety & Policy',
    keywords: [
      'safety', 'alignment', 'guardrails', 'evaluation', 'red teaming',
      'regulation', 'policy', 'governance', 'bias', 'fairness', 'ethics',
      'interpretability', 'explainability', 'risk', 'misuse', 'harm',
    ],
    sourceBoost: ['Anthropic Blog'],
  },
};
```

---

## Scoring Logic

```typescript
export function newsScoringPrompt(
  item: RawFinding,
  profile: UserProfile,
  currentTopic: string,
  currentConcepts: string[],
  topicBrief: TopicBrief
): string {
  const userInterests = profile.interestAreas
    .map(area => INTEREST_PROFILE[area as keyof typeof INTEREST_PROFILE])
    .filter(Boolean);

  const relevantKeywords = userInterests.flatMap(i => i.keywords);

  return `Score this AI news item for a specific learner.

LEARNER PROFILE:
Interest areas: ${profile.interestAreas.join(', ')}
Currently studying: ${currentTopic} — specifically: ${currentConcepts.join(', ')}
Learning goal: ${topicBrief.whyLearning}

INTEREST KEYWORDS (higher score if item matches these):
${relevantKeywords.slice(0, 30).join(', ')}

NEWS ITEM:
Title: ${item.title}
Source: ${item.sourceName} (Tier ${item.sourceTier})
Summary: ${item.summary.slice(0, 500)}
URL: ${item.url}

Score on three dimensions (1-10):

RELEVANCE (1-10): How relevant is this to the learner's interests and current study?
10 = directly about what they're studying AND a major development
7-9 = closely related to their interest areas
4-6 = loosely in their domain
1-3 = not relevant to their profile

NOVELTY (1-10): How genuinely new and non-obvious is this?
10 = breaking news, just happened, not yet widely known
7-9 = recent and worth knowing about
4-6 = somewhat known
1-3 = widely covered or old news

IMPACT (1-10): How significant is this for an AI practitioner?
10 = changes how practitioners should work immediately
7-9 = important development to be aware of
4-6 = useful context
1-3 = minor or niche

Return JSON only, no other text:
{
  "relevance": <1-10>,
  "novelty": <1-10>,
  "impact": <1-10>,
  "compositeScore": <relevance*0.5 + novelty*0.25 + impact*0.25>,
  "category": "llm_research|ai_tools|agents_automation|ai_safety|industry_news",
  "keep": <true if compositeScore >= 5.0>,
  "curriculumConnected": <boolean — true if this connects to current study>,
  "connectionConcept": "<which specific concept it connects to, or null>",
  "connectionNote": "<one sentence on the connection, or null>",
  "shouldInvestTime": "yes|no|wait",
  "shouldInvestTimeReason": "<one sentence>"
}`;
}
```

---

## Digest Item Generation

For each kept item, generate the full digest content:

```typescript
export function digestItemPrompt(
  item: ScoredNewsItem,
  profile: UserProfile,
  currentTopic: string
): string {
  return `Write a digest entry for this AI news item. This will be delivered via Telegram.

ITEM:
Title: ${item.title}
Source: ${item.sourceName}
URL: ${item.url}
Summary: ${item.summary.slice(0, 600)}
Category: ${item.category}
Curriculum connected: ${item.curriculumConnected}
Connection note: ${item.connectionNote ?? 'none'}
Should invest time: ${item.shouldInvestTime}
Should invest time reason: ${item.shouldInvestTimeReason}

USER CONTEXT:
Currently studying: ${currentTopic}
Goal: ${profile.interestAreas.join(', ')}

Write each field exactly as specified. All text is for Telegram.

Return JSON only, no other text:
{
  "headlineRewrite": "<punchy rewrite, max 12 words, sentence case, present tense>",
  "tldr": "<one sentence: what happened + the core significance>",
  "explainer": "<2-3 sentences: what this actually is, with enough technical depth to be useful>",
  "soWhat": "<one sentence: what this means for an AI practitioner right now>",
  "investmentVerdict": "<one sentence starting with 'Worth your time:' or 'Can wait:' or 'Watch this space:'>",
  "itemEmoji": "<single most fitting emoji>"
}

RULES:
- headlineRewrite: must be genuinely different from the original title — punchier, more specific
- tldr: no jargon unless unavoidable. One idea only.
- explainer: technical but accessible. What, why, how — not just what.
- soWhat: starts with an action signal if possible ("If you use X...", "When you build Y...")
- investmentVerdict: honest. Not everything is worth learning. Say so when it isn't.
- itemEmoji: one character only`;
}
```

---

## Digest Formatting for Telegram

### Header Message

```typescript
function formatDigestHeader(
  itemCount: number,
  date: string,
  topicName: string
): string {
  return [
    `🧠 *AI Daily Digest*`,
    `_${date}_`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${itemCount} things worth knowing today`,
    ``,
    `_You're on Day ${curriculumPosition} of ${topicName} — ` +
    `items connected to your study are marked_ 🔗`,
  ].join('\n');
}
```

### Per-Item Message

```typescript
function formatDigestItem(
  item: ProcessedNewsItem,
  index: number
): string {
  const categoryLabel: Record<string, string> = {
    llm_research:       '🔬 LLM Research',
    ai_tools:           '🛠 AI Tools',
    agents_automation:  '🤖 Agents',
    ai_safety:          '🛡 Safety',
    industry_news:      '📰 Industry',
  };

  const connectionBadge = item.curriculumConnected ? ' 🔗' : '';
  const lines = [
    `${item.itemEmoji} *${index}. ${escapeMarkdown(item.headlineRewrite)}*${connectionBadge}`,
    `${categoryLabel[item.category] ?? '📌'} · _${escapeMarkdown(item.sourceName)}_`,
    ``,
    `*TL;DR:* ${escapeMarkdown(item.tldr)}`,
    ``,
    escapeMarkdown(item.explainer),
    ``,
    `💡 ${escapeMarkdown(item.soWhat)}`,
    ``,
    `⏱ ${escapeMarkdown(item.investmentVerdict)}`,
  ];

  // Add curriculum connection note if present
  if (item.curriculumConnected && item.connectionNote) {
    lines.push(``, `🔗 _${escapeMarkdown(item.connectionNote)}_`);
  }

  lines.push(``, `[Read →](${item.url})`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  return lines.join('\n');
}
```

### Footer Message

```typescript
function formatDigestFooter(
  items: ProcessedNewsItem[],
  digestDate: string
): string {
  const connectedItems = items.filter(i => i.curriculumConnected);
  const topCategories = getMostFrequentCategories(items, 2);

  const lines = [
    `📚 *Today's coverage:* ${topCategories.join(' · ')}`,
  ];

  if (connectedItems.length > 0) {
    lines.push(
      ``,
      `🔗 *${connectedItems.length} item${connectedItems.length > 1 ? 's' : ''} connect${connectedItems.length === 1 ? 's' : ''} to your ${currentTopic} study.*`,
      `These will appear in your learning session if relevant.`,
    );
  }

  lines.push(
    ``,
    `_Digest for ${digestDate} · Powered by LRNR_`,
  );

  return lines.join('\n');
}
```

---

## Complete Agent Implementation Structure

```typescript
// src/agents/news-intelligence.ts

import { fastLLM, reasoningLLM } from '../lib/groq';
import { getProfile } from '../db/profile';
import { getActiveCurriculumState, addToLayer3Queue } from '../db/curriculum';
import { getTopicBrief } from '../db/knowledge-base';
import { createNewsItem, getRecentNewsUrls } from '../db/news';
import { sendTelegramMessage } from '../lib/telegram';
import { safeJsonParse } from '../utils/json';
import { logger } from '../utils/logger';
import { chunk, sleep } from '../utils/helpers';
import {
  newsScoringPrompt,
  digestItemPrompt,
} from '../prompts/news-intelligence.prompts';
import { ResearchGraphState } from '../types/graph-state.types';

export async function runNewsIntelligenceAgent(
  state: ResearchGraphState
): Promise<Partial<ResearchGraphState>> {
  logger.info('news_intelligence_node started', { userId: state.userId });

  try {
    // Load context
    const [profile, curriculumState, topicBrief, recentUrls] = await Promise.all([
      getProfile(state.userId),
      getActiveCurriculumState(state.userId),
      getTopicBrief(state.userId, state.currentTopic),
      getRecentNewsUrls(state.userId, { days: 3 }),
    ]);

    const currentConcepts = (curriculumState.layer_2 as Layer2Session[])
      .find(s => s.status === 'pending')?.conceptsToCover ?? [];

    // Get news findings from Scout results or fetch independently
    let newsFindings: RawFinding[] = state.scoutResults?.filter(f => f.branch === 'news') ?? [];

    if (newsFindings.length === 0) {
      logger.warn('news_intelligence: no Scout results, fetching independently');
      newsFindings = await fetchNewsIndependently(recentUrls);
    }

    // Deduplicate against recent history
    const freshFindings = newsFindings.filter(f => !recentUrls.includes(f.url));

    logger.info('news_intelligence: scoring items', { count: freshFindings.length });

    // Score all items in batches
    const scored: ScoredNewsItem[] = [];
    const batches = chunk(freshFindings, 10);

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async item => {
          try {
            const raw = await fastLLM([
              {
                role: 'user',
                content: newsScoringPrompt(
                  item, profile!, state.currentTopic, currentConcepts, topicBrief
                ),
              },
            ], { jsonMode: true, maxTokens: 300, temperature: 0.2 });

            const scores = safeJsonParse<NewsItemScore>(raw);
            return { ...item, ...scores };
          } catch {
            return { ...item, keep: false, compositeScore: 0 };
          }
        })
      );
      scored.push(...results);
      await sleep(500);
    }

    // Filter kept items and sort by composite score
    const kept = scored
      .filter(item => item.keep)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 8);   // max 8 items in digest

    logger.info('news_intelligence: items selected', {
      total: scored.length,
      kept: kept.length,
    });

    if (kept.length === 0) {
      logger.info('news_intelligence: no items to digest today');
      return {};
    }

    // Generate digest content for each item
    const digestItems: ProcessedNewsItem[] = [];

    for (const item of kept) {
      try {
        const contentRaw = await reasoningLLM([
          {
            role: 'user',
            content: digestItemPrompt(item, profile!, state.currentTopic),
          },
        ], { jsonMode: true, maxTokens: 500, temperature: 0.6 });

        const content = safeJsonParse<DigestItemContent>(contentRaw);
        digestItems.push({ ...item, ...content });
      } catch (error) {
        // Fallback — use raw data if generation fails
        digestItems.push({
          ...item,
          headlineRewrite: item.title.slice(0, 80),
          tldr: item.summary.slice(0, 150),
          explainer: item.summary.slice(0, 300),
          soWhat: 'Worth following up on.',
          investmentVerdict: 'Watch this space.',
          itemEmoji: '📌',
        });
      }
    }

    // Deliver digest to Telegram
    const today = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
    });

    // Header
    await sendTelegramMessage(
      state.userId,
      formatDigestHeader(digestItems.length, today, state.currentTopic)
    );
    await sleep(600);

    // Items
    for (let i = 0; i < digestItems.length; i++) {
      const message = formatDigestItem(digestItems[i], i + 1);
      await sendTelegramMessage(state.userId, message);
      await sleep(700);
    }

    // Footer
    await sendTelegramMessage(
      state.userId,
      formatDigestFooter(digestItems, today)
    );

    // Persist all digest items to database
    for (const item of digestItems) {
      await createNewsItem({
        userId: state.userId,
        ...item,
        includedInDigest: true,
        deliveredAt: new Date().toISOString(),
        digestDate: new Date().toISOString().split('T')[0],
      });
    }

    // Route curriculum-connected items to Layer 3
    const connectedItems = digestItems.filter(i => i.curriculumConnected);
    for (const item of connectedItems.slice(0, 1)) {  // max 1 news connection to Layer 3
      const content = [
        `📰 *Relevant news from this morning's digest:*`,
        ``,
        `*${escapeMarkdown(item.headlineRewrite)}*`,
        ``,
        escapeMarkdown(item.connectionNote ?? item.tldr),
        ``,
        `[Full article →](${item.url})`,
      ].join('\n');

      await addToLayer3Queue(state.userId, {
        type: 'news_connection',
        content,
        sourceAgent: 'news_intelligence_node',
        priority: 'medium',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        consumedAt: null,
        sessionId: null,
      });
    }

    logger.info('news_intelligence_node completed', {
      userId: state.userId,
      itemsDelivered: digestItems.length,
      connectedToLearning: connectedItems.length,
    });

    return {};

  } catch (error) {
    logger.error('news_intelligence_node failed', { userId: state.userId, error });
    return {
      errors: [...(state.errors ?? []), `news_intelligence_node: ${String(error)}`],
    };
  }
}
```

---

## Independent Fetch Fallback

When Scout results are unavailable:

```typescript
async function fetchNewsIndependently(existingUrls: string[]): Promise<RawFinding[]> {
  const findings: RawFinding[] = [];

  for (const source of NEWS_SOURCES) {
    try {
      const feed = await parseFeed(source.url);
      const recent = feed.items.filter(item =>
        isWithinHours(item.pubDate, 24) &&
        !existingUrls.includes(item.link)
      );
      findings.push(...recent.map(item => ({
        title: item.title ?? '',
        url: item.link ?? '',
        summary: item.contentSnippet ?? '',
        sourceName: source.name,
        sourceTier: source.tier,
        publishedAt: item.pubDate ?? '',
        branch: 'news' as const,
      })));
    } catch (error) {
      logger.warn('news_intelligence: fallback fetch failed', {
        source: source.name,
        error: String(error),
      });
    }
  }

  return findings;
}
```

---

## Markdown Escaping for Telegram

```typescript
function escapeMarkdown(text: string): string {
  if (!text) return '';
  // Escape characters that break Telegram Markdown
  return text
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`');
}

function getMostFrequentCategories(
  items: ProcessedNewsItem[],
  count: number
): string[] {
  const freq: Record<string, number> = {};
  for (const item of items) {
    freq[item.category] = (freq[item.category] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([cat]) => {
      const labels: Record<string, string> = {
        llm_research: 'LLM Research',
        ai_tools: 'AI Tools',
        agents_automation: 'Agents',
        ai_safety: 'Safety',
        industry_news: 'Industry',
      };
      return labels[cat] ?? cat;
    });
}
```

---

## Database Functions Required

| Function | File | Notes |
|----------|------|-------|
| `getProfile(userId)` | `profile.ts` | Full profile for interest areas |
| `getActiveCurriculumState(userId)` | `curriculum.ts` | Current position for connection detection |
| `getTopicBrief(userId, topic)` | `knowledge-base.ts` | Goal context for scoring |
| `createNewsItem(data)` | `news.ts` | Persist each digest item |
| `getRecentNewsUrls(userId, options)` | `news.ts` | Deduplication — last 3 days |
| `addToLayer3Queue(userId, item)` | `curriculum.ts` | Route connected items |

---

## Prompts File Structure

```typescript
// src/prompts/news-intelligence.prompts.ts
export function newsScoringPrompt(item, profile, currentTopic, currentConcepts, topicBrief): string { ... }
export function digestItemPrompt(item, profile, currentTopic): string { ... }
export function investmentVerdictPrompt(item, profile): string { ... }
```

---

## Error Scenarios and Handling

| Scenario | Handling |
|----------|----------|
| Scout results empty | Fetch independently from NEWS_SOURCES. Log that fallback was used. |
| All items score below 5.0 | Send a minimal digest: "Quiet day in AI news — nothing significant enough to surface." Do not send empty message. |
| Digest item generation fails for one item | Use fallback template with raw title and summary. Never skip an item because generation failed. |
| Telegram delivery fails mid-digest | Log the failure. Do not retry the full digest — partial delivery is better than no delivery or duplicate delivery. Mark delivered items in DB. |
| More than 8 items score above threshold | Cap at 8. Take the top 8 by composite score. Do not include more regardless of scores. |
| All items are about the same topic | Still deliver all — variety is preferred but not required. |
| No curriculum connection detected | Deliver digest without connection notes. This is normal — connections are a bonus, not required. |
| User has changed interest areas since last run | Profile is always read fresh — scoring always uses current interest areas. No caching. |

---

## Testing This Agent Locally

```bash
# Run as part of the Research Graph
MOCK_LLM=false pnpm run dev:research
```

**Manual test checklist:**
- [ ] Scoring produces valid scores for at least 5 items
- [ ] Items with `keep: false` are excluded from digest
- [ ] Items sorted by composite score (highest first)
- [ ] Maximum 8 items in final digest
- [ ] Header message formatted correctly with date and topic
- [ ] Per-item messages include all required fields
- [ ] Curriculum connection badge (🔗) appears on connected items
- [ ] Investment verdict present on every item
- [ ] Footer message shows category breakdown
- [ ] All items persisted to `news_items` table
- [ ] Connected items added to Layer 3 queue (max 1)
- [ ] 600-700ms delay between Telegram messages

---

## What This Agent Must NOT Do

- Must NOT fetch and score more than 100 raw items — processing cost outweighs benefit beyond this.
- Must NOT deliver more than 8 items — digest fatigue destroys the habit of reading it.
- Must NOT fabricate content beyond what the source summary contains.
- Must NOT claim an item "connects to your learning" without a specific, named concept connection.
- Must NOT write to `curriculum_state.layer_1` or `layer_2`. News connections only go to Layer 3.
- Must NOT write to `user_profile`. No profile writes.
- Must NOT re-deliver an item that was delivered in the last 3 days. Always check recent URLs.
- Must NOT add more than 1 news item to Layer 3 per day. Teaching Agent cannot handle more.
- Must NOT use Tier 4 sources for the investment verdict judgment — community opinion alone is insufficient to tell a user to invest their time.
- Must NOT skip delivery if item count is lower than expected. 2 items is a valid digest. 0 items gets a "quiet day" message.
- Must NOT cache the user profile between runs. Always read fresh from database.
