"use client";

import {
  Check,
  Copy,
  Grid3x3,
  House,
  Keyboard,
  Move,
  PenTool,
  Redo2,
  RotateCw,
  Scaling,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { SceneCommandInput, TransformState } from "./scene-commands";
import styles from "./parks.module.css";

/** Achsenfarben wie im Gizmo (Blender: X rot, Y grün, Z blau). */
const AXIS = [
  { axis: "x", color: "#e5484d" },
  { axis: "y", color: "#3fa34d" },
  { axis: "z", color: "#3e7bdd" },
] as const;

/**
 * Werkzeugleiste über der 3D-Ansicht. Jede Funktion ist auch per Tastatur erreichbar
 * (siehe Tooltips und „?“); auf Touch-Geräten ersetzen die Knöpfe die Tastenkürzel.
 */
export function StageToolbar({
  mode,
  topView,
  onTopView,
  showGrid,
  onGrid,
  onHelp,
  hasSelection,
  drawing,
  transform,
  canUndo,
  canRedo,
  onCommand,
  onDraw,
  onFinishDrawing,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
}: {
  mode: "view" | "park" | "run";
  topView: boolean;
  onTopView: (top: boolean) => void;
  showGrid: boolean;
  onGrid: (show: boolean) => void;
  onHelp: () => void;
  hasSelection: boolean;
  drawing: boolean;
  transform: TransformState | null;
  canUndo: boolean;
  canRedo: boolean;
  onCommand: (command: SceneCommandInput) => void;
  onDraw: () => void;
  onFinishDrawing: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {mode === "park" ? (
        <div className={styles.editTools} role="toolbar" aria-label="Bearbeitungswerkzeuge">
          {transform ? (
            <>
              {AXIS.map(({ axis, color }) => (
                <button
                  key={axis}
                  type="button"
                  className={styles.toolButton}
                  aria-pressed={transform.axis === axis}
                  title={`Auf Achse ${axis.toUpperCase()} beschränken (Taste ${axis.toUpperCase()})`}
                  style={{ color: transform.axis === axis ? "#fff" : color, background: transform.axis === axis ? color : undefined }}
                  onClick={() => onCommand({ type: "axis", axis })}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
              <button type="button" className={styles.toolButton} title="Übernehmen (Enter)" aria-label="Übernehmen" onClick={() => onCommand({ type: "confirm" })}>
                <Check size={16} />
              </button>
              <button type="button" className={styles.toolButton} title="Abbrechen (Esc)" aria-label="Abbrechen" onClick={() => onCommand({ type: "cancel" })}>
                <X size={16} />
              </button>
            </>
          ) : drawing ? (
            <>
              <button type="button" className={styles.toolButton} onClick={onFinishDrawing} title="Bereich schließen (Enter)">
                <Check size={16} /> Fertig
              </button>
              <button type="button" className={styles.toolButton} onClick={onDraw} title="Zeichnen abbrechen (Esc)">
                <X size={16} /> Abbrechen
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.toolButton} onClick={onDraw} title="Bereich mit Punkten zeichnen (B)">
                <PenTool size={16} /> Bereich zeichnen
              </button>
              {hasSelection ? (
                <>
                  <button type="button" className={styles.toolButton} title="Verschieben (G)" aria-label="Verschieben" onClick={() => onCommand({ type: "transform", kind: "move" })}>
                    <Move size={16} />
                  </button>
                  <button type="button" className={styles.toolButton} title="Drehen (R)" aria-label="Drehen" onClick={() => onCommand({ type: "transform", kind: "rotate" })}>
                    <RotateCw size={16} />
                  </button>
                  <button type="button" className={styles.toolButton} title="Skalieren (S)" aria-label="Skalieren" onClick={() => onCommand({ type: "transform", kind: "scale" })}>
                    <Scaling size={16} />
                  </button>
                  <button type="button" className={styles.toolButton} title="Duplizieren (Umschalt+D)" aria-label="Duplizieren" onClick={onDuplicate}>
                    <Copy size={16} />
                  </button>
                  <button type="button" className={styles.toolButton} title="Löschen (Entf)" aria-label="Löschen" onClick={onDelete}>
                    <Trash2 size={16} />
                  </button>
                </>
              ) : null}
              <button type="button" className={styles.toolButton} title="Rückgängig (⌘/Strg+Z)" aria-label="Rückgängig" disabled={!canUndo} onClick={onUndo}>
                <Undo2 size={16} />
              </button>
              <button type="button" className={styles.toolButton} title="Wiederholen (⌘/Strg+Umschalt+Z)" aria-label="Wiederholen" disabled={!canRedo} onClick={onRedo}>
                <Redo2 size={16} />
              </button>
            </>
          )}
        </div>
      ) : null}
      <div className={styles.stageTools}>
        <button type="button" className={styles.button} aria-pressed={topView} onClick={() => onTopView(!topView)} title="Draufsicht umschalten (7)">
          {topView ? "3D" : "Draufsicht"}
        </button>
        <button type="button" className={styles.toolButton} aria-pressed={showGrid} title="Raster ein/aus (#)" aria-label="Raster ein/aus" onClick={() => onGrid(!showGrid)}>
          <Grid3x3 size={16} />
        </button>
        <button type="button" className={styles.toolButton} title="Ganzen Park zeigen (Pos1)" aria-label="Ganzen Park zeigen" onClick={() => onCommand({ type: "view", view: "home" })}>
          <House size={16} />
        </button>
        <button type="button" className={styles.toolButton} title="Tastenkürzel (?)" aria-label="Tastenkürzel anzeigen" onClick={onHelp}>
          <Keyboard size={16} />
        </button>
      </div>
    </>
  );
}

const SHORTCUTS: { title: string; items: [string, string][] }[] = [
  {
    title: "Ansicht",
    items: [
      ["Linke Maustaste ziehen", "Drehen (3D) bzw. Verschieben (Draufsicht)"],
      ["Rechte Maustaste / zwei Finger", "Verschieben"],
      ["Mausrad / Pinch", "Zoomen zum Mauszeiger"],
      ["7 · 1 · 3", "Draufsicht · Vorderansicht · Seitenansicht"],
      ["Pos1", "Ganzen Park zeigen"],
      ["F", "Auswahl zentrieren"],
      ["#", "Raster ein/aus"],
      ["Achsen-Gizmo", "Klick auf X/Y/Z richtet die Ansicht aus"],
    ],
  },
  {
    title: "Bearbeiten (Park bearbeiten)",
    items: [
      ["G · R · S", "Verschieben · Drehen · Skalieren"],
      ["danach X · Y · Z", "Auf Achse beschränken (R+X/Y kippt)"],
      ["danach Zahl", "Exakter Wert in m, ° bzw. Faktor"],
      ["Enter / Klick", "Übernehmen"],
      ["Esc / Rechtsklick", "Abbrechen"],
      ["⌘/Strg gedrückt", "Ohne Raster (frei)"],
      ["Umschalt+D", "Duplizieren und verschieben"],
      ["Entf", "Löschen"],
      ["⌘/Strg+Z · ⌘/Strg+Umschalt+Z", "Rückgängig · Wiederholen"],
    ],
  },
  {
    title: "Bereiche",
    items: [
      ["B", "Bereich mit Punkten zeichnen"],
      ["Klick", "Punkt setzen"],
      ["Ersten Punkt, Doppelklick, Enter", "Bereich schließen"],
      ["Rücktaste", "Letzten Punkt entfernen"],
      ["Punkt ziehen", "Ecke verschieben"],
      ["Kantenmitte ziehen", "Neuen Punkt einfügen"],
      ["Doppelklick / Alt+Klick auf Punkt", "Punkt entfernen"],
    ],
  },
];

/** Übersicht aller Tastenkürzel (Taste „?“). */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.shortcutHelp} role="dialog" aria-label="Tastenkürzel">
      <div className={styles.row} style={{ justifyContent: "space-between" }}>
        <strong>Steuerung & Tastenkürzel</strong>
        <button type="button" className={styles.toolButton} aria-label="Schließen" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {SHORTCUTS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <dl>
            {group.items.map(([key, text]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
