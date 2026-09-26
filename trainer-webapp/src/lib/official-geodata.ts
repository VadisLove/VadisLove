import { unzipSync } from "fflate";
import { fromArrayBuffer, fromUrl, type GeoTIFFImage } from "geotiff";
import {
  OFFICIAL_SOURCES,
  groundWindow,
  latLonToUtm,
  officialStateFromName,
  relativeHeights,
  removeCanopy,
  tilesForWindow,
  wmsImageUrl,
  type GroundWindow,
  type OfficialState,
} from "@/domain/geodata";

/**
 * Schritt 7b – serverseitiger Abruf amtlicher Geodaten (nur Server, nie im Browser).
 * Liest ausschließlich den benötigten Ausschnitt aus Höhenmodell-Kacheln und holt das
 * passende Luftbild per WMS. Alle Quellen sind lizenzfreie Open Data der Länder.
 */

const USER_AGENT = "TrainerHub-ParkPlanner/1.0 (+https://trainer-webapp-ruby.vercel.app)";
const TIMEOUT_MS = 45_000;
const MAX_ZIP_BYTES = 80 * 1024 * 1024;

/** Sachsen: ArcGIS-Dienst des Produktdownloads liefert die aktuellen Download-Links je Kachel. */
const SN_DOWNLOADS =
  "https://geodienste.sachsen.de/ags-relay/ArcGISServer/guest/arcgis/rest/services/geosn/rest_geosn_downloadlinks/MapServer";
const SN_LAYER = { surface: 4, terrain: 6 } as const;

async function fetchChecked(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GEODATA_HTTP_${response.status}`);
  return response;
}

/**
 * Überträgt den Teil einer Kachel, der im Ausschnitt liegt, in das Zielraster.
 * Kanten sind auf die Quellauflösung gerastet; Verkleinerung erfolgt bilinear.
 */
async function pasteImage(image: GeoTIFFImage, win: GroundWindow, out: Float32Array) {
  const [bx0, by0, bx1, by1] = image.getBoundingBox();
  const [rx, ryRaw] = image.getResolution();
  const ry = Math.abs(ryRaw);
  const ix0 = Math.max(win.minX, bx0);
  const ix1 = Math.min(win.maxX, bx1);
  const iy0 = Math.max(win.minY, by0);
  const iy1 = Math.min(win.maxY, by1);
  if (ix1 <= ix0 || iy1 <= iy0) return;
  const c0 = Math.round((ix0 - win.minX) / win.cell);
  const c1 = Math.round((ix1 - win.minX) / win.cell);
  const r0 = Math.round((win.maxY - iy1) / win.cell);
  const r1 = Math.round((win.maxY - iy0) / win.cell);
  if (c1 <= c0 || r1 <= r0) return;
  const px0 = Math.round((win.minX + c0 * win.cell - bx0) / rx);
  const px1 = Math.round((win.minX + c1 * win.cell - bx0) / rx);
  const py0 = Math.round((by1 - (win.maxY - r0 * win.cell)) / ry);
  const py1 = Math.round((by1 - (win.maxY - r1 * win.cell)) / ry);
  const noData = image.getGDALNoData();
  const [band] = (await image.readRasters({
    window: [px0, py0, px1, py1],
    width: c1 - c0,
    height: r1 - r0,
    resampleMethod: "bilinear",
    samples: [0],
  })) as unknown as Float32Array[];
  const w = c1 - c0;
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++) {
      const v = band[(r - r0) * w + (c - c0)];
      out[r * win.cols + c] = noData !== null && v === noData ? NaN : v;
    }
}

/** Bayern: Kacheln (1 km) direkt per HTTP-Range lesen – nur benötigte Bytes werden geladen. */
async function readBavaria(win: GroundWindow, kind: "surface" | "terrain"): Promise<Float32Array> {
  const out = new Float32Array(win.cols * win.rows).fill(NaN);
  for (const t of tilesForWindow(win, 1)) {
    const url =
      kind === "surface"
        ? `https://download1.bayernwolke.de/a/dom20/DOM/32${t.eastKm}_${t.northKm}_20_DOM.tif`
        : `https://download1.bayernwolke.de/a/dgm/dgm1/${t.eastKm}_${t.northKm}.tif`;
    const tiff = await fromUrl(url, { allowFullFile: false, headers: { "User-Agent": USER_AGENT } });
    await pasteImage(await tiff.getImage(), win, out);
  }
  return out;
}

