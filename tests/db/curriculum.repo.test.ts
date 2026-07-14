import { describe, expect, it } from 'vitest';

import {
  applyLessonToSession,
  applySessionStatusUpdate,
} from '../../src/db/curriculum.repo';

describe('curriculum repository helpers', () => {
  it('updates only the targeted session status', () => {
    const updated = applySessionStatusUpdate(
      [
        { id: 'session-01', status: 'ready', title: 'A' },
        { id: 'session-02', status: 'planned', title: 'B' },
      ],
      {
        sessionId: 'session-02',
        status: 'delivered',
      },
    );

    expect(updated).toEqual([
      { id: 'session-01', status: 'ready', title: 'A' },
      { id: 'session-02', status: 'delivered', title: 'B' },
    ]);
  });

  it('attaches a generated lesson payload to the targeted session', () => {
    const updated = applyLessonToSession(
      [
        { id: 'session-01', status: 'ready' },
        { id: 'session-02', status: 'planned' },
      ],
      {
        sessionId: 'session-01',
        lesson: {
          title: 'Lesson 1',
          objective: 'Understand the repo layer',
        },
      },
    );

    expect(updated[0]).toMatchObject({
      id: 'session-01',
      lesson: {
        title: 'Lesson 1',
      },
    });
    expect(updated[1]).toMatchObject({
      id: 'session-02',
      status: 'planned',
    });
  });
});
