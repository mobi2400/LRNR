import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('lesson page loading behavior', () => {
  it('loads persisted lesson state without importing the teaching generator', () => {
    const source = readFileSync(
      'src/app/(app)/lesson/current/page.tsx',
      'utf8',
    );

    expect(source).toContain("import { getCurrentLesson }");
    expect(source).not.toContain('generateAndPersistCurrentLesson');
    expect(source).not.toContain('@/agents/teaching');
  });
});
