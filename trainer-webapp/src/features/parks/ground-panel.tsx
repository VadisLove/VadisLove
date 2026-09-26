"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  OFFICIAL_SOURCES,
  groundWindow,
  latLonToUtm,
  wmsImageUrl,
  type OfficialState,
} from "@/domain/geodata";
import type { AerialImage, GeoReference, ModelGround, ParkContent, TerrainGround } from "@/domain/parks";
import {
  MODEL_UNITS,
  checkModelFile,
  uploadModelFile,
  type ModelCheck,
  type ModelUnit,
} from "./model-assets";
import styles from "./parks.module.css";

interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  state: OfficialState | null;
  stateName: string;
}

export interface OfficialGroundResult {
  size: { width: number; length: number };
  ground: TerrainGround;
  aerial: AerialImage;
  geo: GeoReference;
  urls: Record<string, string>;
}

const STEP = 5;

/**
 * Schritt 7b – Untergrund wählen: amtliche Daten (Bayern, Sachsen) per Adresssuche mit
 * Luftbild-Vorschau oder ein eigenes 3D-Modell des ganzen Parks.
 */
export function GroundPanel({
  content,
  userId,
  onChange,
  onAssetPreview,
}: {
  content: ParkContent;
  userId: string;
  onChange: (next: Partial<ParkContent>) => void;
  onAssetPreview: (urls: Record<string, string>) => void;
}) {
  const [mode, setMode] = useState<"official" | "model" | null>(null);
  const ground = content.ground ?? null;

  return (
    <section className={styles.form}>
      <h3>Untergrund</h3>
      {ground ? (
        <div className={styles.hint}>
          {ground.kind === "terrain" ? (
            <>
              Amtliches Höhenmodell · {Math.round(ground.width)} × {Math.round(ground.length)} m
              {ground.stand ? ` · Stand ${new Date(ground.stand).toLocaleDateString("de-DE")}` : ""}
              <br />
              <small>{ground.attribution}</small>
            </>
          ) : (
            <>Eigenes Park-Modell ({ground.format.toUpperCase()})</>
          )}
          <div className={styles.row} style={{ marginTop: 8 }}>
            <button type="button" className={styles.ghost} onClick={() => onChange({ ground: null, geo: null })}>
              Untergrund entfernen
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.muted}>
          Ohne Untergrund liegt der Park auf einer ebenen Fläche. Für Bayern und Sachsen
          können Luftbild und Gelände automatisch aus amtlichen Daten übernommen werden.
        </p>
      )}
      {ground?.kind === "model" ? <ModelGroundSettings ground={ground} onChange={(g) => onChange({ ground: g })} /> : null}
      <div className={styles.row}>
        <button
          type="button"
          className={mode === "official" ? styles.pointActive : styles.button}
          onClick={() => setMode(mode === "official" ? null : "official")}
        >
          <Search size={16} /> Amtliche Daten
        </button>
        <button
          type="button"
          className={mode === "model" ? styles.pointActive : styles.button}
          onClick={() => setMode(mode === "model" ? null : "model")}
        >
          <Upload size={16} /> Park-Modell
        </button>
      </div>
      {mode === "official" ? (
        <OfficialGroundPicker
          onApply={(result) => {
            onAssetPreview(result.urls);
            onChange({ size: result.size, ground: result.ground, aerial: result.aerial, geo: result.geo });
            setMode(null);
          }}
        />
      ) : null}
      {mode === "model" ? (
        <ModelGroundUpload
          userId={userId}
          onApply={(g, url) => {
            onAssetPreview({ [g.path]: url });
            onChange({ ground: g, geo: null });
            setMode(null);
          }}
        />
      ) : null}
    </section>
  );
}

