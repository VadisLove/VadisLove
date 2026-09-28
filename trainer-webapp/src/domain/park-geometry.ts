/**
 * Geometrie-Helfer für den 3D-Editor: Polygon-Bereiche, lokale ↔ Welt-Koordinaten und
 * Transformationen (Verschieben, Drehen, Skalieren) wie in Blender.
 * Rein rechnerisch ohne React/three.js, damit alles in Node-Tests prüfbar bleibt.
 */
import type { Obstacle, Point } from "@/domain/parks";

/** Grenzen, die auch die Datenbank prüft (private.park_validate_content). */
export const LIMITS = {
  size: { min: 0.1, max: 60 },
  height: { min: 0.05, max: 10 },
  position: 200,
  elevation: 20,
  tilt: 80,
} as const;

const round = (v: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Drehwinkel wie im Szenen-Rendering (Grad → Bogenmaß um die Hochachse). */
const theta = (rotation: number) => (-rotation * Math.PI) / 180;

/** Lokaler Punkt eines Obstacles → Parkkoordinaten (gleiche Drehung wie three.js). */
export function localToWorld(o: Pick<Obstacle, "x" | "z" | "rotation">, p: Point): Point {
  const r = theta(o.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: o.x + p.x * cos + p.z * sin, z: o.z - p.x * sin + p.z * cos };
}

/** Parkkoordinaten → lokaler Punkt eines Obstacles (Umkehrung von localToWorld). */
export function worldToLocal(o: Pick<Obstacle, "x" | "z" | "rotation">, p: Point): Point {
  const r = theta(o.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** Umriss eines Bereichs in lokalen Koordinaten; ohne eigene Punkte das Rechteck. */
export function zoneOutline(o: Pick<Obstacle, "width" | "length" | "points">): Point[] {
  if (o.points && o.points.length >= 3) return o.points;
  const w = o.width / 2;
  const l = o.length / 2;
  return [
    { x: -w, z: -l },
    { x: w, z: -l },
    { x: w, z: l },
    { x: -w, z: l },
  ];
}

/**
 * Richtet einen Polygon-Bereich neu aus: Mittelpunkt = Mitte des umschließenden
 * Rechtecks, Breite/Tiefe = dessen Maße. Die Weltlage der Punkte bleibt gleich.
 */
export function normalizeZone(o: Obstacle): Obstacle {
  if (!o.points || o.points.length < 3) return o;
  const xs = o.points.map((p) => p.x);
  const zs = o.points.map((p) => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const center = localToWorld(o, { x: cx, z: cz });
  return {
    ...o,
    x: round(center.x),
    z: round(center.z),
    width: round(Math.max(LIMITS.size.min, Math.max(...xs) - Math.min(...xs))),
    length: round(Math.max(LIMITS.size.min, Math.max(...zs) - Math.min(...zs))),
    points: o.points.map((p) => ({ x: round(p.x - cx), z: round(p.z - cz) })),
  };
}

/** Passt der Bereich in die gespeicherten Grenzen (max. 60 m je Seite, ±200 m Lage)? */
export function zoneFits(o: Obstacle): boolean {
  return (
    o.width <= LIMITS.size.max &&
    o.length <= LIMITS.size.max &&
    Math.abs(o.x) <= LIMITS.position &&
    Math.abs(o.z) <= LIMITS.position
  );
}

/** Neuer Polygon-Bereich aus Punkten in Parkkoordinaten (mind. 3 Punkte). */
export function zoneFromPolygon(world: Point[], id: string, height = 0.3): Obstacle | null {
  if (world.length < 3) return null;
  const zone = normalizeZone({
    id,
    type: "zone",
    x: 0,
    z: 0,
    rotation: 0,
    width: 1,
    length: 1,
    height,
    points: world.map((p) => ({ x: p.x, z: p.z })),
  });
  return zoneFits(zone) ? zone : null;
}

/** Setzt einen Eckpunkt auf eine Parkposition (Rechteck-Bereiche werden dabei zum Polygon). */
export function moveZoneVertex(o: Obstacle, index: number, world: Point): Obstacle {
  const points = zoneOutline(o).map((p, i) => (i === index ? worldToLocal(o, world) : p));
  return normalizeZone({ ...o, points });
}

/** Fügt nach `index` einen Eckpunkt an einer Parkposition ein. */
export function insertZoneVertex(o: Obstacle, index: number, world: Point): Obstacle {
  const points = [...zoneOutline(o)];
  points.splice(index + 1, 0, worldToLocal(o, world));
  return normalizeZone({ ...o, points });
}

/** Entfernt einen Eckpunkt; mindestens drei bleiben erhalten. */
export function removeZoneVertex(o: Obstacle, index: number): Obstacle {
  const outline = zoneOutline(o);
  if (outline.length <= 3) return o;
  return normalizeZone({ ...o, points: outline.filter((_, i) => i !== index) });
}

/** Skaliert Maße (und bei Bereichen den Umriss) mit getrennten Faktoren je Achse. */
export function scaleObstacle(o: Obstacle, sx: number, sz: number, sy: number): Obstacle {
  const width = round(clampTo(o.width * sx, LIMITS.size.min, LIMITS.size.max));
  const length = round(clampTo(o.length * sz, LIMITS.size.min, LIMITS.size.max));
  const height = round(clampTo(o.height * sy, LIMITS.height.min, LIMITS.height.max));
  const next: Obstacle = { ...o, width, length, height };
  if (o.points && o.points.length >= 3) {
    // Tatsächliche Faktoren nach der Begrenzung, damit Umriss und Maße zusammenpassen.
    const fx = width / o.width;
    const fz = length / o.length;
    next.points = o.points.map((p) => ({ x: round(p.x * fx), z: round(p.z * fz) }));
  }
  return next;
}

export type TransformKind = "move" | "rotate" | "scale";
/**
 * Achsen in Blender-Schreibweise: X = Osten (+x), Y = Norden (−z), Z = oben (+y).
 * So stimmen Tastenkürzel und Achsen-Gizmo mit dem überein, was Blender-Nutzer kennen.
 */
export type TransformAxis = "x" | "y" | "z" | null;

export interface TransformInput {
  kind: TransformKind;
  axis: TransformAxis;
  /** Verschiebung auf dem Boden in Parkkoordinaten (Meter). */
  ground?: Point;
  /** Senkrechte Verschiebung in Metern (Achse Z beim Verschieben). */
  lift?: number;
  /** Drehwinkel in Grad (positiv = im Uhrzeigersinn von oben). */
  angle?: number;
  /** Skalierungsfaktor. */
  factor?: number;
  /** Direkt eingetippter Wert (Meter, Grad oder Faktor) – hat Vorrang vor der Maus. */
  typed?: number | null;
  /** Auf Raster einrasten (0,25 m, 5°, 0,05). */
  snap: boolean;
}

const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** Wendet eine laufende G/R/S-Transformation auf den Ausgangszustand an. */
export function applyTransform(original: Obstacle, t: TransformInput): Obstacle {
  const typed = t.typed ?? null;
  if (t.kind === "move") {
    if (t.axis === "z") {
      let lift = typed ?? t.lift ?? 0;
      if (t.snap && typed === null) lift = snapTo(lift, 0.05);
      const elevation = round(clampTo((original.elevation ?? 0) + lift, -LIMITS.elevation, LIMITS.elevation));
      return { ...original, elevation: elevation || undefined };
    }
    let dx = t.ground?.x ?? 0;
    let dz = t.ground?.z ?? 0;
    if (typed !== null) {
      // Eingetippte Meter entlang der Achse; ohne Achse gilt X (wie in Blender).
      dx = t.axis === "y" ? 0 : typed;
      dz = t.axis === "y" ? -typed : 0;
    } else {
      if (t.axis === "x") dz = 0;
      if (t.axis === "y") dx = 0;
    }
    let x = original.x + dx;
    let z = original.z + dz;
    if (t.snap && typed === null) {
      x = snapTo(x, 0.25);
      z = snapTo(z, 0.25);
    }
    const lim = LIMITS.position;
    return { ...original, x: round(clampTo(x, -lim, lim)), z: round(clampTo(z, -lim, lim)) };
  }
  if (t.kind === "rotate") {
    let angle = typed ?? t.angle ?? 0;
    if (t.snap && typed === null) angle = snapTo(angle, 5);
    if (t.axis === "x" || t.axis === "y") {
      // Kippen um die Breiten- (X) bzw. Längsachse (Y) des Obstacles.
      const key = t.axis === "x" ? "pitch" : "roll";
      const value = round(clampTo((original[key] ?? 0) + angle, -LIMITS.tilt, LIMITS.tilt), 1);
      return { ...original, [key]: value || undefined };
    }
    const r = ((((original.rotation + angle) % 360) + 360) % 360);
    return { ...original, rotation: round(r > 180 ? r - 360 : r, 1) };
  }
  let factor = typed ?? t.factor ?? 1;
  if (t.snap && typed === null) factor = Math.max(0.05, snapTo(factor, 0.05));
  if (!(factor > 0)) factor = 0.01;
  return scaleObstacle(
    original,
    t.axis === null || t.axis === "x" ? factor : 1,
    t.axis === null || t.axis === "y" ? factor : 1,
    t.axis === null || t.axis === "z" ? factor : 1,
  );
}

/** Kurze deutsche Beschreibung der laufenden Transformation für die Statuszeile. */
export function describeTransform(original: Obstacle, next: Obstacle, kind: TransformKind, axis: TransformAxis): string {
  const n = (v: number, digits = 2) => (v || 0).toLocaleString("de-DE", { maximumFractionDigits: digits });
  const axisLabel = axis ? ` · Achse ${axis.toUpperCase()}` : "";
  if (kind === "move") {
    if (axis === "z") return `Verschieben${axisLabel} · Höhe ${n((next.elevation ?? 0) - (original.elevation ?? 0))} m`;
    return `Verschieben${axisLabel} · X ${n(next.x - original.x)} m · Y ${n(original.z - next.z)} m`;
  }
  if (kind === "rotate") {
    if (axis === "x") return `Kippen${axisLabel} · ${n(next.pitch ?? 0, 1)}°`;
    if (axis === "y") return `Kippen${axisLabel} · ${n(next.roll ?? 0, 1)}°`;
    return `Drehen · ${n(next.rotation, 1)}°`;
  }
  return `Skalieren${axisLabel} · ${n(next.width)} × ${n(next.length)} × ${n(next.height)} m`;
}

/** Entfernt mehrere Eckpunkte; mindestens drei bleiben erhalten (sonst unverändert). */
export function removeZoneVertices(o: Obstacle, indices: number[]): Obstacle {
  const drop = new Set(indices);
  const outline = zoneOutline(o);
  const kept = outline.filter((_, i) => !drop.has(i));
  if (kept.length < 3 || kept.length === outline.length) return o;
  return normalizeZone({ ...o, points: kept });
}

/** Verschiebt ausgewählte Eckpunkte um einen Weltvektor (Ziehen mehrerer Punkte). */
export function moveZoneVertices(o: Obstacle, indices: number[], delta: Point): Obstacle {
  const pick = new Set(indices);
  const origin = worldToLocal(o, { x: o.x, z: o.z });
  const moved = worldToLocal(o, { x: o.x + delta.x, z: o.z + delta.z });
  const d = { x: moved.x - origin.x, z: moved.z - origin.z };
  const points = zoneOutline(o).map((p, i) => (pick.has(i) ? { x: p.x + d.x, z: p.z + d.z } : p));
  return normalizeZone({ ...o, points });
}

/**
 * G/R/S auf ausgewählte Eckpunkte eines Bereichs (wie der Bearbeitungsmodus in Blender):
 * Verschieben um einen Weltvektor, Drehen und Skalieren um den Schwerpunkt der Auswahl.
 * Achse Z hat für Umrisspunkte keine Wirkung. Liefert auch die angewandten Werte.
 */
export function transformVertices(
  o: Obstacle,
  indices: number[],
  t: TransformInput,
): { zone: Obstacle; text: string } {
  const outline = zoneOutline(o);
  const pick = new Set(indices.filter((i) => i >= 0 && i < outline.length));
  // `|| 0` verhindert die Anzeige „-0“.
  const n = (v: number, digits = 2) => (v || 0).toLocaleString("de-DE", { maximumFractionDigits: digits });
  const label = `${pick.size} ${pick.size === 1 ? "Punkt" : "Punkte"}`;
  const axisLabel = t.axis ? ` · Achse ${t.axis.toUpperCase()}` : "";
  const typed = t.typed ?? null;
  if (!pick.size || t.axis === "z") return { zone: o, text: `${label} · Achse Z nicht möglich` };

  if (t.kind === "move") {
    let dx = t.ground?.x ?? 0;
    let dz = t.ground?.z ?? 0;
    if (typed !== null) {
      dx = t.axis === "y" ? 0 : typed;
      dz = t.axis === "y" ? -typed : 0;
    } else {
      if (t.axis === "x") dz = 0;
      if (t.axis === "y") dx = 0;
      if (t.snap) {
        dx = snapTo(dx, 0.1);
        dz = snapTo(dz, 0.1);
      }
    }
    return {
      zone: moveZoneVertices(o, [...pick], { x: dx, z: dz }),
      text: `${label} verschieben${axisLabel} · X ${n(dx)} m · Y ${n(-dz)} m`,
    };
  }

  const selected = outline.filter((_, i) => pick.has(i));
  const cx = selected.reduce((s, p) => s + p.x, 0) / selected.length;
  const cz = selected.reduce((s, p) => s + p.z, 0) / selected.length;
  if (t.kind === "rotate") {
    let angle = typed ?? t.angle ?? 0;
    if (t.snap && typed === null) angle = snapTo(angle, 5);
    // Positiv = im Uhrzeigersinn von oben (gleiche Richtung wie beim Drehen von Obstacles).
    const r = (angle * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const points = outline.map((p, i) => {
      if (!pick.has(i)) return p;
      const x = p.x - cx;
      const z = p.z - cz;
      return { x: cx + x * cos - z * sin, z: cz + x * sin + z * cos };
    });
    return { zone: normalizeZone({ ...o, points }), text: `${label} drehen · ${n(angle, 1)}°` };
  }
  let factor = typed ?? t.factor ?? 1;
  if (t.snap && typed === null) factor = Math.max(0.05, snapTo(factor, 0.05));
  const fx = t.axis === "y" ? 1 : factor;
  const fz = t.axis === "x" ? 1 : factor;
  const points = outline.map((p, i) => (pick.has(i) ? { x: cx + (p.x - cx) * fx, z: cz + (p.z - cz) * fz } : p));
  return { zone: normalizeZone({ ...o, points }), text: `${label} skalieren${axisLabel} · ${n(factor)}×` };
}
