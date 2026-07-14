import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/lib/llm.ts');

export interface StructuredExtractionInput<TOutput> {
  label: string;
  produce: () => TOutput;
}

/**
 * Phase 1 keeps provider calls behind a wrapper. The current implementation is
 * deterministic so tests and local onboarding do not require external LLM keys.
 */
export async function extractStructured<TOutput>(
  input: StructuredExtractionInput<TOutput>,
): Promise<TOutput> {
  return input.produce();
}
