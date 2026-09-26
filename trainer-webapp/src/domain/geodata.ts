/**
 * Schritt 7b – amtliche Geodaten als Park-Untergrund.
 * Reine Rechenlogik ohne Netzwerk, damit sie in Node-Tests prüfbar bleibt:
 * Koordinatenumrechnung, Kachelauswahl, Rastergröße, Baumfilter und Höhenabfrage.
 *
 * Park-Koordinaten: x = Osten, z = Süden (Draufsicht nach unten), Mittelpunkt (0, 0).
 * Das Höhenraster liegt zeilenweise von Norden nach Süden und spaltenweise von
 * Westen nach Osten vor – genau wie GeoTIFF-Kacheln und WMS-Bilder.
 */

export type OfficialState = "BY" | "SN";

export interface OfficialSource {
  state: OfficialState;
  label: string;
  /** UTM-Zone des amtlichen Koordinatensystems (ETRS89). */
  zone: 32 | 33;
  epsg: 25832 | 25833;
  /** Auflösung des Oberflächenmodells in Metern. */
  surfaceCell: number;
  attribution: string;
  licence: string;
  /** WMS-Dienst und Ebene des 20-cm-Luftbilds (DOP). */
  wmsUrl: string;
  wmsLayer: string;
}

export const OFFICIAL_SOURCES: Record<OfficialState, OfficialSource> = {
  BY: {
    state: "BY",
    label: "Bayern",
    zone: 32,
    epsg: 25832,
    surfaceCell: 0.2,
    attribution: "Datenquelle: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de",
    licence: "CC BY 4.0",
    wmsUrl: "https://geoservices.bayern.de/od/wms/dop/v1/dop20",
    wmsLayer: "by_dop20c",
  },
  SN: {
    state: "SN",
    label: "Sachsen",
    zone: 33,
    epsg: 25833,
    surfaceCell: 1,
    attribution: "Quelle: GeoSN, dl-de/by-2-0",
    licence: "Datenlizenz Deutschland – Namensnennung – 2.0",
    wmsUrl: "https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest",
    wmsLayer: "sn_dop_020",
  },
};

/** Bundeslandnamen aus OpenStreetMap/Nominatim auf unterstützte Quellen abbilden. */
export function officialStateFromName(name: string | undefined | null): OfficialState | null {
  const n = (name ?? "").trim().toLowerCase();
  if (n === "bayern" || n === "bavaria") return "BY";
  if (n === "sachsen" || n === "saxony") return "SN";
  return null;
}

/** Größtes Rastermaß des Untergrunds (Punkte je Achse) – begrenzt Speicher und Renderlast. */
export const MAX_GROUND_POINTS = 400;
/** Größter Ausschnitt in Metern je Achse. */
export const MAX_GROUND_SIZE = 200;
/** Höhenunterschied DOM − DGM, ab dem ein Punkt als Baum/Gebäude gilt. */
export const CANOPY_THRESHOLD = 3;

/**
 * WGS84 (Grad) → ETRS89/UTM (Meter). GRS80- und WGS84-Ellipsoid unterscheiden sich
 * hier um weniger als einen Millimeter; Formel nach Snyder (Transverse Mercator).
 */
export function latLonToUtm(lat: number, lon: number, zone: number): { x: number; y: number } {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon - (zone * 6 - 183)) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * sin * sin);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * cos * cos;
  const A = cos * lam;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const x =
    500000 +
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y =
    k0 *
    (M +
      N *
        Math.tan(phi) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { x, y };
}

export interface GroundWindow {
  /** Westen, Süden, Osten, Norden in UTM-Metern. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cols: number;
  rows: number;
  /** Rastermaß in Metern (Vielfaches der Quellauflösung). */
  cell: number;
}

/**
 * Ausschnitt um einen Mittelpunkt. Kanten und Rastermaß werden auf die Quellauflösung
 * gerastet, damit Quellpixel und Zielraster exakt übereinanderliegen.
 */
export function groundWindow(
  center: { x: number; y: number },
  width: number,
  length: number,
  sourceCell: number,
): GroundWindow {
  const w = Math.min(MAX_GROUND_SIZE, Math.max(10, width));
  const l = Math.min(MAX_GROUND_SIZE, Math.max(10, length));
  const factor = Math.max(1, Math.ceil(Math.max(w, l) / MAX_GROUND_POINTS / sourceCell));
  const cell = Math.round(factor * sourceCell * 1000) / 1000;
  const cols = Math.round(w / cell);
  const rows = Math.round(l / cell);
  const snapTo = (v: number) => Math.round(v / cell) * cell;
  const minX = snapTo(center.x - (cols * cell) / 2);
  const maxY = snapTo(center.y + (rows * cell) / 2);
  return { minX, maxY, maxX: minX + cols * cell, minY: maxY - rows * cell, cols, rows, cell };
}

