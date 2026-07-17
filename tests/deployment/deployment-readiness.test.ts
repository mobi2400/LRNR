import { describe, expect, it } from 'vitest';

import { buildDeploymentReadinessReport } from '../../scripts/deployment-readiness-check';

describe('deployment readiness gate', () => {
  it('fails closed when a required secret or endpoint is missing', () => {
    const report = buildDeploymentReadinessReport({
      APP_URL: 'https://lrnr.test',
    });

    expect(report.ready).toBe(false);
    expect(report.missing).toContain('TELEGRAM_BOT_TOKEN');
    expect(report.configured).toContain('APP_URL');
  });

  it('fails when the daily worker or scheduler artifacts are absent', () => {
    const report = buildDeploymentReadinessReport(
      {},
      (path) => path !== 'scripts/run-daily-learning.ts',
    );

    expect(report.ready).toBe(false);
    expect(report.missingArtifacts).toContain('scripts/run-daily-learning.ts');
  });
  it('does not expose configured secret values', () => {
    const report = buildDeploymentReadinessReport({
      APP_URL: 'https://lrnr.test',
      ACCESS_MODE: 'owner_only',
      OWNER_EMAIL: 'owner@example.com',
      AUTH_SECRET: 'secret',
      LRNR_ACCESS_SECRET_HASH: 'hash',
      LRNR_ACCESS_SECRET_SALT: 'salt',
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/lrnr',
      REDIS_URL: 'redis://localhost:6379',
      LLM_API_KEY: 'llm',
      EMBEDDING_API_KEY: 'embedding',
      TELEGRAM_BOT_TOKEN: 'telegram',
      TELEGRAM_OWNER_CHAT_ID: '123456',
    });

    expect(report.ready).toBe(true);
    expect(report.configured).toContain('TELEGRAM_BOT_TOKEN');
    expect(JSON.stringify(report)).not.toContain('telegram');
  });
});
