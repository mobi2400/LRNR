import React, { type JSX } from 'react';

import type { LessonPayload } from '@/schemas/lesson.schema';

type Diagram = LessonPayload['diagram'];

function parseMermaidFlow(content: string): string[] | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('flowchart'));
  const labels = new Map<string, string>();
  const order: string[] = [];

  function parseNode(token: string): { id: string; label?: string } | null {
    const node = token
      .trim()
      .match(
        /^([A-Za-z0-9_]+)(?:\[\(?([^\]\)]+)\)?\]|\(([^)]+)\)|\{([^}]+)\})?$/,
      );

    if (node === null || node[1] === undefined) return null;

    const label = node[2] ?? node[3] ?? node[4];
    return label === undefined ? { id: node[1] } : { id: node[1], label };
  }

  for (const line of lines) {
    const edge = line.match(/^(.+?)\s*--?>\s*(.+)$/);
    const from = edge?.[1] === undefined ? null : parseNode(edge[1]);
    const to = edge?.[2] === undefined ? null : parseNode(edge[2]);

    if (from === null || to === null) return null;

    if (from.label !== undefined) labels.set(from.id, from.label);
    if (to.label !== undefined) labels.set(to.id, to.label);
    if (!order.includes(from.id)) order.push(from.id);
    if (!order.includes(to.id)) order.push(to.id);
  }

  const resolved = order
    .map((id) => labels.get(id))
    .filter(Boolean) as string[];

  return resolved.length >= 2 ? resolved : null;
}

export function LessonDiagram({ diagram }: { diagram: Diagram }): JSX.Element {
  const nodes =
    diagram.type === 'mermaid' ? parseMermaidFlow(diagram.content) : null;

  if (nodes === null) {
    return (
      <div className="lesson-diagram lesson-diagram--description">
        <p>{diagram.content}</p>
      </div>
    );
  }

  return (
    <ol
      className="lesson-diagram lesson-diagram-flow"
      aria-label="Lesson concept flow"
    >
      {nodes.map((node, index) => (
        <li className="lesson-diagram-step" key={`${node}-${index}`}>
          <span className="lesson-diagram-node">{node}</span>
          {index === nodes.length - 1 ? null : (
            <span className="lesson-diagram-arrow" aria-hidden="true">
              &rarr;
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
