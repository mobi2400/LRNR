import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/llm.ts');

const GROQ_CHAT_COMPLETIONS_URL =
  'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_REASONING_MODEL = 'llama-3.3-70b-versatile';
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

const groqChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(1),
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
        const nextResponse = await fetchImpl(GROQ_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${serverConfig.providers.llmApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: input.model ?? DEFAULT_REASONING_MODEL,
            temperature: input.temperature ?? 0.35,
            max_completion_tokens: input.maxTokens ?? 4_000,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.prompt },
            ],
          }),
        });

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

    const result = groqChatResponseSchema.parse(await response.json());
    const content = result.choices[0]?.message.content;

    if (content === undefined) {
      throw new Error(`${input.label} returned no structured content.`);
    }

    return input.schema.parse(parseJsonObject(content, input.label));
  } finally {
    clearTimeout(timeout);
  }
}
