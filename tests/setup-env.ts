Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? 'test',
  APP_URL: process.env.APP_URL ?? 'https://lrnr.test',
  ACCESS_MODE: process.env.ACCESS_MODE ?? 'owner_only',
  OWNER_USER_ID: process.env.OWNER_USER_ID ?? 'owner-user-id',
  OWNER_EMAIL: process.env.OWNER_EMAIL ?? 'owner@example.com',
  AUTH_SECRET: process.env.AUTH_SECRET ?? 'test-auth-secret',
  LRNR_ACCESS_SECRET_HASH:
    process.env.LRNR_ACCESS_SECRET_HASH ?? 'test-access-secret-hash',
  LRNR_ACCESS_SECRET_SALT:
    process.env.LRNR_ACCESS_SECRET_SALT ?? 'test-access-secret-salt',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'https://supabase.test',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-key',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/lrnr',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  LLM_API_KEY: process.env.LLM_API_KEY ?? 'llm-key',
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY ?? 'embedding-key',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? 'telegram-token',
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID ?? '123456',
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://lrnr.test',
  NEXT_PUBLIC_ACCESS_MODE:
    process.env.NEXT_PUBLIC_ACCESS_MODE ?? 'owner_only',
  NEXT_PUBLIC_ELEVENLABS_ENABLED:
    process.env.NEXT_PUBLIC_ELEVENLABS_ENABLED ?? 'false',
});
