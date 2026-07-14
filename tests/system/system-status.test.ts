import '../setup-env';

import { describe, expect, it } from 'vitest';

import { systemStatusResponseSchema } from '../../src/schemas/system-status.schema';
import {
  getConfigurationStatus,
  withDeadline,
} from '../../src/services/system-status.service';

describe('system status contracts', () => {
  it('reports provider configuration without exposing secret values', () => {
    expect(getConfigurationStatus('secret-value')).toBe('configured');
    expect(getConfigurationStatus('   ')).toBe('missing');
    expect(getConfigurationStatus(null)).toBe('missing');
  });

  it('returns timeout when a health probe exceeds its deadline', async () => {
    await expect(
      withDeadline(
        new Promise((resolve) => setTimeout(() => resolve('late'), 20)),
        1,
      ),
    ).resolves.toBe('timeout');
  });

  it('validates the API response shape', () => {
    const result = systemStatusResponseSchema.parse({
      postgres: 'ok',
      redis: 'degraded',
      telegram: 'configured',
      llm: 'configured',
      embeddings: 'configured',
      latestWorkflowRun: null,
    });

    expect(result.postgres).toBe('ok');
    expect(result.redis).toBe('degraded');
    expect(result.latestWorkflowRun).toBeNull();
  });
});