'use client';

import { useState, type JSX } from 'react';

import Link from 'next/link';

export type PathSession = {
  sessionId: string;
  title: string;
  status: string;
  phase: string;
  concepts: string[];
};

type PathMapProps = {
  sessions: PathSession[];
  currentSessionId: string | null;
};

/** Ordered phase bands, matching the design's Foundations / Core / Production. */
const PHASE_BANDS: Array<{ phase: string; label: string }> = [
  { phase: 'foundation', label: 'Foundations' },
  { phase: 'core', label: 'Core loop' },
  { phase: 'practice', label: 'Practice' },
  { phase: 'production', label: 'Production' },
  { phase: 'review', label: 'Review' },
];

const COMPLETED_STATUSES = new Set(['completed']);
const REACHED_STATUSES = new Set(['ready', 'delivered']);

function nodeState(session: PathSession, currentSessionId: string | null): string {
  if (COMPLETED_STATUSES.has(session.status)) {
    return 'done';
  }

  if (session.sessionId === currentSessionId || REACHED_STATUSES.has(session.status)) {
    return 'current';
  }

  if (session.status === 'skipped') {
    return 'skipped';
  }

  return 'planned';
}

const STATE_LABEL: Record<string, string> = {
  done: 'Completed',
  current: 'Next up',
  skipped: 'Skipped',
  planned: 'Not started',
};

/**
 * The design draws a free-form dependency graph with positioned nodes and
 * per-concept mastery. LRNR has neither yet: concept-level mastery is the
 * Evaluation agent's output (Phase 2), and there are no stored graph edges.
 *
 * What is real is the ordered session sequence and each session's status and
 * phase, so the map renders that — same node vocabulary and detail panel as the
 * design, laid out by phase band instead of by invented coordinates.
 */
export function PathMap({ sessions, currentSessionId }: PathMapProps): JSX.Element {
  const initial =
    sessions.find((session) => session.sessionId === currentSessionId) ??
    sessions[0];
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initial?.sessionId,
  );
  const selected =
    sessions.find((session) => session.sessionId === selectedId) ?? initial;
  const bands = PHASE_BANDS.map((band) => ({
    ...band,
    sessions: sessions.filter((session) => session.phase === band.phase),
  })).filter((band) => band.sessions.length > 0);

  return (
    <div className="path-grid">
      <section className="path-main">
        <div className="path-legend">
          <span data-state="done">Completed</span>
          <span data-state="current">Next up</span>
          <span data-state="planned">Not started</span>
        </div>

        <div className="path-map">
          {bands.map((band) => (
            <div className="path-band" key={band.phase}>
              <div className="path-band-label">{band.label}</div>
              <div className="path-band-nodes">
                {band.sessions.map((session) => {
                  const state = nodeState(session, currentSessionId);

                  return (
                    <button
                      key={session.sessionId}
                      type="button"
                      className="path-node"
                      data-state={state}
                      aria-pressed={session.sessionId === selected?.sessionId}
                      onClick={() => {
                        setSelectedId(session.sessionId);
                      }}
                    >
                      {session.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="path-note text-muted">
          Nodes are your real sessions, grouped by phase and coloured by status.
          The design also draws prerequisite edges and per-concept mastery — both
          come from the Evaluation agent in Phase 2, so LRNR does not draw
          dependencies it has not actually computed.
        </p>
      </section>

      <aside className="path-detail" aria-label="Session detail">
        {selected === undefined ? null : (
          <>
            <div
              className="path-detail-card"
              data-state={nodeState(selected, currentSessionId)}
            >
              <div className="path-detail-state">
                {STATE_LABEL[nodeState(selected, currentSessionId)]}
              </div>
              <h2 className="path-detail-title">{selected.title}</h2>
              <p className="path-detail-blurb">
                {selected.concepts.length === 0
                  ? 'This session has no concept tags attached.'
                  : `Covers ${selected.concepts.join(', ')}.`}
              </p>

              <div className="path-detail-stats">
                <div>
                  <div className="path-detail-stat-label text-muted">Status</div>
                  <div className="path-detail-stat-value">{selected.status}</div>
                </div>
                <div>
                  <div className="path-detail-stat-label text-muted">Phase</div>
                  <div className="path-detail-stat-value">{selected.phase}</div>
                </div>
              </div>

              {selected.sessionId === currentSessionId ? (
                <Link
                  className="btn btn-primary btn-block"
                  href="/lesson/current"
                  style={{ marginTop: '18px' }}
                >
                  Open this lesson →
                </Link>
              ) : (
                <p className="path-detail-locked text-muted">
                  Only the current session has a persisted lesson. LRNR prepares
                  one session at a time.
                </p>
              )}
            </div>

            <div className="path-detail-note">
              <p className="text-muted">
                <strong style={{ color: 'var(--color-text)' }}>
                  This map moves.
                </strong>{' '}
                Sessions are rewritten when the curriculum is reconciled — you
                keep a live path, not a fixed syllabus.
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
