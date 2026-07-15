import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { classifyWorkflowError } from '../../src/workflows/phase1/state-machine';

describe('workflow node run repository contract', () => {
  it('exposes durable checkpoint lifecycle methods', async () => {
    const module = await import('../../src/db/workflow-node-run.repo');

    expect(typeof module.workflowNodeRunRepository.createNodeRun).toBe('function');
    expect(typeof module.workflowNodeRunRepository.claimReadyNode).toBe('function');
    expect(typeof module.workflowNodeRunRepository.completeNode).toBe('function');
    expect(typeof module.workflowNodeRunRepository.failNode).toBe('function');
    expect(typeof module.workflowNodeRunRepository.markRetryReady).toBe('function');
    expect(typeof module.workflowNodeRunRepository.listWorkflowNodes).toBe('function');
  });

  it('keeps ownership filters and lease guards in repository source', () => {
    const source = readFileSync('src/db/workflow-node-run.repo.ts', 'utf8');

    expect(source).toContain('assertDbActor');
    expect(source).toContain('eq(workflowNodeRuns.userId, validatedActor.userId)');
    expect(source).toContain('leaseExpiresAt');
    expect(source).toContain('failed_retryable');
  });

  it('stores safe typed errors for retry decisions', () => {
    const error = classifyWorkflowError('provider_timeout');

    expect(error.retryable).toBe(true);
    expect(error.stableCategory).toBe('transient');
  });
});
