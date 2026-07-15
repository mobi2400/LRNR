import { z } from 'zod';

import { lessonPayloadSchema } from '@/schemas/lesson.schema';
import { topicKnowledgeDocumentSchema } from '@/schemas/knowledge.schema';
import { curriculumSessionSchema, layer1RoadmapSchema } from '@/schemas/curriculum.schema';
import { onboardingTopicBlueprintSchema } from '@/schemas/onboarding.schema';

import { phase1NodePolicyRegistry, phase1RouteSchema, type NodeStatus } from './state-machine';

export const phase1NodeNameSchema = z.enum([
  'route',
  'architect',
  'cartographer',
  'curriculum_builder',
  'teaching',
  'lesson_persist',
  'delivery_side_effects',
  'rag_side_effects',
]);

const nodeDependencyMap = {
  route: [],
  architect: ['route'],
  cartographer: ['architect'],
  curriculum_builder: ['cartographer'],
  teaching: ['curriculum_builder'],
  lesson_persist: ['teaching'],
  delivery_side_effects: ['lesson_persist'],
  rag_side_effects: ['lesson_persist'],
} as const satisfies Record<Phase1NodeName, readonly Phase1NodeName[]>;

const nodeOutputSchemas = {
  route: z.object({
    route: phase1RouteSchema,
    reason: z.string().min(1),
  }),
  architect: z.object({
    topicBlueprint: onboardingTopicBlueprintSchema,
    learnerSignals: z.object({
      strengths: z.array(z.string()),
      weakAreas: z.array(z.string()),
      misconceptions: z.array(z.string()),
    }),
  }),
  cartographer: z.object({
    knowledgeDocument: topicKnowledgeDocumentSchema,
  }),
  curriculum_builder: z.object({
    roadmap: layer1RoadmapSchema,
    sessions: z.array(curriculumSessionSchema).min(1),
    currentSessionId: z.string().min(1),
  }),
  teaching: z.object({
    lesson: lessonPayloadSchema,
  }),
  lesson_persist: z.object({
    sessionId: z.string().min(1),
    status: z.literal('ready'),
    revision: z.number().int().min(0),
  }),
  delivery_side_effects: z.object({
    deliveryQueued: z.boolean(),
    idempotencyKey: z.string().min(1),
  }),
  rag_side_effects: z.object({
    ragWriteQueued: z.boolean(),
    idempotencyKey: z.string().min(1),
  }),
} as const satisfies Record<Phase1NodeName, z.ZodType>;

export type Phase1NodeName = z.infer<typeof phase1NodeNameSchema>;
export type Phase1NodeOutput<N extends Phase1NodeName> = z.infer<(typeof nodeOutputSchemas)[N]>;

export interface Phase1NodeCheckpoint {
  nodeName: Phase1NodeName;
  status: NodeStatus;
}

export interface Phase1NodePlanEntry {
  nodeName: Phase1NodeName;
  dependencies: readonly Phase1NodeName[];
  critical: boolean;
  sideEffecting: boolean;
}

export function getPhase1NodeDependencies(nodeName: Phase1NodeName): readonly Phase1NodeName[] {
  const parsed = phase1NodeNameSchema.parse(nodeName);

  return nodeDependencyMap[parsed];
}

export function validatePhase1NodeOutput<N extends Phase1NodeName>(nodeName: N, output: unknown): Phase1NodeOutput<N> {
  const parsedNode = phase1NodeNameSchema.parse(nodeName);
  const schema = nodeOutputSchemas[parsedNode] as (typeof nodeOutputSchemas)[N];

  return schema.parse(output) as Phase1NodeOutput<N>;
}

export function buildPhase1NodePlan(route: z.infer<typeof phase1RouteSchema>): Phase1NodePlanEntry[] {
  const parsedRoute = phase1RouteSchema.parse(route);
  const nodeOrder: Phase1NodeName[] =
    parsedRoute === 'continue_teaching'
      ? ['route', 'teaching', 'lesson_persist', 'delivery_side_effects', 'rag_side_effects']
      : parsedRoute === 'new_goal'
        ? ['route', 'architect', 'cartographer', 'curriculum_builder', 'teaching', 'lesson_persist', 'delivery_side_effects', 'rag_side_effects']
        : ['route'];

  return nodeOrder.map((nodeName) => ({
    nodeName,
    dependencies: nodeDependencyMap[nodeName].filter((dependency) => nodeOrder.includes(dependency)),
    critical: phase1NodePolicyRegistry[nodeName].critical,
    sideEffecting: phase1NodePolicyRegistry[nodeName].sideEffecting,
  }));
}

export function assertNodeDependenciesSatisfied(input: { nodeName: Phase1NodeName; checkpoints: Phase1NodeCheckpoint[] }): void {
  const nodeName = phase1NodeNameSchema.parse(input.nodeName);
  const checkpoints = input.checkpoints.map((checkpoint) => ({
    nodeName: phase1NodeNameSchema.parse(checkpoint.nodeName),
    status: checkpoint.status,
  }));
  const byNode = new Map(checkpoints.map((checkpoint) => [checkpoint.nodeName, checkpoint.status]));
  const missing = nodeDependencyMap[nodeName].filter((dependency) => byNode.get(dependency) !== 'succeeded');

  if (missing.length > 0) {
    throw new Error(`Node ${nodeName} cannot run before dependencies succeed: ${missing.join(', ')}`);
  }
}

export function findReadyFanOutNodes(checkpoints: Phase1NodeCheckpoint[]): Phase1NodeName[] {
  const parsed = checkpoints.map((checkpoint) => ({
    nodeName: phase1NodeNameSchema.parse(checkpoint.nodeName),
    status: checkpoint.status,
  }));
  const byNode = new Map(parsed.map((checkpoint) => [checkpoint.nodeName, checkpoint.status]));

  return (['delivery_side_effects', 'rag_side_effects'] as const).filter((nodeName) => {
    if (byNode.get(nodeName) !== 'ready') {
      return false;
    }

    return nodeDependencyMap[nodeName].every((dependency) => byNode.get(dependency) === 'succeeded');
  });
}
