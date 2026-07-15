import { z } from 'zod';

import {
  phase1NodePolicyRegistry,
  phase1RouteSchema,
  workflowStatusSchema,
  nodeStatusSchema,
  type NodeStatus,
} from './state-machine';

const workflowContextSchema = z.object({
  userId: z.string().uuid(),
  requestId: z.string().min(1),
  workflowRunId: z.string().min(1),
  hasWorkflowLock: z.boolean().default(false),
  awaitingOwnerInput: z.boolean().default(false),
  hasActiveTopic: z.boolean().default(false),
  hasReadySession: z.boolean().default(false),
  newlySubmittedGoal: z.boolean().default(false),
});

const checkpointSchema = z.object({
  nodeName: z.string().min(1),
  status: nodeStatusSchema,
  critical: z.boolean(),
  updatedAt: z.date().default(() => new Date()),
});

export const workflowStatusReadModelSchema = z.object({
  workflowRunId: z.string(),
  route: phase1RouteSchema,
  status: workflowStatusSchema,
  nextNode: z.string().nullable(),
  completedNodes: z.array(z.string()),
  failedCriticalNodes: z.array(z.string()),
  waitingForOwner: z.boolean(),
});

export type WorkflowContext = z.input<typeof workflowContextSchema>;
export type WorkflowCheckpoint = z.input<typeof checkpointSchema>;
export type WorkflowStatusReadModel = z.infer<typeof workflowStatusReadModelSchema>;

const routeNodeOrder = {
  new_goal: ['route', 'architect', 'cartographer', 'curriculum_builder', 'teaching', 'lesson_persist', 'delivery_side_effects', 'rag_side_effects'],
  continue_teaching: ['route', 'teaching', 'lesson_persist', 'delivery_side_effects', 'rag_side_effects'],
  waiting_for_onboarding_reply: ['route'],
  no_op: ['route'],
  safe_failure_alert: ['route'],
} as const;

export function decidePhase1Route(context: WorkflowContext) {
  const parsed = workflowContextSchema.parse(context);

  if (parsed.hasWorkflowLock) {
    return { route: 'no_op' as const, reason: 'workflow_already_running' };
  }

  if (parsed.awaitingOwnerInput) {
    return { route: 'waiting_for_onboarding_reply' as const, reason: 'owner_input_required' };
  }

  if (parsed.newlySubmittedGoal || !parsed.hasActiveTopic) {
    return { route: 'new_goal' as const, reason: 'new_goal_required' };
  }

  if (parsed.hasReadySession) {
    return { route: 'continue_teaching' as const, reason: 'ready_session_available' };
  }

  return { route: 'no_op' as const, reason: 'nothing_safe_to_do' };
}

export function selectNextPhase1Node(input: { route: z.infer<typeof phase1RouteSchema>; checkpoints: WorkflowCheckpoint[] }): string | null {
  const checkpoints = input.checkpoints.map((checkpoint) => checkpointSchema.parse(checkpoint));

  if (checkpoints.some((checkpoint) => checkpoint.status === 'waiting_for_owner')) {
    return null;
  }

  if (checkpoints.some((checkpoint) => checkpoint.critical && checkpoint.status === 'failed_terminal')) {
    return null;
  }

  const byNode = new Map(checkpoints.map((checkpoint) => [checkpoint.nodeName, checkpoint]));

  for (const nodeName of routeNodeOrder[input.route]) {
    const checkpoint = byNode.get(nodeName);

    if (checkpoint?.status === 'succeeded' || checkpoint?.status === 'skipped') {
      continue;
    }

    if (checkpoint?.status === 'waiting_for_owner') {
      return null;
    }

    if (checkpoint?.status === 'failed_terminal' && checkpoint.critical) {
      return null;
    }

    return nodeName;
  }

  return null;
}

export function buildPhase1StatusReadModel(input: { context: WorkflowContext; checkpoints: WorkflowCheckpoint[] }): WorkflowStatusReadModel {
  const route = decidePhase1Route(input.context).route;
  const checkpoints = input.checkpoints.map((checkpoint) => checkpointSchema.parse(checkpoint));
  const nextNode = selectNextPhase1Node({ route, checkpoints });
  const failedCriticalNodes = checkpoints
    .filter((checkpoint) => checkpoint.critical && checkpoint.status === 'failed_terminal')
    .map((checkpoint) => checkpoint.nodeName);
  const waitingForOwner = checkpoints.some((checkpoint) => checkpoint.status === 'waiting_for_owner') || route === 'waiting_for_onboarding_reply';
  const status =
    failedCriticalNodes.length > 0
      ? 'failed_terminal'
      : waitingForOwner
        ? 'waiting_for_owner'
        : nextNode === null
          ? route === 'no_op'
            ? 'no_op'
            : 'succeeded'
          : 'running';

  return workflowStatusReadModelSchema.parse({
    workflowRunId: workflowContextSchema.parse(input.context).workflowRunId,
    route,
    status,
    nextNode,
    completedNodes: checkpoints.filter((checkpoint) => checkpoint.status === 'succeeded').map((checkpoint) => checkpoint.nodeName),
    failedCriticalNodes,
    waitingForOwner,
  });
}

export function nodeCriticality(nodeName: keyof typeof phase1NodePolicyRegistry): boolean {
  return phase1NodePolicyRegistry[nodeName].critical;
}
