"use client";

import { ArrowDown, ArrowUp, Flag, MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  DIRECTION_LABELS,
  STANCE_LABELS,
  TRICK_CATEGORY_LABELS,
  obstacleName,
  type CalendarEventOption,
  type Direction,
  type Obstacle,
  type Point,
  type Stance,
  type Trick,
  type TrickCategory,
} from "@/domain/parks";
import type { ScenePlacement } from "./park-scene";
import styles from "./parks.module.css";

export interface DraftStep {
  /** Nur lokal für React-Keys; die Datenbank vergibt eigene IDs. */
  key: string;
  obstacle_id: string;
  trick_id: string | null;
  trick_name: string;
  stance: Stance | null;
  direction: Direction | null;
  note: string;
}

export interface RunDraft {
  run_id: string;
  revision: number;
  park_version_id: string;
  athlete_user_id: string;
  title: string;
  event_id: string | null;
  start: Point;
  end: Point;
  target_score: string;
  actual_score: string;
  note: string;
  steps: DraftStep[];
}

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Trick-Eingabe mit Katalogvorschlägen; unbekannte Namen können vorgeschlagen werden. */
function TrickInput({
  step,
  tricks,
  busy,
  onChange,
  onSuggest,
}: {
  step: DraftStep;
  tricks: Trick[];
  busy: boolean;
  onChange: (patch: Partial<DraftStep>) => void;
  onSuggest: (name: string, category: TrickCategory) => void;
}) {
  const [category, setCategory] = useState<TrickCategory>("other");
  const unknown = step.trick_name.trim() !== "" && !step.trick_id;
  const pending = tricks.find((t) => t.id === step.trick_id)?.status === "pending";
  return (
    <div className={styles.form}>
      <label className={styles.field}>
        Trick
        <input
          list="park-trick-options"
          value={step.trick_name}
          placeholder="z. B. Boardslide"
          maxLength={80}
          onChange={(e) => {
            const name = e.target.value;
            const match = tricks.find(
              (t) => t.name.toLowerCase() === name.trim().toLowerCase(),
            );
            onChange({ trick_name: name, trick_id: match?.id ?? null });
          }}
        />
      </label>
      {pending ? (
        <p className={styles.muted}>Eigener Vorschlag – für andere erst nach Freigabe sichtbar.</p>
      ) : null}
      {unknown ? (
        <div className={styles.hint}>
          „{step.trick_name.trim()}“ ist noch nicht im Katalog.
          <div className={styles.row} style={{ marginTop: 8 }}>
            <select
              aria-label="Kategorie des neuen Tricks"
              value={category}
              onChange={(e) => setCategory(e.target.value as TrickCategory)}
              className={styles.button}
            >
              {Object.entries(TRICK_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => onSuggest(step.trick_name.trim(), category)}
            >
              Vorschlagen und verwenden
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Run-Editor: Athlet, Termin, Start/Ende, geordnete Schritte und optionale Scores.
 * Ein Tipp auf ein Obstacle in der Szene fügt einen Schritt hinzu.
 */
export function RunEditorPanel({
  draft,
  obstacles,
  tricks,
  events,
  athletes,
  isNew,
  outdatedVersion,
  missingSteps,
  placing,
  activeStep,
  busy,
  onChange,
  onPlace,
  onActiveStep,
  onSuggestTrick,
  onUseLatestVersion,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: RunDraft;
  obstacles: Obstacle[];
  tricks: Trick[];
  events: CalendarEventOption[];
  athletes: { id: string; name: string }[];
  isNew: boolean;
  outdatedVersion: number | null;
  missingSteps: number[];
  placing: ScenePlacement;
  activeStep: number | null;
  busy: boolean;
  onChange: (draft: RunDraft) => void;
  onPlace: (placing: ScenePlacement) => void;
  onActiveStep: (index: number | null) => void;
  onSuggestTrick: (index: number, name: string, category: TrickCategory) => void;
  onUseLatestVersion: (() => void) | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const set = (patch: Partial<RunDraft>) => onChange({ ...draft, ...patch });
  const setStep = (index: number, patch: Partial<DraftStep>) =>
    set({ steps: draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    set({ steps });
    onActiveStep(target);
  };
  const byId = new Map(obstacles.map((o) => [o.id, o]));

  return (
    <div className={styles.panel}>
      <datalist id="park-trick-options">
        {tricks.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      <div>
        <h2>{isNew ? "Run planen" : "Run bearbeiten"}</h2>
        <p className={styles.muted}>
          Tippe im Park auf ein Obstacle, um einen Trick hinzuzufügen. Mehrere Tricks am
          selben Obstacle sind möglich.
        </p>
      </div>

      {outdatedVersion ? (
        <div className={styles.hint}>
          Dieser Run nutzt Parkversion {outdatedVersion}.{" "}
          {onUseLatestVersion ? (
            <button type="button" className={styles.button} onClick={onUseLatestVersion} style={{ marginTop: 8 }}>
              Auf aktuelle Parkversion umstellen
            </button>
          ) : (
            "Einige Obstacles fehlen in der aktuellen Version; der Run bleibt daher auf seiner Version."
          )}
        </div>
      ) : null}

      <div className={styles.form}>
        <label className={styles.field}>
          Titel
          <input value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className={styles.field}>
          Athlet
          <select
            value={draft.athlete_user_id}
            disabled={!isNew}
            onChange={(e) => set({ athlete_user_id: e.target.value })}
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Termin (optional)
          <select
            value={draft.event_id ?? ""}
            onChange={(e) => set({ event_id: e.target.value || null })}
          >
            <option value="">Kein Termin</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.type === "contest" ? "Contest" : "Training"} · {e.title} ·{" "}
                {dateFormat.format(new Date(e.starts_at))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className={styles.form}>
        <h3>Start und Ziel</h3>
        <div className={styles.points}>
          {(["start", "end"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={placing === kind ? styles.pointActive : styles.pointButton}
              aria-pressed={placing === kind}
              onClick={() => onPlace(placing === kind ? null : kind)}
            >
              {kind === "start" ? <MapPin size={16} color="#159447" /> : <Flag size={16} color="#d9363e" />}
              {placing === kind ? "Im Park tippen …" : kind === "start" ? "Start setzen" : "Ziel setzen"}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.form}>
        <h3>Trickfolge ({draft.steps.length})</h3>
        {draft.steps.length === 0 ? (
          <p className={styles.hint}>Noch keine Tricks. Tippe im Park auf das erste Obstacle.</p>
        ) : null}
        <ol className={styles.steps}>
          {draft.steps.map((step, index) => {
            const obstacle = byId.get(step.obstacle_id);
            const missing = missingSteps.includes(index);
            return (
              <li
                key={step.key}
                className={
                  missing ? styles.stepMissing : activeStep === index ? styles.stepActive : styles.step
                }
                onFocus={() => onActiveStep(index)}
                onClick={() => onActiveStep(index)}
              >
                <div className={styles.stepHead}>
                  <span className={styles.number}>{index + 1}</span>
                  <span>
                    {obstacle ? obstacleName(obstacle, obstacles) : "Obstacle fehlt in dieser Version"}
                  </span>
                  <span className={styles.stepTools}>
                    <button type="button" aria-label={`Schritt ${index + 1} nach oben`} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" aria-label={`Schritt ${index + 1} nach unten`} disabled={index === draft.steps.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Schritt ${index + 1} entfernen`}
                      onClick={(e) => {
                        e.stopPropagation();
                        set({ steps: draft.steps.filter((_, i) => i !== index) });
                        onActiveStep(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
                <TrickInput
                  step={step}
                  tricks={tricks}
                  busy={busy}
                  onChange={(patch) => setStep(index, patch)}
                  onSuggest={(name, category) => onSuggestTrick(index, name, category)}
                />
                <div className={styles.twoCols}>
                  <label className={styles.field}>
                    Stance
                    <select
                      value={step.stance ?? ""}
                      onChange={(e) => setStep(index, { stance: (e.target.value || null) as Stance | null })}
                    >
                      <option value="">–</option>
                      {Object.entries(STANCE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    Seite
                    <select
                      value={step.direction ?? ""}
                      onChange={(e) => setStep(index, { direction: (e.target.value || null) as Direction | null })}
                    >
                      <option value="">–</option>
                      {Object.entries(DIRECTION_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {activeStep === index ? (
                  <label className={styles.field}>
                    Notiz
                    <input value={step.note} maxLength={500} onChange={(e) => setStep(index, { note: e.target.value })} />
                  </label>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <details>
        <summary className={styles.muted} style={{ cursor: "pointer", minHeight: 32 }}>
          Scores und Notiz
        </summary>
        <div className={styles.form} style={{ marginTop: 10 }}>
          <div className={styles.twoCols}>
            <label className={styles.field}>
              Ziel-Score
              <input inputMode="decimal" value={draft.target_score} onChange={(e) => set({ target_score: e.target.value })} />
            </label>
            <label className={styles.field}>
              Erhaltener Score
              <input inputMode="decimal" value={draft.actual_score} onChange={(e) => set({ actual_score: e.target.value })} />
            </label>
          </div>
          <label className={styles.field}>
            Notiz
            <textarea value={draft.note} maxLength={2000} onChange={(e) => set({ note: e.target.value })} />
          </label>
        </div>
      </details>

      <div className={styles.actions}>
        {!isNew ? (
          <button type="button" className={styles.danger} onClick={onDelete} disabled={busy} aria-label="Run löschen">
            <Trash2 size={16} />
          </button>
        ) : null}
        <button type="button" className={styles.button} onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className={styles.primary} onClick={onSave} disabled={busy}>
          {busy ? "Speichert …" : "Run speichern"}
        </button>
      </div>
    </div>
  );
}
