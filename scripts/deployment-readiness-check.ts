import { pathToFileURL } from 'node:url';

export const requiredDeploymentEnvKeys = [
  'APP_URL',
  'ACCESS_MODE',
  'OWNER_EMAIL',
  'AUTH_SECRET',
  'LRNR_ACCESS_SECRET_HASH',
  'LRNR_ACCESS_SECRET_SALT',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'LLM_API_KEY',
  'EMBEDDING_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_OWNER_CHAT_ID',
] as const;

export interface DeploymentReadinessReport {
  ready: boolean;
  configured: string[];
  missing: string[];
}

export function buildDeploymentReadinessReport(
  env: Record<string, string | undefined>,
): DeploymentReadinessReport {
  const configured: string[] = [];
  const missing: string[] = [];

  for (const key of requiredDeploymentEnvKeys) {
    const value = env[key];

    if (value === undefined || value.trim().length === 0) {
      missing.push(key);
    } else {
      configured.push(key);
    }
  }

  return {
    ready: missing.length === 0,
    configured,
    missing,
  };
}

function printReport(report: DeploymentReadinessReport): void {
  console.log('LRNR deployment readiness');
  console.log(`ready=${report.ready}`);
  console.log(`configured=${report.configured.join(', ')}`);

  if (!report.ready) {
    console.log(`missing=${report.missing.join(', ')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const report = buildDeploymentReadinessReport(process.env);

  printReport(report);
  process.exitCode = report.ready ? 0 : 1;
}
