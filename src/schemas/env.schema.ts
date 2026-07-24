import { z } from 'zod';

export const accessModeSchema = z.enum(['owner_only', 'invite_only', 'public']);

const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

const optionalSecret = z.string().trim().min(1).optional();

/**
 * Connection URLs are validated by protocol so a pasted shell command (for
 * example `redis-cli -u redis://...`) fails here with a clear message instead
 * of surfacing as an opaque driver stack trace at first use.
 */
const connectionUrl = (label: string, protocols: string[]) =>
  nonEmptyString(label).refine((value) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, `${label} must be a valid ${protocols.join(' or ')} connection URL`);

export const rawEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    APP_URL: z.string().trim().url('APP_URL must be a valid URL'),
    ACCESS_MODE: accessModeSchema,
    OWNER_USER_ID: z.string().trim().min(1).optional(),
    OWNER_EMAIL: z
      .string()
      .trim()
      .email('OWNER_EMAIL must be a valid email address')
      .optional(),
    AUTH_SECRET: nonEmptyString('AUTH_SECRET'),
    LRNR_ACCESS_SECRET_HASH: nonEmptyString('LRNR_ACCESS_SECRET_HASH'),
    LRNR_ACCESS_SECRET_SALT: nonEmptyString('LRNR_ACCESS_SECRET_SALT'),
    SUPABASE_URL: z.string().trim().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_ANON_KEY: nonEmptyString('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: nonEmptyString('SUPABASE_SERVICE_ROLE_KEY'),
    DATABASE_URL: connectionUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
    REDIS_URL: connectionUrl('REDIS_URL', ['redis:', 'rediss:']),
    LLM_API_KEY: nonEmptyString('LLM_API_KEY'),
    LLM_MODEL: z.string().trim().min(1).optional(),
    EMBEDDING_API_KEY: nonEmptyString('EMBEDDING_API_KEY'),
    EMBEDDING_MODEL: z.string().trim().min(1).optional(),
    TELEGRAM_BOT_TOKEN: nonEmptyString('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_OWNER_CHAT_ID: nonEmptyString('TELEGRAM_OWNER_CHAT_ID'),
    ELEVENLABS_API_KEY: optionalSecret,
    ELEVENLABS_VOICE_ID: optionalSecret,
    NEXT_PUBLIC_APP_URL: z.string().trim().url().optional(),
    NEXT_PUBLIC_ACCESS_MODE: accessModeSchema.optional(),
    NEXT_PUBLIC_ELEVENLABS_ENABLED: z.enum(['true', 'false']).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.OWNER_USER_ID && !env.OWNER_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide at least one owner identifier: OWNER_USER_ID or OWNER_EMAIL.',
        path: ['OWNER_USER_ID'],
      });
    }

    const elevenLabsKeyProvided = Boolean(env.ELEVENLABS_API_KEY);
    const elevenLabsVoiceProvided = Boolean(env.ELEVENLABS_VOICE_ID);

    if (elevenLabsKeyProvided !== elevenLabsVoiceProvided) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be provided together when ElevenLabs is enabled.',
        path: ['ELEVENLABS_API_KEY'],
      });
    }

    if (
      env.NEXT_PUBLIC_APP_URL !== undefined &&
      env.NEXT_PUBLIC_APP_URL !== env.APP_URL
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'NEXT_PUBLIC_APP_URL must match APP_URL so the browser and server agree on the canonical app URL.',
        path: ['NEXT_PUBLIC_APP_URL'],
      });
    }

    if (
      env.NEXT_PUBLIC_ACCESS_MODE !== undefined &&
      env.NEXT_PUBLIC_ACCESS_MODE !== env.ACCESS_MODE
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'NEXT_PUBLIC_ACCESS_MODE must match ACCESS_MODE so the frontend cannot drift from backend policy.',
        path: ['NEXT_PUBLIC_ACCESS_MODE'],
      });
    }
  });

export type RawEnv = z.infer<typeof rawEnvSchema>;

export const clientEnvSchema = z.object({
  appUrl: z.string().url(),
  accessMode: accessModeSchema,
  elevenLabsEnabled: z.boolean(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
