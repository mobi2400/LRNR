import { z } from 'zod';

import { phase1NodeNameSchema, type Phase1NodeName } from './node-orchestration';

export const phase1CapabilitySchema = z.enum([
  'route:read_state',
  'architect:onboarding_profile',
  'cartographer:source_fetch',
  'cartographer:knowledge_repository',
  'curriculum:roadmap_repository',
  'teaching:lesson_repository',
  'delivery:outbox_repository',
  'rag:memory_repository',
  'observability:workflow_events',
]);

export const forbiddenRawCapabilitySchema = z.enum([
  'raw_db_client',
  'raw_llm_sdk',
  'raw_embedding_sdk',
  'raw_telegram_sdk',
  'raw_redis_client',
]);

const nodeCapabilityRegistry = {
  route: ['route:read_state', 'observability:workflow_events'],
  architect: ['architect:onboarding_profile', 'rag:memory_repository', 'observability:workflow_events'],
  cartographer: ['cartographer:source_fetch', 'cartographer:knowledge_repository', 'observability:workflow_events'],
  curriculum_builder: ['curriculum:roadmap_repository', 'observability:workflow_events'],
  teaching: ['teaching:lesson_repository', 'rag:memory_repository', 'observability:workflow_events'],
  lesson_persist: ['teaching:lesson_repository', 'observability:workflow_events'],
  delivery_side_effects: ['delivery:outbox_repository', 'observability:workflow_events'],
  rag_side_effects: ['rag:memory_repository', 'observability:workflow_events'],
} as const satisfies Record<Phase1NodeName, readonly Phase1Capability[]>;

export type Phase1Capability = z.infer<typeof phase1CapabilitySchema>;
export type ForbiddenRawCapability = z.infer<typeof forbiddenRawCapabilitySchema>;

export function getAllowedPhase1Capabilities(nodeName: Phase1NodeName): readonly Phase1Capability[] {
  const parsed = phase1NodeNameSchema.parse(nodeName);

  return nodeCapabilityRegistry[parsed];
}

export function assertCapabilityAllowed(input: { nodeName: Phase1NodeName; capability: Phase1Capability }): void {
  const parsed = z.object({ nodeName: phase1NodeNameSchema, capability: phase1CapabilitySchema }).parse(input);
  const allowed: readonly Phase1Capability[] = nodeCapabilityRegistry[parsed.nodeName];

  if (!allowed.includes(parsed.capability)) {
    throw new Error(`Capability ${parsed.capability} is not allowed for node ${parsed.nodeName}.`);
  }
}

export function assertNoRawCapabilities(input: { nodeName: Phase1NodeName; requested: string[] }): void {
  const parsed = z.object({ nodeName: phase1NodeNameSchema, requested: z.array(z.string().min(1)) }).parse(input);
  const forbidden = parsed.requested.filter((capability) => forbiddenRawCapabilitySchema.safeParse(capability).success);

  if (forbidden.length > 0) {
    throw new Error(`Node ${parsed.nodeName} requested forbidden raw capabilities: ${forbidden.join(', ')}`);
  }
}

export function validateNodeCapabilityRequest(input: { nodeName: Phase1NodeName; requested: string[] }): Phase1Capability[] {
  assertNoRawCapabilities(input);

  return input.requested.map((capability) => {
    const parsedCapability = phase1CapabilitySchema.parse(capability);
    assertCapabilityAllowed({ nodeName: input.nodeName, capability: parsedCapability });

    return parsedCapability;
  });
}

