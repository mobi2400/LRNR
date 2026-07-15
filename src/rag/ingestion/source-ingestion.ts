import { isIP } from 'node:net';

import { z } from 'zod';

import {
  chunkSourceText,
  detectPromptInjectionSignals,
  hashNormalizedSource,
  normalizeSourceText,
  sourceContentKindSchema,
  type SourceChunkDraft,
} from './chunking';

const maxBytes = 1_500_000;
const redirectLimit = 3;
const supportedContentTypes = ['text/html', 'text/plain', 'text/markdown', 'application/xhtml+xml'];
const blockedHostnames = new Set(['localhost', 'metadata.google.internal']);
const metadataServiceIps = new Set(['169.254.169.254']);

export const sourceIngestionInputSchema = z.object({
  userId: z.string().uuid(),
  topicSlug: z.string().trim().min(1).max(255).nullable().optional(),
  sourceType: sourceContentKindSchema.default('article'),
  url: z.string().trim().url(),
  title: z.string().trim().min(1).max(500).optional(),
  agentOwner: z.string().trim().min(1).max(255).default('cartographer'),
});

export const sourceDocumentDraftSchema = z.object({
  userId: z.string().uuid(),
  topicSlug: z.string().nullable(),
  sourceType: sourceContentKindSchema,
  title: z.string(),
  canonicalUrl: z.string().url(),
  language: z.string(),
  permissionScope: z.literal('owner_private'),
  contentHash: z.string().length(64),
  normalizedContentHash: z.string().length(64),
  documentVersion: z.literal('v1'),
  retrievedAt: z.date(),
  metadata: z.object({
    contentType: z.string(),
    byteLength: z.number().int().min(0),
    promptInjectionSignals: z.array(z.string()),
  }),
});

export const sourceIngestionPlanSchema = z.object({
  document: sourceDocumentDraftSchema,
  chunks: z.array(z.custom<SourceChunkDraft>()).min(1),
});

export type SourceIngestionInput = z.input<typeof sourceIngestionInputSchema>;
export type SourceDocumentDraft = z.infer<typeof sourceDocumentDraftSchema>;
export type SourceIngestionPlan = z.infer<typeof sourceIngestionPlanSchema>;

type ResolveHostname = (hostname: string) => Promise<string[]>;
type FetchLike = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<Response>;

function isBlockedIp(address: string): boolean {
  if (metadataServiceIps.has(address)) {
    return true;
  }

  if (address === '::1' || address.startsWith('fe80:')) {
    return true;
  }

  const parts = address.split('.').map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

async function assertSafeUrl(url: URL, resolveHostname: ResolveHostname): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported source URL scheme.');
  }

  if (blockedHostnames.has(url.hostname.toLowerCase())) {
    throw new Error('Blocked source hostname.');
  }

  const addresses = isIP(url.hostname) ? [url.hostname] : await resolveHostname(url.hostname);

  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new Error('Blocked source network destination.');
  }
}

function extractText(content: string, contentType: string): string {
  if (!contentType.includes('html')) {
    return normalizeSourceText(content);
  }

  return normalizeSourceText(
    content
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&'),
  );
}

async function readBoundedText(response: Response): Promise<string> {
  const text = await response.text();
  const bytes = Buffer.byteLength(text, 'utf8');

  if (bytes > maxBytes) {
    throw new Error('Source response exceeded maximum byte limit.');
  }

  return text;
}

export async function createSourceIngestionPlan(
  input: SourceIngestionInput,
  dependencies: {
    fetcher?: FetchLike;
    resolveHostname: ResolveHostname;
    now?: () => Date;
  },
): Promise<SourceIngestionPlan> {
  const validated = sourceIngestionInputSchema.parse(input);
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  let currentUrl = new URL(validated.url);

  for (let redirectCount = 0; redirectCount <= redirectLimit; redirectCount += 1) {
    await assertSafeUrl(currentUrl, dependencies.resolveHostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetcher(currentUrl.toString(), {
        redirect: 'manual',
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');

        if (location === null || redirectCount === redirectLimit) {
          throw new Error('Source redirect limit exceeded.');
        }

        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new Error('Source fetch failed.');
      }

      const contentType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '';

      if (!supportedContentTypes.includes(contentType)) {
        throw new Error('Unsupported source content type.');
      }

      const raw = await readBoundedText(response);
      const text = extractText(raw, contentType);
      const chunks = chunkSourceText({
        content: text,
        kind: validated.sourceType,
        citationBase: currentUrl.toString(),
      });

      return sourceIngestionPlanSchema.parse({
        document: {
          userId: validated.userId,
          topicSlug: validated.topicSlug ?? null,
          sourceType: validated.sourceType,
          title: validated.title ?? currentUrl.hostname,
          canonicalUrl: currentUrl.toString(),
          language: 'en',
          permissionScope: 'owner_private',
          contentHash: hashNormalizedSource(raw),
          normalizedContentHash: hashNormalizedSource(text),
          documentVersion: 'v1',
          retrievedAt: now(),
          metadata: {
            contentType,
            byteLength: Buffer.byteLength(raw, 'utf8'),
            promptInjectionSignals: detectPromptInjectionSignals(text),
          },
        },
        chunks,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Source redirect limit exceeded.');
}

