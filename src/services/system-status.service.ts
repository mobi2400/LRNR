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

const PHASE_1_WORKFLOW_TYPES = [
  'architect_onboarding',
  'cartographer_mapping',
  'curriculum_build',
  'teaching_session',
] as const;

export function getConfigurationStatus(value: string | null): ConfigurationStatus {
  return value === null || value.trim().length === 0 ? 'missing' : 'configured';
}

function mapHealth(ok: boolean): DependencyHealth {
  return ok ? 'ok' : 'down';
}

async function checkPostgresStatus(): Promise<DependencyHealth> {
  try {
    await db.execute(sql`select 1`);

    return 'ok';
  } catch {
    return 'down';
  }
}

async function checkRedisStatus(): Promise<DependencyHealth> {
  const health = await checkRedisHealth();

  return mapHealth(health.ok);
}

async function getLatestWorkflowRun(actor: DbActor) {
  const runs = (
    await Promise.all(
      PHASE_1_WORKFLOW_TYPES.map((jobType) =>
        jobsRepository.listByType(actor, {
          jobType,
          limit: 1,
        }),
      ),
    )
  )
    .flat()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const latest = runs[0];

  if (latest === undefined) {
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
