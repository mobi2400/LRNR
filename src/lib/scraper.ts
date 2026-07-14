import pLimit from 'p-limit';
import pRetry from 'p-retry';

import {
  failedSourceSchema,
  fetchedSourceSchema,
  type FailedSource,
  type FetchedSource,
  type SourceCandidate,
} from '@/schemas/knowledge.schema';

export interface FetchSourcesOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export interface SourceFetchResult {
  fetched: FetchedSource[];
  failed: FailedSource[];
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/plain,text/markdown,text/html,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}.`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractRelevantSections(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((section) => section.trim().replace(/\s+/g, ' '))
    .filter((section) => section.length >= 40)
    .slice(0, 6);
}

async function fetchSource(
  candidate: SourceCandidate,
  options: Required<FetchSourcesOptions>,
): Promise<FetchedSource> {
  const content =
    candidate.seedText ??
    (await pRetry(
      () => fetchWithTimeout(options.fetchImpl, candidate.url, options.timeoutMs),
      {
        retries: options.retries,
      },
    ));

  return fetchedSourceSchema.parse({
    ...candidate,
    retrievedAt: new Date().toISOString(),
    content,
    relevantSections: extractRelevantSections(content),
  });
}

/**
 * Bounded source fetching keeps Cartographer resilient: individual weak or
 * failed sources become provenance metadata instead of crashing research.
 */
export async function fetchSources(
  candidates: SourceCandidate[],
  options: FetchSourcesOptions = {},
): Promise<SourceFetchResult> {
  const resolvedOptions: Required<FetchSourcesOptions> = {
    concurrency: options.concurrency ?? 3,
    timeoutMs: options.timeoutMs ?? 5000,
    retries: options.retries ?? 1,
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const limit = pLimit(resolvedOptions.concurrency);
  const settled = await Promise.allSettled(
    candidates.map((candidate) =>
      limit(() => fetchSource(candidate, resolvedOptions)),
    ),
  );
  const fetched: FetchedSource[] = [];
  const failed: FailedSource[] = [];

  settled.forEach((result, index) => {
    const candidate = candidates[index];

    if (candidate === undefined) {
      return;
    }

    if (result.status === 'fulfilled') {
      fetched.push(result.value);
      return;
    }

    failed.push(
      failedSourceSchema.parse({
        ...candidate,
        failedAt: new Date().toISOString(),
        errorMessage:
          result.reason instanceof Error
            ? result.reason.message
            : 'Unknown source fetch failure.',
      }),
    );
  });

  return {
    fetched,
    failed,
  };
}
