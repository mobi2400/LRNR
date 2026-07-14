import '../setup-env';

import { describe, expect, it } from 'vitest';

import { MemoryKeyValueStore, type KeyValueStore } from '../../src/lib/redis';
import { dashboardResponseSchema } from '../../src/schemas/dashboard.schema';
import { buildDashboardCacheKey, setCachedJson } from '../../src/server/cache';
import { createDashboardService } from '../../src/services/dashboard.service';

const actor = {
  userId: '11111111-1111-1111-1111-111111111111',
  requestId: 'req_dashboard',
};

function createDashboardFixture() {
  return dashboardResponseSchema.parse({
    topic: {
      currentTopicSlug: 'typescript',
      topicStatus: 'active',
      currentSessionId: 'session-01',
      currentSession: {
        sessionId: 'session-01',
        title: 'Types',
        status: 'ready',
        objective: 'Understand types',
      },
      curriculumRevision: 2,
      completedSessionCount: 1,
      totalSessionCount: 3,
      nextEvaluationDueAt: null,
    },
    alerts: [],
    latestWorkflow: null,
    cache: {
      status: 'miss',
    },
  });
}

function createRepository() {
  const fixture = createDashboardFixture();
  const state = {
    calls: 0,
  };

  return {
    get calls() {
      return state.calls;
    },
    repository: {
      async getCurrentSummary() {
        state.calls += 1;
        return fixture.topic;
      },
      async listRecentAlerts() {
        state.calls += 1;
        return fixture.alerts;
      },
      async getLatestWorkflow() {
        state.calls += 1;
        return fixture.latestWorkflow;
      },
    },
  };
}

class FailingStore extends MemoryKeyValueStore implements KeyValueStore {
  override async get(): Promise<string | null> {
    throw new Error('redis down');
  }

  override async set(): Promise<boolean> {
    throw new Error('redis down');
  }
}

describe('dashboard service cache-aside', () => {
  it('returns a cached dashboard without hitting the read repository', async () => {
    const store = new MemoryKeyValueStore();
    const repository = createRepository();

    await setCachedJson(
      store,
      buildDashboardCacheKey(actor.userId),
      createDashboardFixture(),
      30000,
    );

    const result = await createDashboardService({
      store,
      repository: repository.repository,
    }).getDashboard(actor);

    expect(result.cache.status).toBe('hit');
    expect(repository.calls).toBe(0);
  });

  it('fills cache from bounded repository reads on miss', async () => {
    const store = new MemoryKeyValueStore();
    const repository = createRepository();
    const service = createDashboardService({
      store,
      repository: repository.repository,
    });

    const result = await service.getDashboard(actor);

    expect(result.cache.status).toBe('miss');
    expect(repository.calls).toBe(3);
    await expect(store.get(buildDashboardCacheKey(actor.userId))).resolves.toEqual(
      expect.any(String),
    );
  });

  it('falls back to PostgreSQL reads when Redis is unavailable', async () => {
    const repository = createRepository();
    const result = await createDashboardService({
      store: new FailingStore(),
      repository: repository.repository,
    }).getDashboard(actor);

    expect(result.topic.currentTopicSlug).toBe('typescript');
    expect(result.cache.status).toBe('miss');
  });
});