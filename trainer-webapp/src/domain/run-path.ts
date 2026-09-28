/**
 * Fahrlinie eines Runs mit frei gesetzten Zwischenpunkten (kurvige Linie) und der
 * Zeitplan für die Run-Animation. Rein rechnerisch, damit alles in Node-Tests prüfbar bleibt.
 *
 * Gespeichert werden Zwischenpunkte im Startpunkt des Runs (`start_point.path`), damit
 * bestehende Runs und die Speicherfunktion unverändert gültig bleiben.
 */
import type { Obstacle, Point, RunStep } from "@/domain/parks";

/** Zwischenpunkt auf Abschnitt `seg` (0 = Start → erstes Obstacle, … letzter = → Ziel). */
export interface Waypoint {
  x: number;
  z: number;
  seg: number;
}

/** Höchstzahl gespeicherter Zwischenpunkte (auch in der Datenbank geprüft). */
export const MAX_WAYPOINTS = 40;

export type ControlKind = "start" | "obstacle" | "via" | "end";
export interface RunControl {
  x: number;
  z: number;
  kind: ControlKind;
  /** Abschnitt, der an diesem Punkt beginnt (bei `via`: der eigene Abschnitt). */
  seg: number;
  obstacleId?: string;
  /** Index im Zwischenpunkt-Array (nur `via`). */
  viaIndex?: number;
  /** Schritte (Index in der Trickfolge), die an diesem Obstacle gefahren werden. */
  steps?: number[];
  /** Punkt stammt aus der gespeicherten Tippposition des Tricks (nicht aus der Obstacle-Mitte). */
  spotted?: boolean;
}

/** Schritt mit optionaler Tippposition (dort wird der Trick gefahren). */
export type SpottedStep = Pick<RunStep, "obstacle_id"> & { point?: Point | null };

/** Anzahl der Abschnitte (Start → Tricks → Ziel) für eine Kontrollpunktliste. */
export function segmentCount(controls: RunControl[]): number {
  return controls.filter((c) => c.kind === "obstacle").length + 1;
}

/** Zwischenpunkte stabil nach Abschnitt sortieren und auf gültige Abschnitte begrenzen. */
export function normalizeWaypoints(via: Waypoint[], segments: number): Waypoint[] {
  const last = Math.max(0, segments - 1);
  return via
    .map((w, i) => ({ w: { x: w.x, z: w.z, seg: Math.min(last, Math.max(0, Math.floor(w.seg))) }, i }))
    .sort((a, b) => a.w.seg - b.w.seg || a.i - b.i)
    .map(({ w }) => w)
    .slice(0, MAX_WAYPOINTS);
}

/**
 * Kontrollpunkte der Linie: Start → (Zwischenpunkte) → Tricks in Schrittreihenfolge →
 * (Zwischenpunkte) → Ziel. Ein Trick mit Tippposition liegt genau dort; ohne Tippposition
 * (ältere Runs) zählen aufeinanderfolgende Schritte am selben Obstacle einmal (Mitte).
 * Start/Ziel dürfen fehlen, solange sie beim Planen noch nicht gesetzt sind.
 */
export function runControls(
  start: Point | null,
  end: Point | null,
  steps: SpottedStep[],
  obstacles: Obstacle[],
  via: Waypoint[] = [],
): RunControl[] {
  const byId = new Map(obstacles.map((o) => [o.id, o]));
  const visits: RunControl[] = [];
  steps.forEach((step, index) => {
    const o = byId.get(step.obstacle_id);
    if (!o) return;
    const spot = step.point ?? null;
    const previous = visits[visits.length - 1];
    if (previous && !spot && !previous.spotted && previous.obstacleId === o.id) previous.steps!.push(index);
    else
      visits.push({
        x: spot?.x ?? o.x,
        z: spot?.z ?? o.z,
        kind: "obstacle",
        seg: visits.length + 1,
        obstacleId: o.id,
        steps: [index],
        spotted: Boolean(spot),
      });
  });
  const segments = visits.length + 1;
  const sorted = normalizeWaypoints(via, segments);
  const controls: RunControl[] = start ? [{ x: start.x, z: start.z, kind: "start", seg: 0 }] : [];
  let v = 0;
  for (let seg = 0; seg < segments; seg++) {
    while (v < sorted.length && sorted[v].seg === seg) {
      controls.push({ x: sorted[v].x, z: sorted[v].z, kind: "via", seg, viaIndex: v });
      v++;
    }
    if (seg < visits.length) controls.push(visits[seg]);
  }
  if (end) controls.push({ x: end.x, z: end.z, kind: "end", seg: segments });
  return controls;
}

