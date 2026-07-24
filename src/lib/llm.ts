import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';

import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/llm.ts');

const GEMINI_GENERATE_CONTENT_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOOL_ROUNDS = 4;

/**
 * Current Gemini flash/pro models are "thinking" models: internal reasoning
 * tokens are billed against maxOutputTokens, and thinking cannot be switched
 * off (a thinkingBudget of 0 yields an empty candidate). A short prompt still
 * burns several hundred thinking tokens, so every request needs headroom or the
 * answer is truncated to nothing. This floor keeps small structured calls safe.
 */
const MIN_OUTPUT_TOKENS = 2_048;

function withThinkingHeadroom(maxTokens: number): number {
  return Math.max(maxTokens, MIN_OUTPUT_TOKENS);
}

function defaultModel(): string {
  return serverConfig.providers.llmModel;
}

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

/**
 * A tool the model may call during an agent loop. `parameters` is a Gemini
 * function-declaration JSON schema (the OpenAPI subset Gemini accepts).
 */
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type LlmToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface ToolAgentInput<TOutput> {
  label: string;
  system: string;
  prompt: string;
  schema: z.ZodType<TOutput>;
  tools: LlmToolDefinition[];
  executeTool: LlmToolExecutor;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxToolRounds?: number;
  fetchImpl?: typeof fetch;
}

// Minimal shapes for the Gemini generateContent turn protocol. We keep these
// permissive because a single candidate part is either a tool call or text.
interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown> | undefined;
}