/** Kacheln (Südwest-Ecke in Kilometern), die einen Ausschnitt berühren. */
export function tilesForWindow(
  win: Pick<GroundWindow, "minX" | "minY" | "maxX" | "maxY">,
  tileKm: number,
): { eastKm: number; northKm: number }[] {
  const size = tileKm * 1000;
  const tiles = [];
  for (let e = Math.floor(win.minX / size); e * size < win.maxX; e++)
    for (let n = Math.floor(win.minY / size); n * size < win.maxY; n++)
      tiles.push({ eastKm: e * tileKm, northKm: n * tileKm });
  return tiles;
}

/**
 * Entfernt Bäume und Gebäude: Wo das Oberflächenmodell mehr als `threshold` Meter
 * über dem Geländemodell liegt, wird das Gelände verwendet. Im Umkreis `radius`
 * (Meter) um solche Punkte werden auch flachere Reste (> `fringe` m) entfernt –
 * typisch für lichte Baumkronen im Winter. Obstacles abseits von Bäumen bleiben.
 */
export function removeCanopy(
  surface: Float32Array,
  terrain: Float32Array,
  cols: number,
  cell: number,
  threshold = CANOPY_THRESHOLD,
  radius = 2,
  fringe = 0.3,
): Float32Array {
  const rows = surface.length / cols;
  const diff = (i: number) => surface[i] - terrain[i];
  const canopy = new Uint8Array(surface.length);
  for (let i = 0; i < surface.length; i++) canopy[i] = diff(i) > threshold ? 1 : 0;
  // Maske um `radius` erweitern (quadratische Nachbarschaft genügt hier).
  const r = Math.max(0, Math.round(radius / cell));
  const near = new Uint8Array(surface.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!canopy[y * cols + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) near[yy * cols + xx] = 1;
        }
    }
  const out = new Float32Array(surface.length);
  for (let i = 0; i < surface.length; i++) {
    const s = surface[i];
    const t = terrain[i];
    const replace =
      !Number.isFinite(s) || (Number.isFinite(t) && (canopy[i] || (near[i] && diff(i) > fringe)));
    out[i] = replace ? t : s;
  }
  return out;
}

/**
 * Entfernt einzelne Ausreißer (Laternen, Masten, Personen, Messfehler): Ein Punkt, der
 * höher bzw. tiefer als mindestens 7 seiner 8 Nachbarn um mehr als `threshold` Meter
 * liegt, erhält den Median der Nachbarn. Durchgehende Kanten (Wände, Coping, Bowl-Rand)
 * haben gleich hohe Nachbarn entlang der Kante und bleiben erhalten.
 * Mehrere Durchläufe entfernen auch Ausreißer aus zwei benachbarten Punkten.
 */
export function despike(values: Float32Array, cols: number, threshold = 0.5, passes = 3): Float32Array {
  const rows = values.length / cols;
  let src = values;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(src);
    let changed = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const v = src[y * cols + x];
        const n: number[] = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if ((dx || dy) && yy >= 0 && yy < rows && xx >= 0 && xx < cols) n.push(src[yy * cols + xx]);
          }
        const lower = n.filter((h) => v - h > threshold).length;
        const higher = n.filter((h) => h - v > threshold).length;
        // Innen genügen 7 von 8 Nachbarn; am Rand müssen alle vorhandenen Nachbarn abweichen.
        const needed = n.length === 8 ? 7 : n.length;
        if (lower >= needed || higher >= needed) {
          n.sort((a, b) => a - b);
          const m = n.length >> 1;
          out[y * cols + x] = n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
          changed++;
        }
      }
    src = out;
    if (!changed) break;
  }
  return src;
}

/**
 * Verfeinert ein Raster für die Darstellung (Catmull-Rom, geht durch die Originalpunkte).
 * Grobe 1-m-Daten wirken dadurch weniger kantig, ohne Bowls oder Rampen abzuflachen.
 * Höhenabfragen für Obstacles nutzen weiterhin das Originalraster.
 */
