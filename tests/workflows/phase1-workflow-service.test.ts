import { describe, expect, it } from 'vitest';

import {
  buildPhase1StatusReadModel,
  decidePhase1Route,
  nodeCriticality,
  selectNextPhase1Node,
} from '../../src/workflows/phase1/workflow-service';

const baseContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  requestId: 'req-1',
  workflowRunId: 'wf-1',
};

describe('Phase 1 durable workflow service', () => {
  it('decides Phase 1 routes deterministically', () => {
    expect(decidePhase1Route({ ...baseContext, newlySubmittedGoal: true }).route).toBe('new_goal');
    expect(decidePhase1Route({ ...baseContext, awaitingOwnerInput: true }).route).toBe('waiting_for_onboarding_reply');
    expect(decidePhase1Route({ ...baseContext, hasWorkflowLock: true }).route).toBe('no_op');
    expect(decidePhase1Route({ ...baseContext, hasActiveTopic: true, hasReadySession: true }).route).toBe('continue_teaching');
  });

  it('resumes from completed checkpoints without rerunning them', () => {
    expect(
      selectNextPhase1Node({
        route: 'new_goal',
        checkpoints: [
          { nodeName: 'route', status: 'succeeded', critical: true },
          { nodeName: 'architect', status: 'succeeded', critical: true },
        ],
      }),
    ).toBe('cartographer');
  });

  it('stops on waiting owner state and terminal critical failures', () => {
    expect(selectNextPhase1Node({ route: 'new_goal', checkpoints: [{ nodeName: 'architect', status: 'waiting_for_owner', critical: true }] })).toBeNull();
    expect(selectNextPhase1Node({ route: 'new_goal', checkpoints: [{ nodeName: 'architect', status: 'failed_terminal', critical: true }] })).toBeNull();
  });

  it('builds truthful status read models', () => {
    const model = buildPhase1StatusReadModel({
      context: { ...baseContext, awaitingOwnerInput: true },
      checkpoints: [{ nodeName: 'route', status: 'waiting_for_owner', critical: true }],
    });

    expect(model.status).toBe('waiting_for_owner');
    expect(model.waitingForOwner).toBe(true);
  });

  it('exposes critical and optional node classification', () => {
    expect(nodeCriticality('teaching')).toBe(true);
    expect(nodeCriticality('delivery_side_effects')).toBe(false);
  });
});
