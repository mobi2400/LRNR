import '../setup-env';

import { describe, expect, it } from 'vitest';

import { systemStatusResponseSchema } from '../../src/schemas/system-status.schema';
import { getConfigurationStatus } from '../../src/services/system-status.service';

describe('system status contracts', () => {
  it('reports provider configuration without exposing secret values', () => {
    expect(getConfigurationStatus('secret-value')).toBe('configured');
    expect(getConfigurationStatus('   ')).toBe('missing');
    expect(getConfigurationStatus(null)).toBe('missing');
  });

  it('validates the API response shape', () => {
    const result = systemStatusResponseSchema.parse({
      postgres: 'ok',
      redis: 'down',
      telegram: 'configured',
      llm: 'configured',
      embeddings: 'configured',
      latestWorkflowRun: null,
    });

    expect(result.postgres).toBe('ok');
    expect(result.latestWorkflowRun).toBeNull();
  });
});
