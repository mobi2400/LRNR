import { z } from 'zod';

import { nodeStatusSchema, workflowStatusSchema } from './state-machine';

export const workflowEventSchema = z.object({
  requestId: z.string().min(1),
  workflowRunId: z.string().min(1),
  nodeName: z.string().min(1).nullable(),
  status: workflowStatusSchema.or(nodeStatusSchema),
  attempt: z.number().int().min(0),
  safeErrorCode: z.string().min(1).nullable().default(null),
  leaseExpiresAt: z.date().nullable().default(null),
  occurredAt: z.date(),
});

export const workflowReliabilityReportSchema = z.object({
  workflowRunId: z.string().min(1),
  totalEvents: z.number().int().min(0),
  terminalFailures: z.number().int().min(0),
  retryableFailures: z.number().int().min(0),
  stuckNodes: z.array(z.string()),
  deploymentGatePassed: z.boolean(),
  reasons: z.array(z.string()),
});

export type WorkflowEvent = z.infer<typeof workflowEventSchema>;
export type WorkflowReliabilityReport = z.infer<typeof workflowReliabilityReportSchema>;

export function redactWorkflowEvent(input: WorkflowEvent): WorkflowEvent {
  const parsed = workflowEventSchema.parse(input);

  return workflowEventSchema.parse({
    ...parsed,
    safeErrorCode: parsed.safeErrorCode === null ? null : parsed.safeErrorCode.slice(0, 120),
  });
}

export function buildWorkflowTimeline(events: WorkflowEvent[]): WorkflowEvent[] {
  return events.map(redactWorkflowEvent).sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

export function detectStuckNodes(input: { events: WorkflowEvent[]; now: Date }): string[] {
  const parsed = z.object({ events: z.array(workflowEventSchema), now: z.date() }).parse(input);
  const runningByNode = new Map<string, WorkflowEvent>();

  for (const event of buildWorkflowTimeline(parsed.events)) {
    if (event.nodeName === null) {
      continue;
    }

    if (event.status === 'running') {
      runningByNode.set(event.nodeName, event);
      continue;
    }

    if (['succeeded', 'skipped', 'waiting_for_owner', 'failed_retryable', 'failed_terminal'].includes(event.status)) {
      runningByNode.delete(event.nodeName);
    }
  }

  return [...runningByNode.values()]
    .filter((event) => event.leaseExpiresAt !== null && event.leaseExpiresAt.getTime() < parsed.now.getTime())
    .map((event) => event.nodeName)
    .filter((nodeName): nodeName is string => nodeName !== null);
}

export function buildWorkflowReliabilityReport(input: { workflowRunId: string; events: WorkflowEvent[]; now: Date }): WorkflowReliabilityReport {
  const parsed = z.object({ workflowRunId: z.string().min(1), events: z.array(workflowEventSchema), now: z.date() }).parse(input);
  const timeline = buildWorkflowTimeline(parsed.events);
  const terminalFailures = timeline.filter((event) => event.status === 'failed_terminal').length;
  const retryableFailures = timeline.filter((event) => event.status === 'failed_retryable').length;
  const stuckNodes = detectStuckNodes({ events: timeline, now: parsed.now });
  const reasons = [
    terminalFailures > 0 ? 'terminal_failures_present' : null,
    stuckNodes.length > 0 ? 'stuck_nodes_present' : null,
  ].filter((reason): reason is string => reason !== null);

  return workflowReliabilityReportSchema.parse({
    workflowRunId: parsed.workflowRunId,
    totalEvents: timeline.length,
    terminalFailures,
    retryableFailures,
    stuckNodes,
    deploymentGatePassed: reasons.length === 0,
    reasons,
  });
}

export function assertPhase1DeploymentGate(report: WorkflowReliabilityReport): void {
  const parsed = workflowReliabilityReportSchema.parse(report);

  if (!parsed.deploymentGatePassed) {
    throw new Error(`Phase 1 deployment gate failed: ${parsed.reasons.join(', ')}`);
  }
}
