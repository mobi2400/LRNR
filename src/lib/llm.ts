import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/llm.ts');

const GEMINI_GENERATE_CONTENT_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_REASONING_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 45_000;

export interface StructuredExtractionInput<TOutput> {
  label: string;
  produce: () => TOutput;
}

export interface StructuredGenerationInput<TOutput> {
  label: string;
  system: string;
  prompt: string;
  schema: z.ZodType<TOutput>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const geminiGenerateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z
            .array(
              z.object({
                text: z.string().min(1),
              }),
            )
            .min(1),
        }),
      }),
    )
    .min(1),
});

function parseJsonObject(content: string, label: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`, { cause: error });
  }
}

/**
 * Deterministic extraction remains available for pure normalization steps that
 * do not require model reasoning.
 */
export async function extractStructured<TOutput>(
  input: StructuredExtractionInput<TOutput>,
): Promise<TOutput> {
  return input.produce();
}

/**
 * Provider-backed structured generation. The wrapper owns timeout, HTTP error
 * handling, JSON parsing, and Zod validation so agents never trust raw output.
 */
export async function generateStructured<TOutput>(
  input: StructuredGenerationInput<TOutput>,
): Promise<TOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await pRetry(
      async () => {
        const model = input.model ?? DEFAULT_REASONING_MODEL;
        const nextResponse = await fetchImpl(
          `${GEMINI_GENERATE_CONTENT_BASE_URL}/${model}:generateContent`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'x-goog-api-key': serverConfig.providers.llmApiKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: input.system }],
              },
              contents: [
                {
                  role: 'user',
                  parts: [{ text: input.prompt }],
                },
              ],
              generationConfig: {
                temperature: input.temperature ?? 0.35,
                maxOutputTokens: input.maxTokens ?? 4_000,
                responseMimeType: 'application/json',
              },
            }),
          },
        );

        if (!nextResponse.ok) {
          const safeBody = (await nextResponse.text()).slice(0, 500);
          const error = new Error(
            `${input.label} provider request failed (${nextResponse.status}): ${safeBody}`,
          );

          if (nextResponse.status < 500) {
            throw new AbortError(error);
          }

          throw error;
        }

        return nextResponse;
      },
      { retries: 2 },
    );

    const result = geminiGenerateContentResponseSchema.parse(
      await response.json(),
    );
    const content = result.candidates[0]?.content.parts
      .map((part) => part.text)
      .join('');

    if (content === undefined) {
      throw new Error(`${input.label} returned no structured content.`);
    }

    return input.schema.parse(parseJsonObject(content, input.label));
  } finally {
    clearTimeout(timeout);
  }
}
