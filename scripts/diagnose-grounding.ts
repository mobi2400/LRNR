/**
 * Grounding diagnostic.
 *
 * Answers one question: "why is every learning path coming out as the generic
 * 4-concept fallback (mental model / core workflow / common mistakes / practice
 * plan) instead of a plan grounded in the real goal?"
 *
 * The generic plan is what the pipeline produces when the LLM path is skipped or
 * fails at runtime and every agent falls back to its deterministic scaffold.
 * This script exercises the exact same `generateStructured` seam the Architect,
 * Cartographer, and Curriculum Builder use, with the real configured model, and
 * reports whether it succeeds or how it fails.
 *
 * Run:  pnpm diagnose:grounding
 */
import { z } from 'zod';

import { generateStructured, LlmDegradedError } from '../src/lib/llm';
import { serverConfig } from '../src/server/config';

const probeSchema = z.object({
  conceptOutline: z.array(z.string().trim().min(1)).min(3),
});

function line(): void {
  console.log('─'.repeat(64));
}

async function main(): Promise<void> {
  line();
  console.log('LRNR grounding diagnostic');
  line();

  const { providers, nodeEnv } = serverConfig;
  console.log('Resolved config:');
  console.log(`  nodeEnv               : ${nodeEnv}`);
  console.log(`  llmModel              : ${providers.llmModel}`);
  console.log(`  llmApiKey present     : ${providers.llmApiKey.length > 0}`);
  console.log(`  llmApiKey length      : ${providers.llmApiKey.length}`);
  console.log(`  llmRequestsPerMinute  : ${providers.llmRequestsPerMinute}`);
  console.log('');

  if (nodeEnv === 'test') {
    console.log(
      '⚠  nodeEnv is "test": every agent resolves to the DETERMINISTIC path,\n' +
        '   so plans are always the generic scaffold regardless of the API key.\n' +
        '   Run this (and the app) with NODE_ENV unset or "development".',
    );
    line();
    return;
  }

  const goal = process.argv[2] ?? 'master Apache Kafka for backend systems';
  console.log(`Test goal: "${goal}"`);
  console.log('Calling the real LLM (same seam the agents use)…\n');

  const startedAt = Date.now();
  const HARD_TIMEOUT_MS = 60_000;

  // A bounded race so the diagnostic always returns a verdict. Without this it
  // can hang forever when the Redis cache client buffers commands against an
  // unreachable server — which is itself a finding worth reporting.
  const timeoutError = new Error('diagnostic_hard_timeout');
  const timed = <T>(work: Promise<T>): Promise<T> =>
    Promise.race([
      work,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(timeoutError), HARD_TIMEOUT_MS).unref(),
      ),
    ]);

  try {
    const result = await timed(
      generateStructured({
        label: 'grounding_diagnostic',
        system:
          'You are a curriculum planner. Return an ordered concept outline for the goal, grounded in the real topic. Return one JSON object, no markdown fence.',
        prompt: `Goal: ${goal}\nReturn JSON: { "conceptOutline": ["ordered concept", ...at least 3] }`,
        schema: probeSchema,
        temperature: 0.3,
        maxTokens: 2_500,
      }),
    );
    const elapsedMs = Date.now() - startedAt;

    console.log(`✓ LLM path WORKS (${elapsedMs} ms).`);
    console.log('  Grounded concept outline the model returned:');
    for (const concept of result.conceptOutline) {
      console.log(`    - ${concept}`);
    }
    console.log('');
    console.log(
      'Diagnosis: the LLM seam is healthy. If you are still seeing the generic\n' +
        'plan, the fallback happened earlier (during onboarding/cartographer) —\n' +
        'most likely a transient rate-limit during a burst of pipeline calls.\n' +
        'Re-run onboarding and watch the server logs for these warnings:\n' +
        '  architect.*fallback | cartographer.synthesis_fallback | curriculum_builder.design_fallback',
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`✗ LLM path FAILED (${elapsedMs} ms).`);

    if (error === timeoutError) {
      console.log(
        `  Timed out after ${HARD_TIMEOUT_MS} ms with no response.\n` +
          '  Most likely one of:\n' +
          '   - REDIS_URL points at an unreachable server, so the LLM cache read\n' +
          '     blocks before the request is even sent (start Redis, or check the URL).\n' +
          '   - The provider is not responding (network/proxy).\n' +
          '  Either way the app itself will stall the same way when planning a path.',
      );
    } else if (error instanceof LlmDegradedError) {
      console.log(`  Degraded output — reason: ${error.info.reason}`);
      console.log(
        '  This is exactly what triggers the generic fallback. Common causes:\n' +
          '   - safety_blocked / recitation_blocked: model refused this prompt\n' +
          '   - empty_content: thinking tokens consumed the whole budget (raise maxTokens)',
      );
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  Error: ${message}`);
      if (/\b429\b/.test(message)) {
        console.log(
          '  → 429 rate limit. On the free Gemini tier a full pipeline run\n' +
            '    (onboarding + cartographer + curriculum) exceeds the quota and\n' +
            '    every agent degrades to the generic scaffold. Raise\n' +
            '    LLM_REQUESTS_PER_MINUTE cautiously or move to a paid tier.',
        );
      } else if (/40[0-9]/.test(message)) {
        console.log(
          '  → 4xx from the provider. Usually a bad API key or an unavailable\n' +
            '    model id. Check LLM_API_KEY and LLM_MODEL.',
        );
      }
    }
    console.log('');
    console.log(
      'Diagnosis: the generic plan is a real symptom of this failure, not a\n' +
        'design choice. Fix the cause above and re-run onboarding.',
    );
    process.exitCode = 1;
  } finally {
    line();
  }
}

// Force exit: a hung provider/Redis handle can otherwise keep the event loop
// alive after the verdict is printed. Flush stdout first so nothing is lost.
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.stdout.write('', () => process.exit(process.exitCode ?? 0));
  });
