import { z } from 'zod';

export const workflowStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_for_owner',
  'no_op',
  'succeeded',
  'failed_retryable',
  'failed_terminal',
  'cancelled',
]);

export const nodeStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'succeeded',
  'skipped',
  'waiting_for_owner',
  'failed_retryable',
  'failed_terminal',
]);

export const phase1RouteSchema = z.enum([
  'new_goal',
  'continue_teaching',
  'waiting_for_onboarding_reply',
  'no_op',
  'safe_failure_alert',
]);

export const workflowErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  stableCategory: z.enum(['transient', 'terminal', 'owner_input', 'safety_gate']),
});

export const workflowStateSchema = z.object({
  workflowRunId: z.string().min(1),
  requestId: z.string().min(1),
  userId: z.string().uuid(),
  route: phase1RouteSchema,
  status: workflowStatusSchema,
  attempt: z.number().int().min(0),
  errors: z.array(workflowErrorSchema).default([]),
});

export const nodeStateSchema = z.object({
  workflowRunId: z.string().min(1),
  nodeName: z.string().min(1),
  status: nodeStatusSchema,
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(10),
  leaseExpiresAt: z.date().nullable().default(null),
  error: workflowErrorSchema.nullable().default(null),
});

export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type WorkflowError = z.infer<typeof workflowErrorSchema>;
export type NodeState = z.infer<typeof nodeStateSchema>;

const legalWorkflowTransitions: Record<WorkflowStatus, WorkflowStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_for_owner', 'no_op', 'succeeded', 'failed_retryable', 'failed_terminal', 'cancelled'],
  waiting_for_owner: ['queued', 'running', 'cancelled'],
  no_op: [],
  succeeded: [],
  failed_retryable: ['queued', 'running', 'failed_terminal', 'cancelled'],
  failed_terminal: [],
  cancelled: [],
};

const legalNodeTransitions: Record<NodeStatus, NodeStatus[]> = {
  pending: ['ready', 'skipped', 'failed_terminal'],
  ready: ['running', 'skipped', 'failed_terminal'],
  running: ['succeeded', 'waiting_for_owner', 'failed_retryable', 'failed_terminal'],
  succeeded: [],
  skipped: [],
  waiting_for_owner: ['ready', 'running', 'failed_terminal'],
  failed_retryable: ['ready', 'running', 'failed_terminal'],
  failed_terminal: [],
};

export const phase1NodePolicyRegistry = {
  route: { critical: true, retryable: false, maxAttempts: 1, sideEffecting: false },
  architect: { critical: true, retryable: true, maxAttempts: 2, sideEffecting: true },
  cartographer: { critical: true, retryable: true, maxAttempts: 2, sideEffecting: true },
  curriculum_builder: { critical: true, retryable: true, maxAttempts: 2, sideEffecting: true },
  teaching: { critical: true, retryable: true, maxAttempts: 2, sideEffecting: true },
  lesson_persist: { critical: true, retryable: true, maxAttempts: 3, sideEffecting: true },
  delivery_side_effects: { critical: false, retryable: true, maxAttempts: 3, sideEffecting: true },
  rag_side_effects: { critical: false, retryable: true, maxAttempts: 3, sideEffecting: true },
} as const;

export function assertWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!legalWorkflowTransitions[from].includes(to)) {
    throw new Error(`Illegal workflow transition: ${from} -> ${to}`);
  }
}

export function assertNodeTransition(from: NodeStatus, to: NodeStatus): void {
  if (!legalNodeTransitions[from].includes(to)) {
    throw new Error(`Illegal node transition: ${from} -> ${to}`);
  }
}

export function classifyWorkflowError(code: string): WorkflowError {
  if (/timeout|rate_limit|redis|network|lease|lock/i.test(code)) {
    return { code, message: code, retryable: true, stableCategory: 'transient' };
  }

  if (/owner|awaiting_input/i.test(code)) {
    return { code, message: code, retryable: false, stableCategory: 'owner_input' };
  }

  if (/quality|citation|safety|schema/i.test(code)) {
    return { code, message: code, retryable: false, stableCategory: 'safety_gate' };
  }

  return { code, message: code, retryable: false, stableCategory: 'terminal' };
}

export function canRetryNode(state: NodeState): boolean {
  const parsed = nodeStateSchema.parse(state);

  return parsed.status === 'failed_retryable' && parsed.attempt < parsed.maxAttempts;
}
