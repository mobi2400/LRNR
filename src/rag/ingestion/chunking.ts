import { createHash } from 'node:crypto';

import { z } from 'zod';

export const sourceContentKindSchema = z.enum([
  'article',
  'markdown',
  'transcript',
  'code_documentation',
  'claim',
  'learner_history',
]);

export const chunkingOptionsSchema = z.object({
  maxTokens: z.number().int().min(64).max(2000).default(480),
  minTokens: z.number().int().min(8).max(400).default(40),
  overlapTokens: z.number().int().min(0).max(160).default(48),
  strategyVersion: z.string().trim().min(1).default('heading-aware-v1'),
});

export const sourceChunkDraftSchema = z.object({
  chunkIndex: z.number().int().min(0),
  retrievalText: z.string().trim().min(1),
  synthesisText: z.string().trim().min(1).nullable(),
  tokenCount: z.number().int().min(1),
  contentHash: z.string().length(64),
  citationAnchor: z.string().trim().min(1),
  sectionHeading: z.string().trim().min(1).nullable(),
  sectionPath: z.string().trim().min(1).nullable(),
  characterStart: z.number().int().min(0),
  characterEnd: z.number().int().min(0),
  chunkStrategy: z.string().trim().min(1),
  chunkStrategyVersion: z.string().trim().min(1),
  qualityDiagnostics: z.object({
    promptInjectionSignals: z.array(z.string()),
    tinyFragment: z.boolean(),
    oversized: z.boolean(),
  }),
});

export type SourceContentKind = z.infer<typeof sourceContentKindSchema>;
export type ChunkingOptions = z.input<typeof chunkingOptionsSchema>;
export type SourceChunkDraft = z.infer<typeof sourceChunkDraftSchema>;

const injectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(the\s+)?(system|developer)\s+instructions/i,
  /reveal\s+(the\s+)?(system\s+prompt|developer\s+message|secrets?)/i,
  /you\s+are\s+now\s+(chatgpt|an?\s+assistant|developer|system)/i,
];

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function estimateTokens(value: string): number {
  const words = value.trim().split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.ceil(words * 1.3));
}

export function normalizeSourceText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detectPromptInjectionSignals(value: string): string[] {
  return injectionPatterns
    .filter((pattern) => pattern.test(value))
    .map((pattern) => pattern.source);
}

export function neutralizePromptInjection(value: string): string {
  let sanitized = value;

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[neutralized untrusted instruction]');
  }

  return sanitized;
}

function splitMarkdownSections(text: string): Array<{
  heading: string | null;
  path: string | null;
  text: string;
  start: number;
}> {
  const headingMatches = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];

  if (headingMatches.length === 0) {
    return [{ heading: null, path: null, text, start: 0 }];
  }

  return headingMatches.map((match, index) => {
    const start = match.index ?? 0;
    const next = headingMatches[index + 1];
    const end = next?.index ?? text.length;
    const heading = match[1]?.trim() ?? null;

    return {
      heading,
      path: heading,
      text: text.slice(start, end).trim(),
      start,
    };
  });
}

function splitByTokenBudget(sectionText: string, maxTokens: number, overlapTokens: number): string[] {
  const sentences = sectionText
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences.length > 0 ? sentences : [sectionText]) {
    const sentenceTokens = estimateTokens(sentence);

    if (current.length > 0 && currentTokens + sentenceTokens > maxTokens) {
      chunks.push(current.join(' '));
      const overlap = current.join(' ').split(/\s+/).slice(-overlapTokens).join(' ');
      current = overlap.length > 0 ? [overlap, sentence] : [sentence];
      currentTokens = estimateTokens(current.join(' '));
      continue;
    }

    current.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks;
}

export function chunkSourceText(input: {
  content: string;
  kind: SourceContentKind;
  citationBase: string;
  options?: ChunkingOptions;
}): SourceChunkDraft[] {
  const options = chunkingOptionsSchema.parse(input.options ?? {});
  const normalized = normalizeSourceText(input.content);
  const sanitized = neutralizePromptInjection(normalized);
  const signals = detectPromptInjectionSignals(normalized);
  const sections =
    input.kind === 'markdown' ||
    input.kind === 'article' ||
    input.kind === 'code_documentation'
      ? splitMarkdownSections(sanitized)
      : [{ heading: null, path: null, text: sanitized, start: 0 }];

  const drafts: SourceChunkDraft[] = [];

  for (const section of sections) {
    const parts = splitByTokenBudget(section.text, options.maxTokens, options.overlapTokens);

    for (const part of parts) {
      const tokenCount = estimateTokens(part);
      const startInSection = sanitized.indexOf(part.slice(0, 32), section.start);
      const characterStart = startInSection >= 0 ? startInSection : section.start;
      const characterEnd = characterStart + part.length;
      const chunkIndex = drafts.length;

      drafts.push(
        sourceChunkDraftSchema.parse({
          chunkIndex,
          retrievalText: part,
          synthesisText: part,
          tokenCount,
          contentHash: hashText(`${input.kind}:${section.path ?? 'root'}:${part}`),
          citationAnchor: `${input.citationBase}#chunk-${chunkIndex}`,
          sectionHeading: section.heading,
          sectionPath: section.path,
          characterStart,
          characterEnd,
          chunkStrategy: input.kind === 'learner_history' ? 'compact-event' : 'heading-aware',
          chunkStrategyVersion: options.strategyVersion,
          qualityDiagnostics: {
            promptInjectionSignals: signals,
            tinyFragment: tokenCount < options.minTokens,
            oversized: tokenCount > options.maxTokens,
          },
        }),
      );
    }
  }

  return drafts;
}

export function hashNormalizedSource(value: string): string {
  return hashText(normalizeSourceText(value));
}