function OfficialGroundPicker({ onApply }: { onApply: (result: OfficialGroundResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [place, setPlace] = useState<GeocodeResult | null>(null);
  const [width, setWidth] = useState(80);
  const [length, setLength] = useState(60);
  const [offset, setOffset] = useState({ x: 0, z: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch(`/api/parks/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setResults(data.results);
      if (data.results.length === 0) setMessage("Keine Treffer. Bitte Adresse oder Parkname genauer angeben.");
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Suche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  // Vorschau direkt vom WMS-Dienst des Landes; gleiche Berechnung wie auf dem Server.
  const preview = (() => {
    if (!place?.state) return null;
    const source = OFFICIAL_SOURCES[place.state];
    const utm = latLonToUtm(place.lat, place.lon, source.zone);
    const win = groundWindow({ x: utm.x + offset.x, y: utm.y - offset.z }, width, length, source.surfaceCell);
    return { url: wmsImageUrl(source, win, 900), source };
  })();

  async function apply() {
    if (!place?.state) return;
    setBusy(true);
    setMessage("Amtliche Daten werden geladen – das kann bis zu einer halben Minute dauern …");
    try {
      const response = await fetch("/api/parks/official", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: place.state, lat: place.lat, lon: place.lon, width, length, offsetX: offset.x, offsetZ: offset.z }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMessage("");
      onApply(data);
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Laden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const move = (dx: number, dz: number) => setOffset((o) => ({ x: o.x + dx, z: o.z + dz }));

  return (
    <div className={styles.card}>
      <form className={styles.row} onSubmit={search}>
        <input
          className={styles.search}
          style={{ marginBottom: 0, flex: 1 }}
          value={query}
          placeholder="Adresse oder Parkname, z. B. Alte Salzstraße 63 Leipzig"
          aria-label="Adresse suchen"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className={styles.button} disabled={busy || query.trim().length < 3}>
          Suchen
        </button>
      </form>
      {results && !place ? (
        <ul className={styles.list} style={{ marginTop: 10 }}>
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className={styles.listItem}
                style={{ width: "100%", textAlign: "left", cursor: r.state ? "pointer" : "default" }}
                disabled={!r.state}
                onClick={() => {
                  setPlace(r);
                  setOffset({ x: 0, z: 0 });
                }}
              >
                <div>
                  <strong>{r.label.split(",").slice(0, 3).join(",")}</strong>
                  <span className={styles.muted}>
                    {r.state ? OFFICIAL_SOURCES[r.state].label : `${r.stateName || "Unbekannt"} – noch keine amtlichen Daten angebunden`}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {place && preview ? (
        <div className={styles.form} style={{ marginTop: 10 }}>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <span className={styles.muted}>{place.label.split(",").slice(0, 2).join(",")}</span>
            <button type="button" className={styles.ghost} onClick={() => setPlace(null)}>
              Anderer Ort
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- externes WMS-Vorschaubild */}
          <img
            src={preview.url}
            alt="Luftbild-Vorschau des gewählten Ausschnitts"
            style={{ width: "100%", borderRadius: 8, aspectRatio: `${width} / ${length}`, objectFit: "cover", background: "#e6ebf0" }}
          />
          <small className={styles.muted}>{preview.source.attribution}</small>
          <div className={styles.row} aria-label="Ausschnitt verschieben">
            <button type="button" className={styles.iconButton} aria-label="Nach Norden verschieben" onClick={() => move(0, -STEP)}><ArrowUp size={16} /></button>
            <button type="button" className={styles.iconButton} aria-label="Nach Süden verschieben" onClick={() => move(0, STEP)}><ArrowDown size={16} /></button>
            <button type="button" className={styles.iconButton} aria-label="Nach Westen verschieben" onClick={() => move(-STEP, 0)}><ArrowLeft size={16} /></button>
            <button type="button" className={styles.iconButton} aria-label="Nach Osten verschieben" onClick={() => move(STEP, 0)}><ArrowRight size={16} /></button>
            <span className={styles.muted}>je {STEP} m</span>
          </div>
          <div className={styles.twoCols}>
            <label className={styles.field}>
              Breite m
              <input type="number" min={20} max={200} step={10} value={width} onChange={(e) => setWidth(Math.min(200, Math.max(20, Number(e.target.value) || 20)))} />
            </label>
            <label className={styles.field}>
              Tiefe m
              <input type="number" min={20} max={200} step={10} value={length} onChange={(e) => setLength(Math.min(200, Math.max(20, Number(e.target.value) || 20)))} />
            </label>
          </div>
          <p className={styles.muted}>
            Luftbild und Gelände werden für diesen Ausschnitt übernommen. Bäume und Gebäude
            werden aus dem Gelände entfernt; kleine Obstacles wie Ledges oder Rails setzt du
            weiterhin aus der Bibliothek.
          </p>
          <button type="button" className={styles.primary} disabled={busy} onClick={apply}>
            {busy ? "Wird geladen …" : "Ausschnitt übernehmen"}
          </button>
        </div>
      ) : null}
      {message ? <p className={styles.hint} style={{ marginTop: 10 }}>{message}</p> : null}
    </div>
  );
}

function ModelGroundUpload({
  userId,
  onApply,
}: {
  userId: string;
  onApply: (ground: ModelGround, previewUrl: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<ModelCheck | null>(null);
  const [unit, setUnit] = useState<ModelUnit>("m");
  const [upAxis, setUpAxis] = useState<"y" | "z">("y");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function inspect(next: File, axis = upAxis) {
    setBusy(true);
    setMessage("");
    try {
      const result = await checkModelFile(next, "ground", axis);
      setFile(next);
      setCheck(result);
      setUnit(result.suggestedUnit);
    } catch (error) {
      setFile(null);
      setCheck(null);
      setMessage(error instanceof Error ? error.message : "Die Datei konnte nicht geprüft werden.");
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file || !check) return;
    setBusy(true);
    try {
      const { path, previewUrl } = await uploadModelFile(file, userId, check.format);
      onApply(
        { kind: "model", path, format: check.format, upAxis, scale: MODEL_UNITS[unit].scale, rotation: 0, offsetX: 0, offsetY: 0, offsetZ: 0 },
        previewUrl,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hochladen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const s = MODEL_UNITS[unit].scale;
  return (
    <div className={styles.card}>
      <p className={styles.muted}>
        GLB, eigenständige glTF oder OBJ, höchstens 25 MB und 500 000 Dreiecke. Die Datei
        wird vor dem Hochladen im Browser geprüft.
      </p>
      <input
        ref={input}
        type="file"
        accept=".glb,.gltf,.obj"
        hidden
        onChange={(e) => e.target.files?.[0] && inspect(e.target.files[0])}
      />
      <button type="button" className={styles.button} disabled={busy} onClick={() => input.current?.click()} style={{ marginTop: 8 }}>
        <Upload size={16} /> {file ? file.name : "Datei wählen"}
      </button>
      {check ? (
        <div className={styles.form} style={{ marginTop: 10 }}>
          <p className={styles.muted}>
            {check.triangles.toLocaleString("de-DE")} Dreiecke · ca. {(check.size.x * s).toFixed(1)} ×{" "}
            {(check.size.z * s).toFixed(1)} m, Höhe {(check.size.y * s).toFixed(1)} m
          </p>
          <div className={styles.twoCols}>
            <label className={styles.field}>
              Einheit der Datei
              <select value={unit} onChange={(e) => setUnit(e.target.value as ModelUnit)}>
                {Object.entries(MODEL_UNITS).map(([key, u]) => (
                  <option key={key} value={key}>{u.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Hochachse
              <select
                value={upAxis}
                onChange={(e) => {
                  const axis = e.target.value as "y" | "z";
                  setUpAxis(axis);
                  if (file) inspect(file, axis);
                }}
              >
                <option value="y">Y (glTF, Blender-Export)</option>
                <option value="z">Z (CAD, SketchUp)</option>
              </select>
            </label>
          </div>
          <button type="button" className={styles.primary} disabled={busy} onClick={upload}>
            {busy ? "Wird hochgeladen …" : "Als Untergrund verwenden"}
          </button>
        </div>
      ) : null}
      {message ? <p className={styles.message} style={{ marginTop: 10 }}>{message}</p> : null}
    </div>
  );
}

/** Feinjustierung eines Park-Modells: Maßstab, Drehung und Versatz. */
function ModelGroundSettings({ ground, onChange }: { ground: ModelGround; onChange: (g: ModelGround) => void }) {
  const field = (label: string, key: "scale" | "rotation" | "offsetX" | "offsetY" | "offsetZ", step: number) => (
    <label className={styles.field}>
      {label}
      <input
        type="number"
        step={step}
        value={ground[key]}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && e.target.value !== "") onChange({ ...ground, [key]: v });
        }}
      />
    </label>
  );
  return (
    <div className={styles.threeCols}>
      {field("Maßstab (m/Einheit)", "scale", 0.001)}
      {field("Drehung °", "rotation", 5)}
      {field("Höhe m", "offsetY", 0.1)}
      {field("Versatz X m", "offsetX", 0.5)}
      {field("Versatz Z m", "offsetZ", 0.5)}
    </div>
  );
}
