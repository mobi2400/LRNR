import { describe, expect, it } from 'vitest';

import { fetchSources } from '@/lib/scraper';
import type { SourceCandidate } from '@/schemas/knowledge.schema';

describe('source fetch wrapper', () => {
  it('keeps successful sources while recording failed optional sources', async () => {
    const candidates: SourceCandidate[] = [
      {
        name: 'Seed source',
        url: 'lrnr://seed',
        sourceType: 'topic_brief',
        credibilityTier: 'tier_1',
        isCritical: true,
        seedText:
          'This is a meaningful internal source with enough content to support extraction.',
      },
      {
        name: 'External source',
        url: 'https://example.com/fail',
        sourceType: 'tutorial',
        credibilityTier: 'tier_3',
        isCritical: false,
      },
    ];
    const fetchImpl = async () => {
      throw new Error('Network disabled in test');
    };

    const result = await fetchSources(candidates, {
      fetchImpl: fetchImpl as typeof fetch,
      retries: 0,
      timeoutMs: 25,
    });

    expect(result.fetched).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.isCritical).toBe(false);
  });
});
