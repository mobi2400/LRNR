import { describe, expect, it } from 'vitest';

import { ragRepository } from '../../src/db/rag.repo';

describe('rag repository surface', () => {
  it('exposes onboarding and session-summary writers as typed wrappers', () => {
    expect(typeof ragRepository.writeOnboardingSeed).toBe('function');
    expect(typeof ragRepository.writeSessionSummary).toBe('function');
    expect(typeof ragRepository.writeMemories).toBe('function');
  });
});
