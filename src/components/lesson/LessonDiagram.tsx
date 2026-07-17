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

  for (const line of lines) {
    const edge = line.match(
      /^([A-Za-z0-9_]+)(?:\[([^\]]+)\])?\s*--?>\s*([A-Za-z0-9_]+)(?:\[([^\]]+)\])?$/,
    );

    if (edge === null) {
      return null;
    }

    const [, fromId, fromLabel, toId, toLabel] = edge;

    if (fromId === undefined || toId === undefined) {
      return null;
    }

    if (fromLabel !== undefined) labels.set(fromId, fromLabel);
    if (toLabel !== undefined) labels.set(toId, toLabel);
    if (!order.includes(fromId)) order.push(fromId);
    if (!order.includes(toId)) order.push(toId);
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
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
