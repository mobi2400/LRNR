'use client';

import { useCallback, useMemo, useState, type JSX } from 'react';

import {
  DAILY_MINUTES_OPTIONS,
  type DailyMinutes,
  type OwnerSettings,
} from '@/schemas/settings.schema';

type SettingsViewProps = {
  identity: string;
  accessMode: string;
  initialSettings: OwnerSettings;
};

type SectionId = 'owner' | 'rhythm' | 'field' | 'mastery' | 'data';

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'owner', label: 'Owner' },
  { id: 'rhythm', label: 'Daily rhythm' },
  { id: 'field', label: 'Field news' },
  { id: 'mastery', label: 'Mastery model' },
  { id: 'data', label: 'Data & privacy' },
];

/**
 * Marks a control whose backend does not exist in Phase 1. The design shows
 * these as live switches; shipping them that way would be a lie, so they keep
 * the visual language but are inert and labelled.
 */
function Pending({ phase }: { phase: string }): JSX.Element {
  return <span className="m-pending">{phase}</span>;
}

function Row({
  title,
  note,
  children,
  danger,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  danger?: boolean;
}): JSX.Element {
  return (
    <div className={danger === true ? 'set-row set-row--danger' : 'set-row'}>
      <div>
        <div className="set-row-title">{title}</div>
        <div className="set-row-note text-muted">{note}</div>
      </div>
      <div className="set-row-controls">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="m-toggle"
      disabled={disabled === true}
      onClick={() => onChange?.(!checked)}
    >
      <span className="m-knob" />
    </button>
  );
}