/** Sachsen: Download-Links (2-km-Kacheln, ZIP mit GeoTIFF) über den Produktdienst ermitteln. */
async function readSaxony(
  win: GroundWindow,
  kind: "surface" | "terrain",
): Promise<{ values: Float32Array; stand: string | null }> {
  const params = new URLSearchParams({
    geometry: `${win.minX},${win.minY},${win.maxX},${win.maxY}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "25833",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "Download,Stand",
    returnGeometry: "false",
    f: "json",
  });
  const query = await fetchChecked(`${SN_DOWNLOADS}/${SN_LAYER[kind]}/query?${params}`);
  const features = ((await query.json()).features ?? []) as {
    attributes: { Download: string; Stand: string };
  }[];
  if (features.length === 0) throw new Error("GEODATA_NO_TILE");
  const out = new Float32Array(win.cols * win.rows).fill(NaN);
  for (const f of features) {
    // Nur Downloads vom Landesserver akzeptieren.
    if (!f.attributes.Download.startsWith("https://geocloud.landesvermessung.sachsen.de/"))
      throw new Error("GEODATA_UNEXPECTED_HOST");
    const zip = await fetchChecked(f.attributes.Download);
    const length = Number(zip.headers.get("content-length") ?? 0);
    if (length > MAX_ZIP_BYTES) throw new Error("GEODATA_TOO_LARGE");
    const bytes = new Uint8Array(await zip.arrayBuffer());
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error("GEODATA_TOO_LARGE");
    const files = unzipSync(bytes, { filter: (file) => /\.tiff?$/i.test(file.name) });
    const tif = Object.values(files)[0];
    if (!tif) throw new Error("GEODATA_NO_TIFF");
    const tiff = await fromArrayBuffer(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength) as ArrayBuffer);
    await pasteImage(await tiff.getImage(), win, out);
  }
  return { values: out, stand: features.map((f) => f.attributes.Stand).sort().pop() ?? null };
}

export interface OfficialGround {
  state: OfficialState;
  window: GroundWindow;
  heights: Float32Array;
  minHeight: number;
  maxHeight: number;
  /** Absolute Höhe (m über NHN), auf die sich das Raster bezieht. */
  base: number;
  stand: string | null;
  aerial: ArrayBuffer;
  center: { x: number; y: number };
}

/**
 * Höhenraster (Oberfläche ohne Bäume/Gebäude) und Luftbild für einen Ausschnitt.
 * `offset` verschiebt den Mittelpunkt in Metern (x = Osten, z = Süden).
 */
export async function loadOfficialGround(input: {
  state: OfficialState;
  lat: number;
  lon: number;
  width: number;
  length: number;
  offsetX: number;
  offsetZ: number;
}): Promise<OfficialGround> {
  const source = OFFICIAL_SOURCES[input.state];
  const utm = latLonToUtm(input.lat, input.lon, source.zone);
  const center = { x: utm.x + input.offsetX, y: utm.y - input.offsetZ };
  const win = groundWindow(center, input.width, input.length, source.surfaceCell);

  const [surface, terrain, aerial] = await Promise.all(
    input.state === "BY"
      ? [
          readBavaria(win, "surface").then((values) => ({ values, stand: null })),
          readBavaria(win, "terrain").then((values) => ({ values, stand: null })),
          fetchChecked(wmsImageUrl(source, win)).then((r) => r.arrayBuffer()),
        ]
      : [
          readSaxony(win, "surface"),
          readSaxony(win, "terrain"),
          fetchChecked(wmsImageUrl(source, win)).then((r) => r.arrayBuffer()),
        ],
  );
  const cleaned = removeCanopy(surface.values, terrain.values, win.cols, win.cell);
  const rel = relativeHeights(cleaned);
  return {
    state: input.state,
    window: win,
    heights: rel.heights,
    minHeight: rel.min,
    maxHeight: rel.max,
    base: rel.base,
    stand: surface.stand,
    aerial,
    center,
  };
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  state: OfficialState | null;
  stateName: string;
}

/**
 * Adresssuche über OpenStreetMap-Nominatim (Nutzungsrichtlinie: eigener User-Agent,
 * geringe Anfragerate, nur auf ausdrückliche Suche des Nutzers).
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "de",
    limit: "6",
  });
  const response = await fetchChecked(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "de" },
  });
  const rows = (await response.json()) as {
    display_name: string;
    lat: string;
    lon: string;
    address?: { state?: string };
  }[];
  return rows.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    state: officialStateFromName(r.address?.state),
    stateName: r.address?.state ?? "",
  }));
}
