import { getClientEnv, getServerEnv } from '@/env';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/server/config.ts');

/**
 * The server config groups sensitive settings by domain so later auth,
 * database, and provider modules can depend on one typed contract instead of
 * each reading raw environment variables independently.
 */
const env = getServerEnv();

export const serverConfig = {
  nodeEnv: env.NODE_ENV,
  appUrl: env.APP_URL,
  accessMode: env.ACCESS_MODE,
  owner: {
    userId: env.OWNER_USER_ID ?? null,
    email: env.OWNER_EMAIL ?? null,
  },
  auth: {
    secret: env.AUTH_SECRET,
    lrnrAccessSecretHash: env.LRNR_ACCESS_SECRET_HASH,
    lrnrAccessSecretSalt: env.LRNR_ACCESS_SECRET_SALT,
  },
  database: {
    url: env.DATABASE_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  redis: {
    url: env.REDIS_URL,
  },
  providers: {
    llmApiKey: env.LLM_API_KEY,
    // Model ids are configurable so we can track Gemini's release line without
    // code changes. `gemini-flash-latest` is a stable alias that always points
    // to the current flash GA model, avoiding the "not available to new users"
    // gating that pinned version ids (e.g. gemini-2.5-flash) can hit.
    llmModel: env.LLM_MODEL ?? 'gemini-flash-latest',
    embeddingApiKey: env.EMBEDDING_API_KEY,
    embeddingModel: env.EMBEDDING_MODEL ?? 'gemini-embedding-001',
  },
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    ownerChatId: env.TELEGRAM_OWNER_CHAT_ID,
  },
  elevenLabs: {
    enabled: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID),
    apiKey: env.ELEVENLABS_API_KEY ?? null,
    voiceId: env.ELEVENLABS_VOICE_ID ?? null,
  },
} as const;

/**
 * This object is intentionally safe to serialize to the browser later. Keeping
 * it adjacent to the server config makes the allowed public surface explicit.
 */
export const clientConfig = getClientEnv();

export type ServerConfig = typeof serverConfig;
export type ClientConfig = typeof clientConfig;
