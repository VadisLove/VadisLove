import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SOURCES,
  despike,
  refineGrid,
  footprintBase,
  footprintRange,
  groundWindow,
  latLonToUtm,
  officialStateFromName,
  relativeHeights,
  removeCanopy,
  terrainHeightAt,
  tilesForWindow,
  wmsImageUrl,
} from "../src/domain/geodata.ts";

test("WGS84 → UTM trifft die geprüfte Kachel am Heizhaus Leipzig", () => {
  const p = latLonToUtm(51.3204468, 12.2986223, 33);
  // Referenz aus der Machbarkeitsprüfung (DOM1-Kachel 3105688).
  assert.ok(Math.abs(p.x - 311769) < 1.5, `x=${p.x}`);
  assert.ok(Math.abs(p.y - 5688926) < 1.5, `y=${p.y}`);
  const munich = latLonToUtm(48.1374, 11.5755, 32);
  assert.ok(Math.abs(munich.x - 691607) < 50 && Math.abs(munich.y - 5334760) < 50, JSON.stringify(munich));
});

test("Ausschnitt rastet auf die Quellauflösung und begrenzt Rasterpunkte", () => {
  const sn = groundWindow({ x: 311769.4, y: 5688926.6 }, 80, 60, 1);
  assert.deepEqual([sn.cols, sn.rows, sn.cell], [80, 60, 1]);
  assert.equal(sn.maxX - sn.minX, 80);
  assert.equal(sn.minX % 1, 0);
  const by = groundWindow({ x: 690450.13, y: 5334437.7 }, 200, 150, 0.2);
  assert.equal(by.cell, 0.6);
  assert.ok(by.cols <= 400 && by.rows <= 400);
  // Übergroße Ausschnitte werden auf 200 m begrenzt.
  const big = groundWindow({ x: 0, y: 0 }, 900, 900, 1);
  assert.equal(big.maxX - big.minX, 200);
});

test("Kachelwahl über Kachelgrenzen hinweg", () => {
  const tiles = tilesForWindow({ minX: 311950, minY: 5689950, maxX: 312050, maxY: 5690050 }, 2);
  assert.deepEqual(
    tiles.map((t) => `${t.eastKm}_${t.northKm}`).sort(),
    ["310_5688", "310_5690", "312_5688", "312_5690"],
  );
  assert.deepEqual(tilesForWindow({ minX: 690400, minY: 5334400, maxX: 690500, maxY: 5334475 }, 1), [
    { eastKm: 690, northKm: 5334 },
  ]);
});

test("Baumfilter ersetzt hohe Oberflächenpunkte durch Gelände; Höhen werden relativ", () => {
  const surface = new Float32Array([120.5, 131, 119.8, NaN]);
  const terrain = new Float32Array([120, 120, 120, 120]);
  // Ohne Nachbarschaftsradius: nur der Baumpunkt (131) und NoData werden ersetzt.
  assert.deepEqual(Array.from(removeCanopy(surface, terrain, 4, 1, 3, 0)), [120.5, 120, Math.fround(119.8), 120]);
  // Mit Radius: flacher Rest (+0.5 m) direkt neben dem Baum verschwindet, entferntes Obstacle bleibt.
  const s2 = new Float32Array([120.5, 125, 120, 120, 120, 120.5]);
  assert.deepEqual(Array.from(removeCanopy(s2, new Float32Array(6).fill(120), 6, 1, 3, 1)), [120, 120, 120, 120, 120, 120.5]);
  const rel = relativeHeights(new Float32Array([100, 101.5, 99, -9999]));
  assert.equal(rel.base, 99);
  assert.deepEqual(Array.from(rel.heights), [1, 2.5, 0, 0]);
  assert.equal(rel.max, 2.5);
});

test("Höhenabfrage und Unterkante eines Obstacles auf dem Gelände", () => {
  // 3 × 3 Raster auf 30 × 30 m: Mitte 2 m hoch, Ränder 0.
  const grid = { cols: 3, rows: 3, width: 30, length: 30, heights: new Float32Array([0, 0, 0, 0, 2, 0, 0, 0, 0]) };
  assert.equal(terrainHeightAt(grid, 0, 0), 2);
  assert.equal(terrainHeightAt(grid, 5, 0), 1);
  assert.equal(terrainHeightAt(grid, 99, 99), 0);
  assert.equal(footprintBase(grid, { x: 0, z: 0, width: 2, length: 2, rotation: 0 }), terrainHeightAt(grid, 1, 1));
  assert.ok(footprintBase(grid, { x: 0, z: 0, width: 2, length: 2, rotation: 45 }) > 1.7);
  // Ein Bereich über dem ganzen Raster reicht vom Rand (0) bis zur Kuppe (2).
  assert.deepEqual(footprintRange(grid, { x: 0, z: 0, width: 20, length: 20, rotation: 0 }, 3), { min: 0, max: 2 });
});

test("Luftbild-WMS und Bundeslandzuordnung", () => {
  const url = new URL(
    wmsImageUrl(OFFICIAL_SOURCES.SN, { minX: 311640, minY: 5688860, maxX: 311760, maxY: 5688950 }),
  );
  assert.equal(url.searchParams.get("CRS"), "EPSG:25833");
  assert.equal(url.searchParams.get("WIDTH"), "600");
  assert.equal(url.searchParams.get("HEIGHT"), "450");
  assert.equal(officialStateFromName("Bayern"), "BY");
  assert.equal(officialStateFromName("Sachsen"), "SN");
  assert.equal(officialStateFromName("Sachsen-Anhalt"), null);
});

test("Ausreißer (Laterne) verschwinden, durchgehende Kanten und Mulden bleiben", () => {
  // 5 × 5: Mitte ist eine 6-m-Spitze, rechte Spalte eine 1,5 m hohe Wand.
  const h = new Float32Array([
    0, 0, 0, 0, 1.5,
    0, 0, 0, 0, 1.5,
    0, 0, 6, 0, 1.5,
    0, 0, 0, 0, 1.5,
    0, 0, 0, 0, 1.5,
  ]);
  const out = despike(h, 5);
  assert.equal(out[12], 0);
  assert.deepEqual([4, 9, 14, 19, 24].map((i) => out[i]), [1.5, 1.5, 1.5, 1.5, 1.5]);
  // Breite Mulde (Bowl) aus mehreren Punkten bleibt.
  const bowl = new Float32Array(36).fill(0);
  for (const i of [14, 15, 20, 21]) bowl[i] = -2;
  assert.deepEqual(Array.from(despike(bowl, 6)), Array.from(bowl));
});

test("Rasterverfeinerung geht durch die Originalpunkte und behält die Ausdehnung", () => {
  const grid = { cols: 3, rows: 2, width: 3, length: 2, heights: new Float32Array([0, 1, 0, 0, 1, 0]) };
  const fine = refineGrid(grid, 2);
  assert.equal(fine.cols, 5);
  assert.equal(fine.rows, 3);
  assert.equal(fine.heights[2], 1);
  assert.equal(fine.heights[4], 0);
  // Mitte-zu-Mitte-Spanne unverändert (2 m in x, 1 m in z).
  assert.ok(Math.abs(fine.width - fine.width / fine.cols - 2) < 1e-9);
  assert.ok(Math.abs(fine.length - fine.length / fine.rows - 1) < 1e-9);
});
