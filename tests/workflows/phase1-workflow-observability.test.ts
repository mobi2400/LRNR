import { describe, expect, it } from 'vitest';

import {
  assertPhase1DeploymentGate,
  buildWorkflowReliabilityReport,
  buildWorkflowTimeline,
  detectStuckNodes,
  redactWorkflowEvent,
  type WorkflowEvent,
} from '@/workflows/phase1/workflow-observability';

const baseEvent: WorkflowEvent = {
  requestId: 'request-1',
  workflowRunId: 'workflow-1',
  nodeName: 'teaching',
  status: 'running',
  attempt: 0,
  safeErrorCode: null,
  leaseExpiresAt: new Date('2026-01-01T00:01:00Z'),
  occurredAt: new Date('2026-01-01T00:00:00Z'),
};

describe('phase 1 workflow observability', () => {
  it('builds a chronological redacted timeline', () => {
    const timeline = buildWorkflowTimeline([
      { ...baseEvent, occurredAt: new Date('2026-01-01T00:02:00Z'), status: 'succeeded' },
      { ...baseEvent, occurredAt: new Date('2026-01-01T00:00:00Z'), safeErrorCode: 'x'.repeat(200) },
    ]);

    expect(timeline[0]?.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(timeline[0]?.safeErrorCode?.length).toBe(120);
  });

  it('detects nodes whose running lease expired without a terminal event', () => {
    expect(
      detectStuckNodes({
        now: new Date('2026-01-01T00:05:00Z'),
        events: [baseEvent],
      }),
    ).toEqual(['teaching']);
  });

  it('does not mark completed nodes as stuck', () => {
    expect(
      detectStuckNodes({
        now: new Date('2026-01-01T00:05:00Z'),
        events: [baseEvent, { ...baseEvent, status: 'succeeded', occurredAt: new Date('2026-01-01T00:00:30Z') }],
      }),
    ).toEqual([]);
  });

  it('fails the deployment gate for terminal failures or stuck nodes', () => {
    const report = buildWorkflowReliabilityReport({
      workflowRunId: 'workflow-1',
      now: new Date('2026-01-01T00:05:00Z'),
      events: [baseEvent, { ...baseEvent, nodeName: 'cartographer', status: 'failed_terminal', safeErrorCode: 'schema_invalid' }],
    });

    expect(report.deploymentGatePassed).toBe(false);
    expect(report.reasons).toEqual(['terminal_failures_present', 'stuck_nodes_present']);
    expect(() => assertPhase1DeploymentGate(report)).toThrow(/terminal_failures_present/);
  });

  it('passes the deployment gate when workflows complete cleanly', () => {
    const report = buildWorkflowReliabilityReport({
      workflowRunId: 'workflow-1',
      now: new Date('2026-01-01T00:05:00Z'),
      events: [baseEvent, { ...baseEvent, status: 'succeeded', occurredAt: new Date('2026-01-01T00:00:30Z') }],
    });

    expect(report.deploymentGatePassed).toBe(true);
    expect(() => assertPhase1DeploymentGate(report)).not.toThrow();
  });

  it('redacts overlong safe error codes without touching identifiers', () => {
    const event = redactWorkflowEvent({ ...baseEvent, safeErrorCode: 'provider_timeout:' + 'x'.repeat(200) });

    expect(event.requestId).toBe('request-1');
    expect(event.safeErrorCode?.length).toBe(120);
  });
});
