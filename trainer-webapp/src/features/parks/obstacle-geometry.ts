import * as THREE from "three";
import type { Obstacle } from "@/domain/parks";

/**
 * Low-Poly-Geometrien der Obstacle-Bibliothek.
 * Alle Teile liegen in lokalen Koordinaten: Mittelpunkt der Grundfläche im
 * Ursprung, Breite entlang x, Tiefe entlang z (Fahrseite/Front bei +z), Höhe entlang y.
 */
export interface ObstaclePart {
  geometry: THREE.BufferGeometry;
  /** Kanten für den klaren Low-Poly-Look; nur Knicke ab 25° werden gezeichnet. */
  edges?: THREE.EdgesGeometry;
  material: "concrete" | "metal";
}

const cache = new Map<string, ObstaclePart[]>();

function box(w: number, h: number, l: number, x = 0, z = 0, y = 0) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Profil in (Tiefe, Höhe) wird über die Breite extrudiert; Front zeigt nach +z. */
function extrudeProfile(points: [number, number][], width: number, length: number) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, length / 2);
  return g;
}

function quarter(w: number, l: number, h: number): ObstaclePart[] {
  // Elliptischer Übergang über 75 % der Tiefe, danach Plattform (Deck).
  const a = l * 0.75;
  const pts: [number, number][] = [[0, 0]];
  const segments = 6;
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    pts.push([a * Math.sin(t), h - h * Math.cos(t)]);
  }
  pts.push([l, h], [l, 0]);
  return [{ geometry: extrudeProfile(pts, w, l), material: "concrete" }];
}

function bank(w: number, l: number, h: number): ObstaclePart[] {
  return [
    {
      geometry: extrudeProfile([[0, 0], [l * 0.85, h], [l, h], [l, 0]], w, l),
      material: "concrete",
    },
  ];
}

/** Treppe fällt entlang +x ab; jede Stufe ist ein eigener Block. */
function stairs(w: number, l: number, h: number, z = 0): THREE.BufferGeometry[] {
  const n = Math.max(2, Math.min(12, Math.round(h / 0.16)));
  const parts = [];
  for (let i = 0; i < n; i++) {
    const stepW = w / n;
    parts.push(box(stepW, (h * (n - i)) / n, l, -w / 2 + stepW * (i + 0.5), z));
  }
  return parts;
}

function hubba(w: number, l: number, h: number): ObstaclePart[] {
  const stairDepth = l * 0.7;
  const ledgeDepth = l - stairDepth;
  const ledge = new THREE.ExtrudeGeometry(
    new THREE.Shape([
      new THREE.Vector2(-w / 2, 0),
      new THREE.Vector2(w / 2, 0),
      new THREE.Vector2(w / 2, 0.35),
      new THREE.Vector2(-w / 2, h + 0.35),
    ]),
    { depth: ledgeDepth, bevelEnabled: false },
  );
  ledge.translate(0, 0, -l / 2);
  return [
    ...stairs(w, stairDepth, h, l / 2 - stairDepth / 2).map((g) => ({
      geometry: g,
      material: "concrete" as const,
    })),
    { geometry: ledge, material: "concrete" },
  ];
}

function rail(w: number, h: number): ObstaclePart[] {
  const bar = new THREE.CylinderGeometry(0.035, 0.035, w, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, h, 0);
  const posts = [-w / 2 + 0.3, w / 2 - 0.3].map((x) => {
    const p = new THREE.CylinderGeometry(0.03, 0.03, h, 6);
    p.translate(x, h / 2, 0);
    return p;
  });
  return [bar, ...posts].map((g) => ({ geometry: g, material: "metal" as const }));
}

/** Erhöhte Bowl: Boden, Rundung zur Kante, Deck und Außenwand (Lathe, 16 Segmente). */
function bowl(w: number, l: number, h: number): ObstaclePart[] {
  const profile = [
    new THREE.Vector2(0.001, 0.02),
    new THREE.Vector2(0.22, 0.02),
  ];
  for (let i = 1; i <= 5; i++) {
    const t = (i / 5) * (Math.PI / 2);
    profile.push(new THREE.Vector2(0.22 + 0.2 * Math.sin(t), h - h * Math.cos(t)));
  }
  profile.push(new THREE.Vector2(0.5, h), new THREE.Vector2(0.5, 0));
  const g = new THREE.LatheGeometry(profile, 16);
  g.scale(w, 1, l);
  return [{ geometry: g, material: "concrete" }];
}

export function obstacleParts(o: Obstacle): ObstaclePart[] {
  const key = `${o.type}:${o.width}:${o.length}:${o.height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { width: w, length: l, height: h } = o;
  let parts: ObstaclePart[];
  switch (o.type) {
    case "quarter":
      parts = quarter(w, l, h);
      break;
    case "bank":
      parts = bank(w, l, h);
      break;
    case "bowl":
      parts = bowl(w, l, h);
      break;
    case "hubba":
      parts = hubba(w, l, h);
      break;
    case "stairs":
      parts = stairs(w, l, h).map((g) => ({ geometry: g, material: "concrete" }));
      break;
    case "rail":
      parts = rail(w, h);
      break;
    default:
      // Ledge, Manual Pad und Wall sind einfache Quader.
      parts = [{ geometry: box(w, h, l), material: "concrete" }];
  }
  for (const part of parts)
    if (part.material === "concrete") part.edges = new THREE.EdgesGeometry(part.geometry, 25);
  if (cache.size > 400) cache.clear();
  cache.set(key, parts);
  return parts;
}