/** Fügt nach Kontrollpunkt `after` einen Zwischenpunkt ein; gibt neue Liste und dessen Index zurück. */
export function insertWaypoint(
  via: Waypoint[],
  controls: RunControl[],
  after: number,
  point: Point,
): { via: Waypoint[]; index: number } {
  const c = controls[after];
  const segments = segmentCount(controls);
  const sorted = normalizeWaypoints(via, segments);
  if (sorted.length >= MAX_WAYPOINTS) return { via: sorted, index: -1 };
  const index = c.kind === "via" ? c.viaIndex! + 1 : sorted.filter((w) => w.seg < c.seg).length;
  const next = [...sorted];
  next.splice(index, 0, { x: point.x, z: point.z, seg: c.seg });
  return { via: next, index };
}

/** Verschiebt einen Zwischenpunkt. */
export function moveWaypoint(via: Waypoint[], index: number, point: Point): Waypoint[] {
  return via.map((w, i) => (i === index ? { ...w, x: point.x, z: point.z } : w));
}

/** Entfernt einen Zwischenpunkt. */
export function removeWaypoint(via: Waypoint[], index: number): Waypoint[] {
  return via.filter((_, i) => i !== index);
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/** Abschnitt des Zeitplans: Fahrt entlang der Linie oder kurzes Verweilen für einen Trick. */
export type PlayPhase =
  | { kind: "move"; from: number; to: number; duration: number }
  | { kind: "trick"; at: number; step: number; duration: number };

/**
 * Zeitplan der Run-Animation. `stops` sind die Positionen der Obstacles entlang der Linie
 * (0 … 1, Anteil der Länge) mit den dort gefahrenen Schritten.
 * Tempo ca. 5 m/s, Gesamtfahrt zwischen 4 und 20 s; je Trick 0,8 s Pause.
 */
export function playSchedule(
  length: number,
  stops: { at: number; steps: number[] }[],
  options: { speed?: number; trick?: number } = {},
): PlayPhase[] {
  const speed = options.speed ?? 5;
  const trick = options.trick ?? 0.8;
  const travel = Math.min(20, Math.max(4, length / speed));
  const phases: PlayPhase[] = [];
  let position = 0;
  for (const stop of [...stops].sort((a, b) => a.at - b.at)) {
    if (stop.at > position) phases.push({ kind: "move", from: position, to: stop.at, duration: (stop.at - position) * travel });
    for (const step of stop.steps) phases.push({ kind: "trick", at: stop.at, step, duration: trick });
    position = Math.max(position, stop.at);
  }
  if (position < 1) phases.push({ kind: "move", from: position, to: 1, duration: (1 - position) * travel });
  return phases;
}

/** Zustand der Animation nach `elapsed` Sekunden: Position auf der Linie und aktiver Trick. */
export function playState(
  phases: PlayPhase[],
  elapsed: number,
): { at: number; step: number | null; done: boolean } {
  let t = Math.max(0, elapsed);
  for (const phase of phases) {
    if (t <= phase.duration) {
      if (phase.kind === "trick") return { at: phase.at, step: phase.step, done: false };
      const f = phase.duration > 0 ? t / phase.duration : 1;
      // Sanftes Anfahren/Abbremsen je Abschnitt.
      const eased = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      return { at: phase.from + (phase.to - phase.from) * eased, step: null, done: false };
    }
    t -= phase.duration;
  }
  return { at: 1, step: null, done: true };
}