export function refineGrid(grid: TerrainGrid, factor: number): TerrainGrid {
  if (factor <= 1) return grid;
  const { cols, rows, heights } = grid;
  const nc = (cols - 1) * factor + 1;
  const nr = (rows - 1) * factor + 1;
  const at = (x: number, y: number) =>
    heights[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const out = new Float32Array(nc * nr);
  for (let j = 0; j < nr; j++) {
    const fy = j / factor;
    const y = Math.floor(fy);
    const ty = fy - y;
    for (let i = 0; i < nc; i++) {
      const fx = i / factor;
      const x = Math.floor(fx);
      const tx = fx - x;
      const col = (yy: number) => cubic(at(x - 1, yy), at(x, yy), at(x + 1, yy), at(x + 2, yy), tx);
      out[j * nc + i] = cubic(col(y - 1), col(y), col(y + 1), col(y + 2), ty);
    }
  }
  // Ausdehnung bleibt gleich: Mitte-zu-Mitte-Abstand der neuen Punkte ist kleiner.
  const cellX = grid.width / cols;
  const cellZ = grid.length / rows;
  return {
    cols: nc,
    rows: nr,
    width: (cols - 1) * cellX + cellX / factor,
    length: (rows - 1) * cellZ + cellZ / factor,
    heights: out,
  };
}

/**
 * Höhen relativ zu einer Basis (2-%-Quantil), damit der Park nahe y = 0 liegt.
 * Ungültige Werte (NoData) werden durch die Basis ersetzt.
 */
export function relativeHeights(values: Float32Array): {
  heights: Float32Array;
  base: number;
  min: number;
  max: number;
} {
  const valid = Array.from(values).filter((v) => Number.isFinite(v) && v > -1000);
  if (valid.length === 0) throw new Error("GROUND_EMPTY");
  valid.sort((a, b) => a - b);
  const base = valid[Math.floor(valid.length * 0.02)];
  const heights = new Float32Array(values.length);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const h = Number.isFinite(v) && v > -1000 ? Math.round((v - base) * 100) / 100 : 0;
    heights[i] = h;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { heights, base, min, max };
}

/** Beschreibung eines gespeicherten Höhenrasters (Teil des Parkinhalts). */
export interface TerrainGrid {
  cols: number;
  rows: number;
  /** Ausdehnung in Metern; das Raster ist auf den Parkmittelpunkt zentriert. */
  width: number;
  length: number;
  heights: Float32Array;
}

/**
 * Bilineare Höhe an einer Parkposition. Rasterpunkte liegen in Zellmitten;
 * außerhalb des Rasters wird der Randwert verwendet.
 */
export function terrainHeightAt(grid: TerrainGrid, x: number, z: number): number {
  const { cols, rows, width, length, heights } = grid;
  const fx = ((x + width / 2) / width) * cols - 0.5;
  const fz = ((z + length / 2) / length) * rows - 0.5;
  const cx = Math.min(cols - 1, Math.max(0, fx));
  const cz = Math.min(rows - 1, Math.max(0, fz));
  const x0 = Math.floor(cx);
  const z0 = Math.floor(cz);
  const x1 = Math.min(cols - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = cx - x0;
  const tz = cz - z0;
  const h = (c: number, r: number) => heights[r * cols + c];
  return (
    (h(x0, z0) * (1 - tx) + h(x1, z0) * tx) * (1 - tz) +
    (h(x0, z1) * (1 - tx) + h(x1, z1) * tx) * tz
  );
}

/**
 * Unterkante eines Obstacles auf dem Gelände: niedrigster Punkt unter Ecken und Mitte
 * der (gedrehten) Grundfläche. So steht ein Obstacle nicht in der Luft und liegt nicht
 * doppelt auf einem bereits im Oberflächenmodell enthaltenen Obstacle.
 */
export function footprintBase(
  grid: TerrainGrid,
  o: { x: number; z: number; width: number; length: number; rotation: number },
): number {
  const r = (-o.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const points: [number, number][] = [
    [0, 0],
    [-o.width / 2, -o.length / 2],
    [o.width / 2, -o.length / 2],
    [o.width / 2, o.length / 2],
    [-o.width / 2, o.length / 2],
  ];
  // Dreht wie three.js um die Hochachse (positiver Winkel = gegen den Uhrzeigersinn von oben).
  return Math.min(
    ...points.map(([lx, lz]) =>
      terrainHeightAt(grid, o.x + lx * cos + lz * sin, o.z - lx * sin + lz * cos),
    ),
  );
}

/**
 * Tiefster und höchster Geländepunkt unter einer (gedrehten) Grundfläche, abgetastet
 * in einem `samples` × `samples`-Raster. Ein „Bereich“ (z. B. Bowl) reicht damit vom
 * Boden bis zur Kante und bleibt sichtbar und anpinnbar.
 */
export function footprintRange(
  grid: TerrainGrid,
  o: { x: number; z: number; width: number; length: number; rotation: number },
  samples = 7,
): { min: number; max: number } {
  const r = (-o.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples; i++)
    for (let j = 0; j < samples; j++) {
      const lx = (i / (samples - 1) - 0.5) * o.width;
      const lz = (j / (samples - 1) - 0.5) * o.length;
      const h = terrainHeightAt(grid, o.x + lx * cos + lz * sin, o.z - lx * sin + lz * cos);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  return { min, max };
}

/** WMS-Adresse für das Luftbild eines Ausschnitts (für Vorschau und Übernahme). */
export function wmsImageUrl(
  source: OfficialSource,
  win: Pick<GroundWindow, "minX" | "minY" | "maxX" | "maxY">,
  maxPixels = 2048,
): string {
  const w = win.maxX - win.minX;
  const l = win.maxY - win.minY;
  // 20 cm pro Pixel, höchstens maxPixels an der längeren Seite.
  const scale = Math.min(maxPixels / Math.max(w, l), 5);
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: source.wmsLayer,
    STYLES: "",
    CRS: `EPSG:${source.epsg}`,
    BBOX: [win.minX, win.minY, win.maxX, win.maxY].map((v) => v.toFixed(2)).join(","),
    WIDTH: String(Math.round(w * scale)),
    HEIGHT: String(Math.round(l * scale)),
    FORMAT: "image/jpeg",
  });
  return `${source.wmsUrl}?${params}`;
}
