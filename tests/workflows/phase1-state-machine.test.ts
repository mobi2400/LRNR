import { describe, expect, it } from 'vitest';

import {
  assertNodeTransition,
  assertWorkflowTransition,
  canRetryNode,
  classifyWorkflowError,
  nodeStateSchema,
  phase1NodePolicyRegistry,
} from '../../src/workflows/phase1/state-machine';

describe('Phase 1 workflow state machine', () => {
  it('allows legal workflow and node transitions', () => {
    expect(() => assertWorkflowTransition('queued', 'running')).not.toThrow();
    expect(() => assertWorkflowTransition('running', 'waiting_for_owner')).not.toThrow();
    expect(() => assertNodeTransition('ready', 'running')).not.toThrow();
    expect(() => assertNodeTransition('running', 'succeeded')).not.toThrow();
  });

  it('rejects illegal terminal transitions', () => {
    expect(() => assertWorkflowTransition('succeeded', 'running')).toThrow('Illegal workflow transition');
    expect(() => assertNodeTransition('succeeded', 'running')).toThrow('Illegal node transition');
  });

  it('models waiting-for-owner explicitly', () => {
    expect(() => assertNodeTransition('running', 'waiting_for_owner')).not.toThrow();
    expect(() => assertWorkflowTransition('waiting_for_owner', 'running')).not.toThrow();
  });

  it('classifies retryable and terminal errors', () => {
    expect(classifyWorkflowError('provider_timeout').retryable).toBe(true);
    expect(classifyWorkflowError('schema_invalid').stableCategory).toBe('safety_gate');
    expect(classifyWorkflowError('missing_required_state').retryable).toBe(false);
  });

  it('enforces retry limits', () => {
    const retryable = nodeStateSchema.parse({
      workflowRunId: 'wf-1',
      nodeName: 'teaching',
      status: 'failed_retryable',
      attempt: 1,
      maxAttempts: 2,
    });
    const exhausted = { ...retryable, attempt: 2 };

    expect(canRetryNode(retryable)).toBe(true);
    expect(canRetryNode(exhausted)).toBe(false);
  });

  it('defines node policies for the Phase 1 spine', () => {
    expect(phase1NodePolicyRegistry.architect.critical).toBe(true);
    expect(phase1NodePolicyRegistry.delivery_side_effects.critical).toBe(false);
  });
});
