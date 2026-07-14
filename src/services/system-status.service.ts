import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { jobsRepository } from '@/db/jobs.repo';
import type { DbActor } from '@/db/repository-helpers';
import { checkRedisHealth } from '@/lib/redis';
import {
  systemStatusResponseSchema,
  type ConfigurationStatus,
  type DependencyHealth,
  type SystemStatusResponse,
} from '@/schemas/system-status.schema';
import { serverConfig } from '@/server/config';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/system-status.service.ts');

const HEALTH_TIMEOUT_MS = 500;
const PHASE_1_WORKFLOW_TYPES = [
  'architect_onboarding',
  'cartographer_mapping',
  'curriculum_build',
  'teaching_session',
] as const;

export function getConfigurationStatus(value: string | null): ConfigurationStatus {
  return value === null || value.trim().length === 0 ? 'missing' : 'configured';
}

export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<T | 'timeout'> {
  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<'timeout'>((resolve) => {
        timeout = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }
}

async function checkPostgresStatus(): Promise<DependencyHealth> {
  try {
    const result = await withDeadline(db.execute(sql`select 1`));

    return result === 'timeout' ? 'degraded' : 'ok';
  } catch {
    return 'down';
  }
}

async function checkRedisStatus(): Promise<DependencyHealth> {
  try {
    const result = await withDeadline(checkRedisHealth());

    if (result === 'timeout') {
      return 'degraded';
    }

    return result.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

async function getLatestWorkflowRun(actor: DbActor) {
  const latest = await jobsRepository.getLatestByTypes(actor, {
    jobTypes: [...PHASE_1_WORKFLOW_TYPES],
  });

  if (latest === null) {
    return null;
  }

  return {
    id: latest.id,
    jobType: latest.jobType,
    status: latest.status,
    createdAt: latest.createdAt.toISOString(),
    updatedAt: latest.updatedAt.toISOString(),
  };
}

export const systemStatusService = {
  async getSystemStatus(actor: DbActor): Promise<SystemStatusResponse> {
    const [postgres, redis, latestWorkflowRun] = await Promise.all([
      checkPostgresStatus(),
      checkRedisStatus(),
      getLatestWorkflowRun(actor),
    ]);

    return systemStatusResponseSchema.parse({
      postgres,
      redis,
      telegram:
        getConfigurationStatus(serverConfig.telegram.botToken) === 'configured' &&
        getConfigurationStatus(serverConfig.telegram.ownerChatId) === 'configured'
          ? 'configured'
          : 'missing',
      llm: getConfigurationStatus(serverConfig.providers.llmApiKey),
      embeddings: getConfigurationStatus(serverConfig.providers.embeddingApiKey),
      latestWorkflowRun,
    });
  },
};