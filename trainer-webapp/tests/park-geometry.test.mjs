import assert from "node:assert/strict";
import test from "node:test";

import { HeightRaster, footprintRange, insidePolygon, pickHeightfield, terrainHeightAt } from "../src/domain/geodata.ts";
import {
  applyTransform,
  insertZoneVertex,
  localToWorld,
  moveZoneVertex,
  removeZoneVertex,
  scaleObstacle,
  worldToLocal,
  zoneFromPolygon,
  zoneOutline,
} from "../src/domain/park-geometry.ts";

const ledge = { id: "l", type: "ledge", x: 2, z: 3, rotation: 30, width: 4, length: 0.6, height: 0.45 };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("lokale und Weltkoordinaten sind zueinander invers", () => {
  const p = localToWorld(ledge, { x: 1.5, z: -0.4 });
  const back = worldToLocal(ledge, p);
  close(back.x, 1.5);
  close(back.z, -0.4);
  // Ohne Drehung reine Verschiebung.
  assert.deepEqual(localToWorld({ x: 1, z: 2, rotation: 0 }, { x: 1, z: 1 }), { x: 2, z: 3 });
});

test("Polygon-Bereich: Mittelpunkt und Maße aus dem umschließenden Rechteck", () => {
  const zone = zoneFromPolygon(
    [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 4 },
      { x: 2, z: 5 },
    ],
    "z1",
  );
  assert.equal(zone.type, "zone");
  assert.deepEqual({ x: zone.x, z: zone.z, width: zone.width, length: zone.length }, { x: 3, z: 2.5, width: 6, length: 5 });
  // Weltlage der Punkte bleibt erhalten.
  const world = zoneOutline(zone).map((p) => localToWorld(zone, p));
  assert.deepEqual(world[3], { x: 2, z: 5 });
  assert.equal(zoneFromPolygon([{ x: 0, z: 0 }, { x: 1, z: 1 }], "z2"), null);
  assert.equal(zoneFromPolygon([{ x: 0, z: 0 }, { x: 70, z: 0 }, { x: 0, z: 5 }], "z3"), null);
});

test("Eckpunkte verschieben, einfügen und entfernen (auch bei gedrehten Rechtecken)", () => {
  const rect = { id: "r", type: "zone", x: 0, z: 0, rotation: 90, width: 4, length: 2, height: 0.3 };
  const moved = moveZoneVertex(rect, 0, { x: -5, z: 5 });
  assert.equal(moved.points.length, 4);
  const world = zoneOutline(moved).map((p) => localToWorld(moved, p));
  close(world[0].x, -5, 0.011);
  close(world[0].z, 5, 0.011);
  const inserted = insertZoneVertex(moved, 1, { x: 3, z: 3 });
  assert.equal(inserted.points.length, 5);
  assert.equal(removeZoneVertex(inserted, 2).points.length, 4);
  const triangle = zoneFromPolygon([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 2 }], "t");
  assert.equal(removeZoneVertex(triangle, 0), triangle, "mindestens drei Punkte bleiben");
});

test("Skalieren begrenzt Maße und skaliert Umrisse mit", () => {
  const big = scaleObstacle(ledge, 100, 1, 1);
  assert.equal(big.width, 60);
  const zone = zoneFromPolygon([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }], "z");
  const scaled = scaleObstacle(zone, 2, 1, 1);
  assert.equal(scaled.width, 8);
  assert.deepEqual(scaled.points.map((p) => p.x), zone.points.map((p) => p.x * 2));
});

test("G/R/S: Achsen, Raster und eingetippte Werte", () => {
  const o = { ...ledge, x: 0, z: 0, rotation: 0 };
  // G frei mit Raster, G X nur Osten, G Y nur Norden (= −z), G Z hebt an.
  assert.deepEqual(
    (({ x, z }) => ({ x, z }))(applyTransform(o, { kind: "move", axis: null, ground: { x: 1.1, z: 0.6 }, snap: true })),
    { x: 1, z: 0.5 },
  );
  assert.equal(applyTransform(o, { kind: "move", axis: "x", ground: { x: 1.1, z: 0.6 }, snap: false }).z, 0);
  assert.equal(applyTransform(o, { kind: "move", axis: "y", typed: 2, snap: true }).z, -2);
  assert.equal(applyTransform(o, { kind: "move", axis: "z", typed: 0.5, snap: true }).elevation, 0.5);
  // R dreht um die Hochachse, R X kippt.
  assert.equal(applyTransform(o, { kind: "rotate", axis: null, angle: 47, snap: true }).rotation, 45);
  assert.equal(applyTransform(o, { kind: "rotate", axis: null, typed: 200, snap: true }).rotation, -160);
  assert.equal(applyTransform(o, { kind: "rotate", axis: "x", typed: 10, snap: true }).pitch, 10);
  // S gleichmäßig oder je Achse.
  const s = applyTransform(o, { kind: "scale", axis: null, typed: 2, snap: true });
  assert.deepEqual([s.width, s.length, s.height], [8, 1.2, 0.9]);
  assert.equal(applyTransform(o, { kind: "scale", axis: "z", factor: 2.02, snap: true }).height, 0.9);
});

test("Höhenfeld aus Dreiecken und Strahlschnitt", () => {
  // Schräge Rampe: y = x + 5 auf 10 × 10 m, als zwei Dreiecke.
  const positions = new Float32Array([
    -5, 0, -5, 5, 10, -5, 5, 10, 5,
    -5, 0, -5, 5, 10, 5, -5, 0, 5,
  ]);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const raster = new HeightRaster(10, 10, 0.5);
  raster.addMesh(positions, null, identity);
  const grid = raster.finish();
  close(terrainHeightAt(grid, 0, 0), 5, 0.3);
  close(terrainHeightAt(grid, 2, -3), 7, 0.3);
  // Blick senkrecht von oben trifft die Rampe bei x = 2 in 7 m Höhe.
  const hit = pickHeightfield({ x: 2, y: 50, z: 1 }, { x: 0, y: -1, z: 0 }, (x, z) => terrainHeightAt(grid, x, z));
  close(hit.x, 2);
  close(hit.y, 7, 0.3);
  // Ohne Höhenfeld: Ebene y = 0; nach oben gerichtet: kein Treffer.
  assert.deepEqual(pickHeightfield({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, null), { x: 1, y: 0, z: 1 });
  assert.equal(pickHeightfield({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, null), null);
});

test("Bereiche mit Umriss werten nur Geländepunkte innerhalb aus", () => {
  assert.equal(insidePolygon(1, 1, [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }]), true);
  assert.equal(insidePolygon(3, 3, [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }]), false);
  // Gelände: Nordostecke 10 m hoch, sonst flach.
  const heights = new Float32Array(100).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 7; c < 10; c++) heights[r * 10 + c] = 10;
  const grid = { cols: 10, rows: 10, width: 10, length: 10, heights };
  const square = { x: 0, z: 0, width: 10, length: 10, rotation: 0 };
  assert.equal(footprintRange(grid, square).max, 10);
  // Dreieck in der Südwesthälfte berührt die hohe Ecke nicht.
  const triangle = { ...square, points: [{ x: -5, z: -2 }, { x: 2, z: 5 }, { x: -5, z: 5 }] };
  assert.equal(footprintRange(grid, triangle).max, 0);
});
