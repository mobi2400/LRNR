import { dashboardRepository } from '@/db/dashboard.repo';
import type { DbActor } from '@/db/repository-helpers';
import { RedisKeyValueStore, type KeyValueStore } from '@/lib/redis';
import { appLogger } from '@/lib/logger';
import {
  dashboardResponseSchema,
  type DashboardResponse,
} from '@/schemas/dashboard.schema';
import {
  buildDashboardCacheKey,
  CACHE_TTL_MS,
  getCachedJson,
  setCachedJson,
} from '@/server/cache';
import { assertServerOnly } from '@/utils/server-only';

assertServerOnly('src/services/dashboard.service.ts');

function dashboardTtlWithJitter(): number {
  const jitter = Math.floor(CACHE_TTL_MS.dashboard * 0.1 * Math.random());

  return CACHE_TTL_MS.dashboard - jitter;
}

interface DashboardReadRepository {
  getCurrentSummary: typeof dashboardRepository.getCurrentSummary;
  listRecentAlerts: typeof dashboardRepository.listRecentAlerts;
  getLatestWorkflow: typeof dashboardRepository.getLatestWorkflow;
}

interface DashboardServiceDependencies {
  store?: KeyValueStore;
  repository?: DashboardReadRepository;
}

export function createDashboardService(
  dependencies: DashboardServiceDependencies = {},
) {
  const store = dependencies.store ?? new RedisKeyValueStore();
  const repository = dependencies.repository ?? dashboardRepository;
  return {
    async getDashboard(actor: DbActor): Promise<DashboardResponse> {
      const cacheKey = buildDashboardCacheKey(actor.userId);

      try {
        const cached = await getCachedJson(store, cacheKey, dashboardResponseSchema);

        if (cached !== null) {
          return dashboardResponseSchema.parse({
            ...cached,
            cache: {
              status: 'hit',
            },
          });
        }
      } catch (error) {
        appLogger.warn('dashboard.cache_read_failed', {
          requestId: actor.requestId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }

      const [topic, alerts, latestWorkflow] = await Promise.all([
        repository.getCurrentSummary(actor),
        repository.listRecentAlerts(actor),
        repository.getLatestWorkflow(actor),
      ]);
      const response = dashboardResponseSchema.parse({
        topic,
        alerts,
        latestWorkflow,
        cache: {
          status: 'miss',
        },
      });

      try {
        await setCachedJson(store, cacheKey, response, dashboardTtlWithJitter());
      } catch (error) {
        appLogger.warn('dashboard.cache_write_failed', {
          requestId: actor.requestId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }

      return response;
    },
  };
}

export const dashboardService = createDashboardService();