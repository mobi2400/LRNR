import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LessonDiagram } from '@/components/lesson/LessonDiagram';

describe('LessonDiagram', () => {
  it('renders a simple Mermaid flow as accessible lesson nodes', () => {
    const html = renderToStaticMarkup(
      createElement(LessonDiagram, {
        diagram: {
          type: 'mermaid',
          content:
            'flowchart LR\n  A[Client] --> B[Load balancer]\n  B --> C[Service]',
        },
      }),
    );

    expect(html).toContain('Lesson concept flow');
    expect(html).toContain('Load balancer');
    expect(html).not.toContain('flowchart LR');
  });

  it('falls back to a readable description for unsupported syntax', () => {
    const html = renderToStaticMarkup(
      createElement(LessonDiagram, {
        diagram: {
          type: 'mermaid',
          content: 'sequenceDiagram\nA->>B: hello',
        },
      }),
    );

    expect(html).toContain('sequenceDiagram');
    expect(html).toContain('lesson-diagram--description');
  });
});