export function SettingsView({
  identity,
  accessMode,
  initialSettings,
}: SettingsViewProps): JSX.Element {
  const [saved, setSaved] = useState<OwnerSettings>(initialSettings);
  const [draft, setDraft] = useState<OwnerSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isErasing, setIsErasing] = useState(false);

  const isDirty = useMemo(
    () =>
      draft.dailyMinutes !== saved.dailyMinutes ||
      draft.dailyNudgeEnabled !== saved.dailyNudgeEnabled,
    [draft, saved],
  );

  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dailyMinutes: draft.dailyMinutes,
          dailyNudgeEnabled: draft.dailyNudgeEnabled,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: OwnerSettings;
        error?: { message?: string };
      };

      if (!response.ok || body.ok !== true || body.data === undefined) {
        throw new Error(body.error?.message ?? 'Settings could not be saved.');
      }

      setSaved(body.data);
      setDraft(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Settings could not be saved.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [draft]);

  return (
    <div className="settings-modernist">
      <header className="m-header">
        <div>
          <p className="m-eyebrow">Workspace</p>
          <h1 className="m-title">SETTINGS</h1>
          <p className="m-subtitle text-muted">
            How LRNR runs your university · single owner, this device
          </p>
        </div>
        {isDirty || error !== null ? (
          <div className="set-save">
            {error === null ? (
              <span className="set-save-label">Unsaved changes</span>
            ) : (
              <span className="set-error" role="alert">
                {error}
              </span>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void save();
              }}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : null}
      </header>

      <div className="set-body">
        <nav className="set-toc" aria-label="Settings sections">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="set-sections">
          <section className="set-section" aria-labelledby="owner">
            <h2 id="owner">Owner</h2>
            <p className="set-section-intro text-muted">
              This install belongs to one person. Phase 1 is single-owner by
              design — no seats, no sharing.
            </p>
            <div className="set-rows">
              <Row
                title="Identity"
                note={`${identity} · ${accessMode} access, never synced`}
              >
                <Pending phase="Read only" />
              </Row>
              <Row
                title="Recovery key"
                note="The only way back into an encrypted workspace. Store it offline."
              >
                <Pending phase="Phase 2" />
                <button type="button" className="btn btn-secondary" disabled>
                  Reveal key
                </button>
              </Row>
              <Row
                title="Change passphrase"
                note="Re-encrypts everything on this device."
              >
                <Pending phase="Phase 2" />
                <button type="button" className="btn btn-secondary" disabled>
                  Change
                </button>
              </Row>
            </div>
          </section>

          <section className="set-section" aria-labelledby="rhythm">
            <h2 id="rhythm">Daily rhythm</h2>
            <p className="set-section-intro text-muted">
              The streak is the product. LRNR sizes each day&apos;s single next
              action to the time you actually give it.
            </p>
            <div className="set-rows">
              <Row
                title="Minutes a day"
                note="Sessions are cut to fit this — honesty beats ambition. The Curriculum Builder reads this when it plans each session."
              >
                <div
                  role="group"
                  aria-label="Minutes a day"
                  className="set-row-controls"
                >
                  {DAILY_MINUTES_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className="m-seg"
                      aria-pressed={draft.dailyMinutes === minutes}
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          dailyMinutes: minutes as DailyMinutes,
                        }));
                      }}
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                title="Daily nudge"
                note={
                  draft.telegramConfigured
                    ? 'One reminder when today’s move is ready — never a stream.'
                    : 'One reminder when today’s move is ready. Telegram delivery is not configured yet, so nothing will send.'
                }
              >
                <span className="text-muted set-save-label">
                  {draft.dailyNudgeEnabled ? 'On lesson ready' : 'Off'}
                </span>
                <Toggle
                  label="Daily nudge"
                  checked={draft.dailyNudgeEnabled}
                  onChange={(next) => {
                    setDraft((current) => ({
                      ...current,
                      dailyNudgeEnabled: next,
                    }));
                  }}
                />
              </Row>
              <Row
                title="Streak protection"
                note="One skipped day won’t break a 12-day streak — LRNR holds it once a week."
              >
                <Pending phase="Phase 2" />
                <Toggle label="Streak protection" checked={false} disabled />
              </Row>
            </div>
          </section>

          <section className="set-section" aria-labelledby="field">
            <h2 id="field">Field news</h2>
            <p className="set-section-intro text-muted">
              What keeps your course from going out of date. LRNR scores
              developments against your path and folds the relevant ones into
              lessons. Scout and News Intelligence arrive in Phase 3.
            </p>
            <div className="set-rows">
              <Row
                title="Relevance threshold"
                note="How close a development must be to your concepts before it surfaces."
              >
                <Pending phase="Phase 3" />
                <div role="group" aria-label="Relevance threshold">
                  {['Everything', 'Nearby', 'Direct hits'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="m-seg"
                      aria-pressed={false}
                      disabled
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                title="Fold changes into lessons"
                note="Rewrite affected lessons when the field moves — e.g. LangGraph 0.3."
              >
                <Pending phase="Phase 3" />
                <Toggle
                  label="Fold changes into lessons"
                  checked={false}
                  disabled
                />
              </Row>
              <Row
                title="Trusted sources only"
                note="Restrict the feed to high-trust origins (official docs, primary papers)."
              >
                <Pending phase="Phase 3" />
                <Toggle label="Trusted sources only" checked={false} disabled />
              </Row>
            </div>
          </section>

          <section className="set-section" aria-labelledby="mastery">
            <h2 id="mastery">Mastery model</h2>
            <p className="set-section-intro text-muted">
              You finish at mastery, not at 100% of a checklist. Tuning arrives
              with the Evaluation agent in Phase 2.
            </p>
            <div className="set-rows">
              <Row
                title="Rigor"
                note="Lenient marks mastery sooner; strict demands repeated clean probes."
              >
                <Pending phase="Phase 2" />
                <div role="group" aria-label="Rigor">
                  {['Lenient', 'Standard', 'Strict'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="m-seg"
                      aria-pressed={false}
                      disabled
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                title="Watch for decay"
                note="Route mastered concepts back to review before they slip."
              >
                <Pending phase="Phase 2" />
                <Toggle label="Watch for decay" checked={false} disabled />
              </Row>
            </div>
          </section>

          <section className="set-section" aria-labelledby="data">
            <h2 id="data">Data &amp; privacy</h2>
            <p className="set-section-intro text-muted">
              Your learning data lives in your own Supabase project and never
              reaches us. Field research is fetched read-only.
            </p>
            <div className="set-rows set-rows--opening">
              <Row
                title="Export workspace"
                note="A single encrypted file — your whole university, portable."
              >
                <Pending phase="Phase 2" />
                <button type="button" className="btn btn-secondary" disabled>
                  Export
                </button>
              </Row>
              <Row
                title="Reset a concept"
                note="Clear mastery on one concept and relearn from scratch."
              >
                <Pending phase="Phase 2" />
                <button type="button" className="btn btn-secondary" disabled>
                  Choose
                </button>
              </Row>
              <Row
                danger
                title="Erase workspace"
                note="Permanently delete this university and all progress. No recovery."
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-danger"
                  onClick={() => {
                    setIsErasing(true);
                  }}
                >
                  Erase…
                </button>
              </Row>
            </div>
            <div className="set-footnote">
              <p className="text-muted">
                LRNR is local-first in spirit: research sources are fetched
                read-only, and your progress, notes and probes stay in the
                database you own.
              </p>
            </div>
          </section>
        </div>
      </div>

      {isErasing ? (
        <div
          className="m-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="erase-title"
        >
          <div className="m-dialog">
            <h2 className="m-dialog-title" id="erase-title">
              Erase this workspace?
            </h2>
            <p className="m-dialog-body">
              This would delete your entire university — every mastered concept,
              your path, and every note and probe — permanently. Workspace erase
              is not implemented in Phase 1, so nothing will be deleted.
            </p>
            <div className="m-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setIsErasing(false);
                }}
              >
                Keep it
              </button>
              <button type="button" className="btn btn-primary" disabled>
                Erase permanently
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
