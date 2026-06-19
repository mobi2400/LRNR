import type { ZodIssue } from 'zod';

import { clientEnvSchema, rawEnvSchema } from '@/schemas/env.schema';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/env.ts');

/**
 * Environment parsing is intentionally centralized so every server entrypoint
 * reads one validated shape instead of sprinkling `process.env` access around
 * the codebase. That keeps missing config failures early and easier to debug.
 */
let cachedEnv: ReturnType<typeof rawEnvSchema.parse> | null = null;

function formatIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'root';

  return `${path}: ${issue.message}`;
}

export function getServerEnv(): ReturnType<typeof rawEnvSchema.parse> {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsedEnv = rawEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    const details = parsedEnv.error.issues.map(formatIssue).join('\n- ');

    throw new Error(`Invalid environment configuration:\n- ${details}`);
  }

  cachedEnv = parsedEnv.data;

  return cachedEnv;
}

export function getClientEnv() {
  const env = getServerEnv();

  return clientEnvSchema.parse({
    appUrl: env.NEXT_PUBLIC_APP_URL ?? env.APP_URL,
    accessMode: env.NEXT_PUBLIC_ACCESS_MODE ?? env.ACCESS_MODE,
    elevenLabsEnabled:
      env.NEXT_PUBLIC_ELEVENLABS_ENABLED !== undefined
        ? env.NEXT_PUBLIC_ELEVENLABS_ENABLED === 'true'
        : Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),
  });
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
