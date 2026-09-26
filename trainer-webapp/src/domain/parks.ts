/**
 * Schritt 7 – Park- und Run-Planer.
 * Reine Domänenlogik ohne React/three.js, damit sie in Node-Tests prüfbar bleibt.
 * Koordinaten sind Meter: x nach rechts, z nach vorne (Draufsicht: z nach unten),
 * y nach oben. Der Parkmittelpunkt liegt bei (0, 0).
 */

export const OBSTACLE_TYPES = [
  "quarter",
  "bank",
  "bowl",
  "ledge",
  "hubba",
  "stairs",
  "rail",
  "manual_pad",
  "wall",
] as const;
/**
 * Zusätzliche Typen aus Schritt 7b: „Bereich“ markiert ein Gelände-Element (z. B. eine
 * Bowl im amtlichen Höhenmodell), „Eigenes Modell“ ist ein hochgeladenes 3D-Obstacle.
 */
export type ObstacleType = (typeof OBSTACLE_TYPES)[number] | "zone" | "custom";
export type ModelFormat = "glb" | "gltf" | "obj";

export interface Obstacle {
  /** Stabile ID; bleibt über alle Parkversionen erhalten und wird von Runs referenziert. */
  id: string;
  type: ObstacleType;
  x: number;
  z: number;
  /** Drehung um die Hochachse in Grad. */
  rotation: number;
  width: number;
  length: number;
  height: number;
  label?: string;
  /** Höhenversatz der Unterkante gegenüber dem Gelände (Meter, Schritt 7b). */
  elevation?: number;
  /** Nur bei `custom`: Datei im Speicher `skatepark-models`. */
  modelPath?: string;
  modelFormat?: ModelFormat;
  /** Hochachse der Datei; CAD-Programme exportieren oft mit Z nach oben. */
  upAxis?: "y" | "z";
}

export interface AerialImage {
  /** Pfad im privaten Storage-Bucket `skatepark-aerials`: `<uid>/<uuid>.webp`. */
  path: string;
  /** Reale Breite des Bildes in Metern; die Höhe ergibt sich aus `aspect`. */
  width: number;
  /** Seitenverhältnis Höhe / Breite des Bildes. */
  aspect: number;
  rotation: number;
  offsetX: number;
  offsetZ: number;
  opacity: number;
  /** Der hochladende Nutzer bestätigt, das Bild verwenden zu dürfen (Pflicht zum Speichern). */
  rightsConfirmed: boolean;
  /** Quellenangabe bei amtlichen Luftbildern (Lizenzpflicht). */
  attribution?: string;
}

/** Amtliches Höhenraster (Float32, zeilenweise Nord → Süd), zentriert auf den Park. */
export interface TerrainGround {
  kind: "terrain";
  path: string;
  cols: number;
  rows: number;
  width: number;
  length: number;
  minHeight: number;
  maxHeight: number;
  attribution: string;
  stand?: string | null;
}

