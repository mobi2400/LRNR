import { describe, expect, it } from 'vitest';

import {
  assertCapabilityAllowed,
  assertNoRawCapabilities,
  getAllowedPhase1Capabilities,
  validateNodeCapabilityRequest,
} from '@/workflows/phase1/node-capabilities';

describe('phase 1 node capabilities', () => {
  it('exposes wrapper-level capabilities for each node', () => {
    expect(getAllowedPhase1Capabilities('delivery_side_effects')).toContain('delivery:outbox_repository');
    expect(getAllowedPhase1Capabilities('delivery_side_effects')).not.toContain('rag:memory_repository');
  });

  it('rejects capabilities outside a node boundary', () => {
    expect(() =>
      assertCapabilityAllowed({
        nodeName: 'teaching',
        capability: 'delivery:outbox_repository',
      }),
    ).toThrow(/not allowed/);
  });

  it('rejects raw DB and provider SDK access for agents', () => {
    expect(() =>
      assertNoRawCapabilities({
        nodeName: 'cartographer',
        requested: ['cartographer:source_fetch', 'raw_db_client', 'raw_llm_sdk'],
      }),
    ).toThrow(/raw_db_client, raw_llm_sdk/);
  });

  it('validates a complete capability request', () => {
    expect(
      validateNodeCapabilityRequest({
        nodeName: 'rag_side_effects',
        requested: ['rag:memory_repository', 'observability:workflow_events'],
      }),
    ).toEqual(['rag:memory_repository', 'observability:workflow_events']);
  });
});
