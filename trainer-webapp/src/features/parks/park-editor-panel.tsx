"use client";

import { PenTool, RotateCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { scaleObstacle } from "@/domain/park-geometry";
import {
  OBSTACLE_LIBRARY,
  OBSTACLE_TYPES,
  clamp,
  normalizeRotation,
  obstacleName,
  type Obstacle,
  type ParkContent,
} from "@/domain/parks";
import { uploadAerialImage } from "./aerial-upload";
import { GroundPanel } from "./ground-panel";
import { InfoTip } from "./info-tip";
import type { ModelBounds } from "./park-scene";
import { MODEL_UNITS, checkModelFile, uploadModelFile, type ModelCheck, type ModelUnit } from "./model-assets";
import styles from "./parks.module.css";

export interface ParkDraft {
  name: string;
  location: string;
  content: ParkContent;
}

/** Zahleneingabe, die erst beim Verlassen bzw. Enter übernimmt und Grenzen einhält. */
function NumberField({
  label,
  info,
  value,
  min,
  max,
  step = 0.25,
  onChange,
}: {
  label: string;
  /** Kurze Erklärung hinter dem „i“ neben der Beschriftung. */
  info?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const shown = String(Number(value.toFixed(2)));
  // Während der Eingabe freier Text; Übernahme und Begrenzung erst beim Verlassen.
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(v)) onChange(clamp(v, min, max));
    setText(null);
  };
  return (
    <label className={styles.field}>
      <span>
        {label}
        {info ? <InfoTip text={info} /> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text ?? shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

/**
 * Hinweis, wenn Park-Modell und Grundfläche nicht zusammenpassen: Ein sehr kleines Modell
 * deutet auf einen falschen Maßstab hin, eine viel größere Grundfläche macht Raster,
 * Kamera und Markierungen unübersichtlich.
 */
function ModelSizeHint({
  bounds,
  size,
  onFit,
}: {
  bounds: ModelBounds;
  size: ParkContent["size"];
  onFit: () => void;
}) {
  const w = bounds.maxX - bounds.minX;
  const l = bounds.maxZ - bounds.minZ;
  const m = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (Math.max(w, l) < 3)
    return (
      <p className={styles.hint} style={{ marginTop: 8 }}>
        Dein Modell ist nur ca. {m(w)} × {m(l)} m groß. Vermutlich stimmt der Maßstab nicht –
        prüfe unter „Untergrund“ den Wert „Maßstab (m/Einheit)“ (z. B. 1 statt 0,01).
      </p>
    );
  const tooBig = size.width > w * 1.6 + 10 || size.length > l * 1.6 + 10;
  if (!tooBig) return null;
  return (
    <div className={styles.hint} style={{ marginTop: 8 }}>
      Die Grundfläche ({m(size.width)} × {m(size.length)} m) ist deutlich größer als dein Modell (ca.{" "}
      {m(w)} × {m(l)} m). Das macht Raster und Ansicht unübersichtlich.
      <div className={styles.row} style={{ marginTop: 8 }}>
        <button type="button" className={styles.button} onClick={onFit}>
          Grundfläche an Modell anpassen
        </button>
      </div>
    </div>
  );
}

/**
 * Werkzeuge des Park-Bearbeitungsmodus: Bibliothek, Eigenschaften des gewählten
 * Obstacles, Grundfläche und Luftbild. Nur hier sind technische Modellwerte sichtbar.
 */
export function ParkEditorPanel({
  draft,
  userId,
  selectedId,
  usedObstacleIds,
  busy,
  onChange,
  onAdd,
  onSelect,
  onDrawZone,
  modelBounds,
  onFitToModel,
  onAssetPreview,
  onSave,
  onCancel,
}: {
  draft: ParkDraft;
  userId: string;
  selectedId: string | null;
  usedObstacleIds: Set<string>;
  busy: boolean;
  onChange: (draft: ParkDraft) => void;
  /** Neues Obstacle; `patch` überschreibt Standardwerte (z. B. Maße eines eigenen Modells). */
  onAdd: (type: Obstacle["type"], patch?: Partial<Obstacle>) => void;
  onSelect: (id: string | null) => void;
  /** Startet das Zeichnen eines Bereichs mit frei gesetzten Punkten. */
  onDrawZone: () => void;
  /** Tatsächliche Maße eines hochgeladenen Park-Modells (für den Größenhinweis). */
  modelBounds: ModelBounds | null;
  /** Grundfläche auf das Modell zuschneiden und alles mittig ausrichten. */
  onFitToModel: () => void;
  onAssetPreview: (urls: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customCheck, setCustomCheck] = useState<ModelCheck | null>(null);
  const [customUnit, setCustomUnit] = useState<ModelUnit>("m");
  const [customAxis, setCustomAxis] = useState<"y" | "z">("y");
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState("");
  const { content } = draft;
  const selected = content.obstacles.find((o) => o.id === selectedId) ?? null;
  const setContent = (next: Partial<ParkContent>) =>
    onChange({ ...draft, content: { ...content, ...next } });
  const updateObstacle = (patch: Partial<Obstacle>) =>
    selected &&
    setContent({
      obstacles: content.obstacles.map((o) =>
        o.id === selected.id ? { ...o, ...patch } : o,
      ),
    });
  const aerial = content.aerial ?? null;
  const setAerial = (patch: Partial<NonNullable<ParkContent["aerial"]>>) =>
    aerial && setContent({ aerial: { ...aerial, ...patch } });

  /** Eigenes Modell lokal prüfen (Größe, Dreiecke, Maße) und Einheit vorschlagen. */
  async function inspectCustom(file: File, axis: "y" | "z") {
    setCustomBusy(true);
    setCustomError("");
    try {
      const check = await checkModelFile(file, "obstacle", axis);
      setCustomFile(file);
      setCustomCheck(check);
      setCustomAxis(axis);
      setCustomUnit(check.suggestedUnit);
    } catch (error) {
      setCustomFile(null);
      setCustomCheck(null);
      setCustomError(error instanceof Error ? error.message : "Die Datei konnte nicht geprüft werden.");
    } finally {
      setCustomBusy(false);
      if (customInput.current) customInput.current.value = "";
    }
  }

  async function addCustom() {
    if (!customFile || !customCheck) return;
    setCustomBusy(true);
    try {
      const { path, previewUrl } = await uploadModelFile(customFile, userId, customCheck.format);
      onAssetPreview({ [path]: previewUrl });
      const s = MODEL_UNITS[customUnit].scale;
      // Maße aus der Datei übernehmen und in die gültigen Grenzen legen.
      const dim = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v * s * 100) / 100));
      onAdd("custom", {
        label: customFile.name.replace(/\.[^.]+$/, "").slice(0, 60),
        width: dim(customCheck.size.x, 0.1, 60),
        length: dim(customCheck.size.z, 0.1, 60),
        height: dim(customCheck.size.y, 0.05, 10),
        modelPath: path,
        modelFormat: customCheck.format,
        upAxis: customAxis,
      });
      setCustomFile(null);
      setCustomCheck(null);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "Hochladen fehlgeschlagen.");
    } finally {
      setCustomBusy(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const result = await uploadAerialImage(file, userId);
      onAssetPreview({ [result.path]: result.previewUrl });
      setContent({
        aerial: {
          path: result.path,
          aspect: Math.round(result.aspect * 10000) / 10000,
          width: aerial?.width ?? content.size.width,
          rotation: aerial?.rotation ?? 0,
          offsetX: aerial?.offsetX ?? 0,
          offsetZ: aerial?.offsetZ ?? 0,
          opacity: aerial?.opacity ?? 0.9,
          rightsConfirmed: false,
        },
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={styles.panel}>
      <div>
        <h2>Park bearbeiten</h2>
        <p className={styles.muted}>
          Speichern erzeugt eine neue Parkversion. Bestehende Runs bleiben auf ihrer Version.
        </p>
      </div>

      <div className={styles.form}>
        <label className={styles.field}>
          Name
          <input
            value={draft.name}
            maxLength={120}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Ort
          <input
            value={draft.location}
            maxLength={200}
            placeholder="z. B. Stadt, Straße"
            onChange={(e) => onChange({ ...draft, location: e.target.value })}
          />
        </label>
      </div>

      <section>
        <h3>Obstacle hinzufügen</h3>
        <p className={styles.muted}>
          Neue Obstacles erscheinen in der Parkmitte. Zum Verschieben ziehen oder auswählen
          und <strong>G</strong> (verschieben), <strong>R</strong> (drehen), <strong>S</strong>{" "}
          (skalieren) drücken.
        </p>
        <button type="button" className={styles.button} style={{ marginTop: 8 }} onClick={onDrawZone}>
          <PenTool size={16} /> Bereich zeichnen (B)
        </button>
        <div className={styles.library}>
          {OBSTACLE_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => onAdd(type)}>
              {OBSTACLE_LIBRARY[type].label}
            </button>
          ))}
          {/* Schritt 7b: Bereich für Gelände-Elemente, eigenes Modell als Datei. */}
          <button type="button" onClick={() => onAdd("zone")}>
            {OBSTACLE_LIBRARY.zone.label}
          </button>
          <button type="button" onClick={() => customInput.current?.click()} disabled={customBusy}>
            {customBusy ? "Prüft …" : "Eigenes Modell"}
          </button>
        </div>
        <input
          ref={customInput}
          type="file"
          accept=".glb,.gltf,.obj"
          hidden
          onChange={(e) => e.target.files?.[0] && inspectCustom(e.target.files[0], "y")}
        />
        {customFile && customCheck ? (
          <div className={styles.card} style={{ marginTop: 8 }}>
            <p className={styles.muted}>
              {customFile.name} · {customCheck.triangles.toLocaleString("de-DE")} Dreiecke · ca.{" "}
              {(customCheck.size.x * MODEL_UNITS[customUnit].scale).toFixed(2)} ×{" "}
              {(customCheck.size.z * MODEL_UNITS[customUnit].scale).toFixed(2)} m, Höhe{" "}
              {(customCheck.size.y * MODEL_UNITS[customUnit].scale).toFixed(2)} m
            </p>
            <div className={styles.twoCols}>
              <label className={styles.field}>
                <span>
                  Einheit
                  <InfoTip text="In welcher Einheit die Datei misst. Ist das Modell viel zu klein oder zu groß, stimmt meist die Einheit nicht (z. B. Zentimeter statt Meter)." />
                </span>
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as ModelUnit)}>
                  {Object.entries(MODEL_UNITS).map(([key, u]) => (
                    <option key={key} value={key}>{u.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Hochachse
                <select value={customAxis} onChange={(e) => inspectCustom(customFile, e.target.value as "y" | "z")}>
                  <option value="y">Y</option>
                  <option value="z">Z (CAD)</option>
                </select>
              </label>
            </div>
            <div className={styles.row} style={{ marginTop: 8 }}>
              <button type="button" className={styles.button} onClick={() => { setCustomFile(null); setCustomCheck(null); }}>
                Abbrechen
              </button>
              <button type="button" className={styles.primary} disabled={customBusy} onClick={addCustom}>
                Als Obstacle hinzufügen
              </button>
            </div>
          </div>
        ) : null}
        {customError ? <p className={styles.message} style={{ marginTop: 8 }}>{customError}</p> : null}
      </section>

      {selected ? (
        <section className={styles.card}>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <h3>{obstacleName(selected, content.obstacles)}</h3>
            <button type="button" className={styles.ghost} onClick={() => onSelect(null)}>
              Fertig
            </button>
          </div>
          <div className={styles.form}>
            <label className={styles.field}>
              Eigener Name (optional)
              <input
                value={selected.label ?? ""}
                maxLength={60}
                placeholder={OBSTACLE_LIBRARY[selected.type].label}
                onChange={(e) => updateObstacle({ label: e.target.value || undefined })}
              />
            </label>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="15 Grad gegen den Uhrzeigersinn drehen"
                onClick={() => updateObstacle({ rotation: normalizeRotation(selected.rotation - 15) })}
              >
                <RotateCcw size={18} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="15 Grad im Uhrzeigersinn drehen"
                onClick={() => updateObstacle({ rotation: normalizeRotation(selected.rotation + 15) })}
              >
                <RotateCw size={18} />
              </button>
              <span className={styles.muted}>{Math.round(selected.rotation)}°</span>
            </div>
            <div className={styles.threeCols}>
              {/* Über scaleObstacle, damit ein gezeichneter Umriss mitskaliert. */}
              <NumberField label="Breite m" info="Maße in Metern. Bei Bereichen wird die Höhe automatisch aus dem Gelände darunter berechnet (vom tiefsten bis zum höchsten Punkt) – der Wert hier ist nur das Minimum." value={selected.width} min={0.1} max={60} onChange={(width) => updateObstacle(scaleObstacle(selected, width / selected.width, 1, 1))} />
              <NumberField label="Tiefe m" value={selected.length} min={0.1} max={60} onChange={(length) => updateObstacle(scaleObstacle(selected, 1, length / selected.length, 1))} />
              <NumberField label="Höhe m" value={selected.height} min={0.05} max={10} step={0.05} onChange={(height) => updateObstacle({ height })} />
            </div>
            <div className={styles.threeCols}>
              {/* Achsen wie im Gizmo: X = Osten, Y = Norden (intern −z). */}
              <NumberField label="X m (Ost)" info="Lage der Obstacle-Mitte, gemessen von der Parkmitte (0/0): X = Richtung Osten, Y = Richtung Norden. Tipp: G, dann X oder Y und eine Zahl verschiebt exakt." value={selected.x} min={-200} max={200} onChange={(x) => updateObstacle({ x })} />
              <NumberField label="Y m (Nord)" value={-selected.z || 0} min={-200} max={200} onChange={(y) => updateObstacle({ z: -y || 0 })} />
              <NumberField label="Drehung °" info="Drehung um die Hochachse. Positive Werte drehen im Uhrzeigersinn (von oben gesehen)." value={selected.rotation} min={-360} max={360} step={5} onChange={(rotation) => updateObstacle({ rotation: normalizeRotation(rotation) })} />
            </div>
            <NumberField
              label={content.ground ? "Höhenversatz zum Gelände m" : "Höhenversatz m"}
              info="Hebt (+) oder senkt (−) das Obstacle. Bei 0 steht es auf dem tiefsten Geländepunkt unter seiner Grundfläche. Nutze das, wenn ein Obstacle in einer Senke schwebt oder im Gelände versinkt – z. B. +0,3 für ein Podest."
              value={selected.elevation ?? 0}
              min={-20}
              max={20}
              step={0.05}
              onChange={(elevation) => updateObstacle({ elevation: elevation || undefined })}
            />
            {selected.type === "zone" ? (
              <p className={styles.muted}>
                Ein Bereich markiert ein Gelände-Element (z. B. Bowl oder Snake Run), an das
                Tricks angepinnt werden können. Eckpunkte in der 3D-Ansicht ziehen; an der
                Kantenmitte ziehen fügt einen Punkt ein, Doppelklick entfernt ihn. Punkte per
                Klick bzw. Umschalt+Klick auswählen (A = alle) und mit G, R oder S bewegen.
              </p>
            ) : (
              <div className={styles.twoCols}>
                <NumberField label="Neigung X °" info="Kippt das Obstacle um seine Breitenachse (X) bzw. Längsachse (Y), z. B. für schräge Rails oder Banks. Wirkt nur auf die Darstellung; Pins und Fahrlinie bleiben gleich." value={selected.pitch ?? 0} min={-80} max={80} step={1} onChange={(pitch) => updateObstacle({ pitch: pitch || undefined })} />
                <NumberField label="Neigung Y °" value={selected.roll ?? 0} min={-80} max={80} step={1} onChange={(roll) => updateObstacle({ roll: roll || undefined })} />
              </div>
            )}
            {selected.type === "custom" ? (
              <label className={styles.field}>
                <span>
                  Hochachse der Datei
                  <InfoTip text="CAD-Programme (z. B. SketchUp, Revit) speichern oft mit Z nach oben. Liegt das Modell auf der Seite, hier „Z“ wählen." />
                </span>
                <select value={selected.upAxis ?? "y"} onChange={(e) => updateObstacle({ upAxis: e.target.value as "y" | "z" })}>
                  <option value="y">Y</option>
                  <option value="z">Z (CAD)</option>
                </select>
              </label>
            ) : null}
            {usedObstacleIds.has(selected.id) ? (
              <p className={styles.hint}>
                Wird in Runs verwendet. Diese bleiben auf ihrer bisherigen Parkversion.
              </p>
            ) : null}
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                setContent({ obstacles: content.obstacles.filter((o) => o.id !== selected.id) });
                onSelect(null);
              }}
            >
              <Trash2 size={16} /> Entfernen
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <h3>Grundfläche</h3>
        {content.ground?.kind === "terrain" ? (
          // Mit amtlichem Gelände ist die Fläche durch den Ausschnitt festgelegt.
          <p className={styles.muted}>
            {Math.round(content.ground.width)} × {Math.round(content.ground.length)} m, festgelegt durch das
            Gelände.
          </p>
        ) : (
          <div className={styles.twoCols}>
            <NumberField label="Breite m" info="Größe der Parkfläche in Metern. Sie bestimmt Raster, Kameraausschnitt und wo Punkte gesetzt werden können. Sie sollte nur etwas größer sein als dein Park bzw. Modell." value={content.size.width} min={10} max={300} step={1} onChange={(width) => setContent({ size: { ...content.size, width } })} />
            <NumberField label="Tiefe m" value={content.size.length} min={10} max={300} step={1} onChange={(length) => setContent({ size: { ...content.size, length } })} />
          </div>
        )}
        {content.ground?.kind === "model" && modelBounds ? (
          <ModelSizeHint bounds={modelBounds} size={content.size} onFit={onFitToModel} />
        ) : null}
      </section>

      <GroundPanel
        content={content}
        userId={userId}
        onChange={(next) => setContent(next)}
        onAssetPreview={onAssetPreview}
      />

      <section className={styles.form}>
        <h3>Luftbild</h3>
        <p className={styles.muted}>
          Screenshot, Parkplan oder Drohnenfoto als Positionierungshilfe. Die reale
          Bildbreite in Metern bestimmt den Maßstab; das Raster zeigt 1 m.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button type="button" className={styles.button} disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
          {uploading ? "Wird hochgeladen …" : aerial ? "Anderes Bild wählen" : "Bild hochladen"}
        </button>
        {uploadError ? <p className={styles.message}>{uploadError}</p> : null}
        {aerial ? (
          <>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={aerial.rightsConfirmed}
                onChange={(e) => setAerial({ rightsConfirmed: e.target.checked })}
              />
              Ich darf dieses Bild verwenden (eigene Aufnahme oder Nutzung erlaubt). Es
              ist für alle angemeldeten Nutzer im Park sichtbar.
            </label>
            <div className={styles.twoCols}>
              <NumberField label="Bildbreite m" info="Wie breit der Bildausschnitt in Wirklichkeit ist (Meter). Bestimmt den Maßstab – am besten eine bekannte Strecke im Bild nachmessen." value={aerial.width} min={5} max={400} step={0.5} onChange={(width) => setAerial({ width })} />
              <NumberField label="Drehung °" value={aerial.rotation} min={-360} max={360} step={1} onChange={(rotation) => setAerial({ rotation })} />
              <NumberField label="Versatz X m" info="Verschiebt das Luftbild, bis es mit Modell bzw. Obstacles übereinstimmt." value={aerial.offsetX} min={-200} max={200} step={0.5} onChange={(offsetX) => setAerial({ offsetX })} />
              <NumberField label="Versatz Z m" value={aerial.offsetZ} min={-200} max={200} step={0.5} onChange={(offsetZ) => setAerial({ offsetZ })} />
            </div>
            <label className={styles.field}>
              <span>
                Deckkraft
                <InfoTip text="Wie durchsichtig das Luftbild ist – niedriger Wert, um Obstacles darunter besser zu sehen." />
              </span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={aerial.opacity}
                onChange={(e) => setAerial({ opacity: Number(e.target.value) })}
              />
            </label>
            <button type="button" className={styles.ghost} onClick={() => setContent({ aerial: null })}>
              Luftbild entfernen
            </button>
          </>
        ) : null}
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className={styles.primary} onClick={onSave} disabled={busy || uploading}>
          {busy ? "Speichert …" : "Neue Version speichern"}
        </button>
      </div>
    </div>
  );
}