/** Hochgeladenes 3D-Modell des ganzen Parks als Untergrund. */
export interface ModelGround {
  kind: "model";
  path: string;
  format: ModelFormat;
  upAxis?: "y" | "z";
  /** Meter je Modelleinheit (z. B. 0.001 für Millimeter). */
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

/** Georeferenz des Parkmittelpunkts bei amtlichen Daten. */
export interface GeoReference {
  state: "BY" | "SN";
  lat: number;
  lon: number;
  x: number;
  y: number;
}

export interface ParkContent {
  size: { width: number; length: number };
  obstacles: Obstacle[];
  aerial?: AerialImage | null;
  ground?: TerrainGround | ModelGround | null;
  geo?: GeoReference | null;
}

export interface ParkVersion {
  id: string;
  version_number: number;
  content: ParkContent;
  created_at: string;
}

export type TrickCategory =
  | "flip"
  | "grind"
  | "slide"
  | "grab"
  | "air"
  | "manual"
  | "transition"
  | "other";
export interface Trick {
  id: string;
  name: string;
  category: TrickCategory;
  status: "approved" | "pending" | "rejected";
  created_at?: string;
}

export type Stance = "regular" | "fakie" | "switch" | "nollie";
export type Direction = "frontside" | "backside";
export interface Point {
  x: number;
  z: number;
}

export interface RunStep {
  id?: string;
  position?: number;
  obstacle_id: string;
  trick_id: string | null;
  trick_name: string;
  stance: Stance | null;
  direction: Direction | null;
  note: string;
}

export interface CalendarEventOption {
  id: string;
  title: string;
  type: "training" | "contest";
  starts_at: string;
}

export interface ParkRun {
  id: string;
  park_id: string;
  park_name: string;
  park_version_id: string;
  version_number: number;
  athlete: { id: string; user_id: string | null; display_name: string };
  title: string;
  event: CalendarEventOption | null;
  event_id: string | null;
  start_point: Point;
  end_point: Point;
  target_score: number | string | null;
  actual_score: number | string | null;
  note: string;
  revision: number;
  can_edit: boolean;
  updated_at: string;
  steps: RunStep[];
}

export interface ParkSummary {
  id: string;
  name: string;
  location: string;
  latest_version: number;
  updated_at: string;
  can_edit: boolean;
  obstacle_count: number | null;
  run_count: number;
}

export interface ParkDirectory {
  is_curator: boolean;
  parks: ParkSummary[];
  runs: ParkRun[];
  pending_tricks: Trick[];
}

export interface ParkDetail {
  park: {
    id: string;
    name: string;
    location: string;
    latest_version: number;
    created_by: string | null;
    can_edit: boolean;
  };
  versions: ParkVersion[];
  runs: ParkRun[];
  tricks: Trick[];
  events: CalendarEventOption[];
  /** Kurzlebige, serverseitig signierte URLs je Storage-Pfad (Luftbilder, Modelle, Raster). */
  assetUrls: Record<string, string>;
  /** Athleten, für die der Nutzer Runs anlegen darf (er selbst zuerst). */
  athletes: { id: string; name: string }[];
  user: { id: string; displayName: string };
}

/** Anzeigenamen und Standardmaße der Obstacle-Bibliothek (in Metern). */
export const OBSTACLE_LIBRARY: Record<
  ObstacleType,
  { label: string; width: number; length: number; height: number }
> = {
  quarter: { label: "Quarter", width: 4, length: 2.5, height: 1.5 },
  bank: { label: "Bank", width: 3, length: 2.5, height: 1 },
  bowl: { label: "Bowl", width: 8, length: 8, height: 1.8 },
  ledge: { label: "Ledge", width: 4, length: 0.6, height: 0.45 },
  hubba: { label: "Hubba", width: 4, length: 2.2, height: 1 },
  stairs: { label: "Treppe", width: 3, length: 2, height: 0.8 },
  rail: { label: "Rail", width: 4, length: 0.3, height: 0.4 },
  manual_pad: { label: "Manual Pad", width: 3.5, length: 1.5, height: 0.2 },
  wall: { label: "Wall", width: 4, length: 0.4, height: 2 },
  zone: { label: "Bereich", width: 10, length: 6, height: 0.3 },
  custom: { label: "Eigenes Modell", width: 2, length: 2, height: 1 },
};

export const STANCE_LABELS: Record<Stance, string> = {
  regular: "Regular",
  fakie: "Fakie",
  switch: "Switch",
  nollie: "Nollie",
};
export const DIRECTION_LABELS: Record<Direction, string> = {
  frontside: "Frontside",
  backside: "Backside",
};
export const TRICK_CATEGORY_LABELS: Record<TrickCategory, string> = {
  flip: "Flip",
  grind: "Grind",
  slide: "Slide",
  grab: "Grab",
  air: "Air",
  manual: "Manual",
  transition: "Transition",
  other: "Sonstiges",
};

export const DEFAULT_PARK_SIZE = { width: 40, length: 30 };

export function emptyParkContent(): ParkContent {
  return { size: { ...DEFAULT_PARK_SIZE }, obstacles: [], aerial: null };
}

/** Rundet auf das Bearbeitungsraster (Standard 0,25 m). */
export function snap(value: number, step = 0.25): number {
  return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalisiert Grad auf (-180, 180]. */
export function normalizeRotation(degrees: number): number {
  const r = ((degrees % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

/** Neues Obstacle aus der Bibliothek an einer Position, mit neuer stabiler ID. */
export function createObstacle(
  type: ObstacleType,
  at: Point,
  id: string,
): Obstacle {
  const d = OBSTACLE_LIBRARY[type];
  return {
    id,
    type,
    x: snap(at.x),
    z: snap(at.z),
    rotation: 0,
    width: d.width,
    length: d.length,
    height: d.height,
  };
}

/** Hält ein Obstacle innerhalb der Grundfläche. */
export function clampToPark(
  point: Point,
  size: ParkContent["size"],
): Point {
  return {
    x: clamp(point.x, -size.width / 2, size.width / 2),
    z: clamp(point.z, -size.length / 2, size.length / 2),
  };
}

/** Anzeigename eines Obstacles, z. B. „Ledge 2“, wenn kein eigener Name vergeben ist. */
export function obstacleName(obstacle: Obstacle, all: Obstacle[]): string {
  if (obstacle.label?.trim()) return obstacle.label.trim();
  const sameType = all.filter((o) => o.type === obstacle.type);
  const base = OBSTACLE_LIBRARY[obstacle.type].label;
  return sameType.length > 1
    ? `${base} ${sameType.indexOf(obstacle) + 1}`
    : base;
}

/** Höhe, auf der Pins über einem Obstacle schweben. */
export function pinBaseHeight(obstacle: Obstacle): number {
  return obstacle.height + 1.4;
}

/** Abstand nebeneinanderliegender Pins am selben Obstacle (Meter). */
export const PIN_SPACING = 1.5;

/**
 * Ordnet jedem Schritt eine Pin-Position zu. Mehrere Schritte am selben Obstacle
 * liegen nebeneinander über dem Obstacle, damit alle Nummern auch in der
 * Draufsicht lesbar bleiben.
 */
export function pinLayout(
  steps: Pick<RunStep, "obstacle_id">[],
  obstacles: Obstacle[],
): { number: number; obstacleId: string; x: number; y: number; z: number }[] {
  const byId = new Map(obstacles.map((o) => [o.id, o]));
  const total = new Map<string, number>();
  for (const step of steps)
    if (byId.has(step.obstacle_id))
      total.set(step.obstacle_id, (total.get(step.obstacle_id) ?? 0) + 1);
  const seen = new Map<string, number>();
  const pins = [];
  for (let i = 0; i < steps.length; i++) {
    const obstacle = byId.get(steps[i].obstacle_id);
    if (!obstacle) continue;
    const level = seen.get(obstacle.id) ?? 0;
    seen.set(obstacle.id, level + 1);
    const count = total.get(obstacle.id) ?? 1;
    pins.push({
      number: i + 1,
      obstacleId: obstacle.id,
      x: obstacle.x + (level - (count - 1) / 2) * PIN_SPACING,
      y: pinBaseHeight(obstacle),
      z: obstacle.z,
    });
  }
  return pins;
}

/**
 * Fahrlinie des Runs: Start → Obstacles in Schrittreihenfolge → Ende.
 * Aufeinanderfolgende Schritte am selben Obstacle erzeugen keinen Doppelpunkt.
 */
export function runPath(
  start: Point,
  end: Point,
  steps: Pick<RunStep, "obstacle_id">[],
  obstacles: Obstacle[],
): Point[] {
  const byId = new Map(obstacles.map((o) => [o.id, o]));
  const points: Point[] = [start];
  let last: string | null = null;
  for (const step of steps) {
    const o = byId.get(step.obstacle_id);
    if (!o || o.id === last) continue;
    points.push({ x: o.x, z: o.z });
    last = o.id;
  }
  points.push(end);
  return points;
}

/** Richtungspfeile in der Mitte jedes Abschnitts (Winkel um die Hochachse, Bogenmaß). */
export function pathArrows(
  points: Point[],
): { x: number; z: number; angle: number }[] {
  const arrows = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.hypot(dx, dz) < 0.5) continue;
    arrows.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, angle: Math.atan2(dx, dz) });
  }
  return arrows;
}

/** Standardpunkte für neue Runs: Start links vorne, Ende rechts vorne. */
export function defaultRunPoints(size: ParkContent["size"]): {
  start: Point;
  end: Point;
} {
  return {
    start: { x: snap(-size.width / 2 + 2), z: snap(size.length / 2 - 2) },
    end: { x: snap(size.width / 2 - 2), z: snap(size.length / 2 - 2) },
  };
}

/** Verschiebt einen Schritt um eine Position; gibt eine neue Liste zurück. */
export function moveStep<T>(steps: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Schritte, deren Obstacle in einer Parkversion fehlt (z. B. nach Umbau). */
export function missingObstacleSteps(
  steps: Pick<RunStep, "obstacle_id">[],
  obstacles: Obstacle[],
): number[] {
  const ids = new Set(obstacles.map((o) => o.id));
  return steps.flatMap((s, i) => (ids.has(s.obstacle_id) ? [] : [i]));
}

/** Kurzbeschreibung eines Schritts, z. B. „Switch Frontside 50-50“. */
export function stepLabel(step: Pick<RunStep, "stance" | "direction" | "trick_name">): string {
  return [
    step.stance && step.stance !== "regular" ? STANCE_LABELS[step.stance] : "",
    step.direction ? DIRECTION_LABELS[step.direction] : "",
    step.trick_name,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Liest optionale Scores aus einem Eingabefeld; leer = kein Score. */
export function parseScore(input: string): number | null | "invalid" {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 1000) return "invalid";
  return Math.round(value * 100) / 100;
}

/** Formatiert Scores deutsch mit höchstens zwei Nachkommastellen. */
export function formatScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  return Number(value).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