interface GeminiPart {
  text?: string | undefined;
  functionCall?: GeminiFunctionCall | undefined;
  functionResponse?:
    | {
        name: string;
        response: Record<string, unknown>;
      }
    | undefined;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            role: z.string().optional(),
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  functionCall: z
                    .object({
                      name: z.string().min(1),
                      args: z.record(z.string(), z.unknown()).optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

function parseJsonObject(content: string, label: string): unknown {
  // Models occasionally wrap JSON in a markdown fence even when asked not to.
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    return JSON.parse(unfenced) as unknown;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`, { cause: error });
  }
}

/**
 * Deterministic extraction remains available for pure normalization steps that
 * do not require model reasoning. It must not be used as an agent's only path.
 */
export async function extractStructured<TOutput>(
  input: StructuredExtractionInput<TOutput>,
): Promise<TOutput> {
  return input.produce();
}

interface GeminiRequestOptions {
  model: string;
  system: string;
  contents: GeminiContent[];
  temperature: number;
  maxTokens: number;
  responseJson: boolean;
  tools?: LlmToolDefinition[];
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  label: string;
}

/**
 * One provider round-trip. Owns HTTP error mapping and retry classification so
 * both single-shot generation and the tool loop share identical failure rules.
 */
async function callGemini(options: GeminiRequestOptions) {
  const response = await pRetry(
    async () => {
      const body: Record<string, unknown> = {
        system_instruction: { parts: [{ text: options.system }] },
        contents: options.contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          // JSON mode and tool use are mutually exclusive on Gemini, so we only
          // request a JSON mime type on rounds where no tools are offered.
          ...(options.responseJson
            ? { responseMimeType: 'application/json' }
            : {}),
        },
        ...(options.tools && options.tools.length > 0
          ? {
              tools: [
                {
                  functionDeclarations: options.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  })),
                },
              ],
            }
          : {}),
      };
      const nextResponse = await options.fetchImpl(
        `${GEMINI_GENERATE_CONTENT_BASE_URL}/${options.model}:generateContent`,
        {
          method: 'POST',
          signal: options.signal,
          headers: {
            'x-goog-api-key': serverConfig.providers.llmApiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!nextResponse.ok) {
        const safeBody = (await nextResponse.text()).slice(0, 500);
        const error = new Error(
          `${options.label} provider request failed (${nextResponse.status}): ${safeBody}`,
        );

        // 429 (rate limit) and 5xx are transient and worth retrying with
        // backoff. Every other 4xx is a caller error (bad model id, bad key)
        // that will not self-heal, so we abort rather than burn retries on it.
        if (nextResponse.status !== 429 && nextResponse.status < 500) {
          throw new AbortError(error);
        }

        throw error;
      }

      return nextResponse;
    },
    {
      retries: 3,
      // Rate limits need real spacing, not the default sub-second backoff.
      minTimeout: 2_000,
      maxTimeout: 20_000,
      factor: 3,
      randomize: true,
    },
  );

  return geminiResponseSchema.parse(await response.json());
}

function readParts(parsed: z.infer<typeof geminiResponseSchema>): GeminiPart[] {
  return (parsed.candidates[0]?.content?.parts ?? []) as GeminiPart[];
}

/**
 * Turns an empty candidate into an actionable error. The usual cause is the
 * thinking budget consuming the whole output allowance, which retrying will not
 * fix — the caller needs a larger maxTokens.
 */
function assertUsableContent(
  content: string,
  parsed: z.infer<typeof geminiResponseSchema>,
  label: string,
): void {
  if (content.trim().length > 0) {
    return;
  }

  const finishReason = parsed.candidates[0]?.finishReason ?? 'unknown';

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      `${label} exhausted its output budget on thinking tokens before producing an answer. Raise maxTokens (minimum ${MIN_OUTPUT_TOKENS}).`,
    );
  }

  throw new Error(
    `${label} returned no structured content (finishReason: ${finishReason}).`,
  );
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

  try {
    const parsed = await callGemini({
      model: input.model ?? defaultModel(),
      system: input.system,
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      temperature: input.temperature ?? 0.35,
      maxTokens: withThinkingHeadroom(input.maxTokens ?? 4_000),
      responseJson: true,
      signal: controller.signal,
      fetchImpl: input.fetchImpl ?? fetch,
      label: input.label,
    });
    const content = readParts(parsed)
      .map((part) => part.text ?? '')
      .join('');

    assertUsableContent(content, parsed, input.label);

    return input.schema.parse(parseJsonObject(content, input.label));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Runs an agentic loop: the model may call the supplied tools across several
 * rounds before returning a final JSON answer. Tool results are fed back as
 * functionResponse turns. The final round drops tools and forces JSON mode so
 * the answer is always schema-validated.
 *
 * Tools are how an agent reaches real evidence (source fetching, RAG search)
 * instead of hallucinating it — the "hybrid" retrieval + reasoning path.
 */
export async function runToolAgent<TOutput>(
  input: ToolAgentInput<TOutput>,
): Promise<TOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = input.fetchImpl ?? fetch;
  const model = input.model ?? defaultModel();
  const maxRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: input.prompt }] },
  ];

  try {
    for (let round = 0; round < maxRounds; round += 1) {
      const parsed = await callGemini({
        model,
        system: input.system,
        contents,
        temperature: input.temperature ?? 0.3,
        maxTokens: withThinkingHeadroom(input.maxTokens ?? 4_000),
        responseJson: false,
        tools: input.tools,
        signal: controller.signal,
        fetchImpl,
        label: input.label,
      });
      const parts = readParts(parsed);
      const toolCalls = parts.filter(
        (part): part is GeminiPart & { functionCall: GeminiFunctionCall } =>
          part.functionCall !== undefined,
      );

      if (toolCalls.length === 0) {
        const content = parts.map((part) => part.text ?? '').join('');

        if (content.trim().length > 0) {
          return input.schema.parse(parseJsonObject(content, input.label));
        }

        break;
      }

      // Record the model's tool-call turn verbatim, then answer each call.
      contents.push({ role: 'model', parts: toolCalls });

      const responseParts: GeminiPart[] = [];

      for (const call of toolCalls) {
        const result = await input.executeTool(
          call.functionCall.name,
          call.functionCall.args ?? {},
        );

        responseParts.push({
          functionResponse: {
            name: call.functionCall.name,
            // Gemini requires an object here; wrap primitive/array results.
            response: { result },
          },
        });
      }

      contents.push({ role: 'user', parts: responseParts });
    }

    // Tool budget exhausted: force a final JSON answer with no further tools.
    const finalContents: GeminiContent[] = [
      ...contents,
      {
        role: 'user',
        parts: [
          {
            text: 'Stop calling tools. Return the final JSON answer now using the evidence already gathered.',
          },
        ],
      },
    ];
    const finalParsed = await callGemini({
      model,
      system: input.system,
      contents: finalContents,
      temperature: input.temperature ?? 0.3,
      maxTokens: withThinkingHeadroom(input.maxTokens ?? 4_000),
      responseJson: true,
      signal: controller.signal,
      fetchImpl,
      label: input.label,
    });
    const finalContent = readParts(finalParsed)
      .map((part) => part.text ?? '')
      .join('');

    assertUsableContent(finalContent, finalParsed, input.label);

    return input.schema.parse(parseJsonObject(finalContent, input.label));
  } finally {
    clearTimeout(timeout);
  }
}
