"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { createClient } from "@/lib/supabase/client";
import type { ModelFormat } from "@/domain/parks";

/**
 * Schritt 7b – eigene 3D-Modelle und Höhenraster im Browser.
 * Dateien werden vor dem Hochladen lokal geprüft (lesbar, Größe, Dreiecke), damit
 * nur verwendbare Modelle im Speicher landen. Anzeige erfolgt über signierte URLs.
 */

export const MODEL_BUCKET = "skatepark-models";

/**
 * Obergrenzen je Datei. 50 MB ist das Maximum des Supabase-Free-Plans (globale Grenze).
 * Nach einem Wechsel auf Pro können hier und im Bucket `skatepark-models` (Migration
 * `20260926005815_raise_park_model_limit.sql`) z. B. 80 MB eingetragen werden.
 */
export const MODEL_LIMITS = {
  ground: { bytes: 50 * 1024 * 1024, triangles: 1_500_000 },
  obstacle: { bytes: 50 * 1024 * 1024, triangles: 300_000 },
} as const;

/** Lesbare Beschreibung der Grenzen für Hinweise in der Oberfläche. */
export function describeLimit(purpose: keyof typeof MODEL_LIMITS): string {
  const limit = MODEL_LIMITS[purpose];
  return `höchstens ${Math.round(limit.bytes / 1024 / 1024)} MB und ${limit.triangles.toLocaleString("de-DE")} Dreiecke`;
}

/** Meter je Modelleinheit. OBJ/CAD legen keine Einheit fest; glTF ist per Definition Meter. */
export const MODEL_UNITS = {
  m: { label: "Meter", scale: 1 },
  cm: { label: "Zentimeter", scale: 0.01 },
  mm: { label: "Millimeter", scale: 0.001 },
  in: { label: "Zoll", scale: 0.0254 },
} as const;
export type ModelUnit = keyof typeof MODEL_UNITS;

const CONTENT_TYPES: Record<ModelFormat, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
};

export function formatFromName(name: string): ModelFormat | null {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "glb" || ext === "gltf" || ext === "obj" ? ext : null;
}

/** Wandelt die Datei in three.js-Objekte um. Wirft verständliche Fehlermeldungen. */
export async function parseModel(data: ArrayBuffer, format: ModelFormat): Promise<THREE.Object3D> {
  if (format === "obj") {
    const object = new OBJLoader().parse(new TextDecoder().decode(data));
    if (object.children.length === 0) throw new Error("Die OBJ-Datei enthält keine Geometrie.");
    return object;
  }
  if (format === "gltf") {
    // Nur eigenständige glTF-Dateien: externe .bin- oder Bilddateien fehlen nach dem Upload.
    const json = JSON.parse(new TextDecoder().decode(data));
    const external = [...(json.buffers ?? []), ...(json.images ?? [])].some(
      (entry: { uri?: string }) => entry.uri && !entry.uri.startsWith("data:"),
    );
    if (external)
      throw new Error("Diese glTF-Datei verweist auf weitere Dateien. Bitte als GLB exportieren.");
  }
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) =>
    loader.parse(
      data,
      "",
      (gltf) => resolve(gltf.scene),
      (error) => {
        const message = String((error as unknown as { message?: string })?.message ?? error);
        reject(
          new Error(
            /draco/i.test(message)
              ? "Draco-komprimierte glTF-Dateien werden nicht unterstützt. Bitte ohne Kompression exportieren."
              : "Die glTF-Datei konnte nicht gelesen werden.",
          ),
        );
      },
    ),
  );
}

/** Dreht Z-oben-Modelle (CAD) in das Y-oben-System der Szene. */
export function applyUpAxis(object: THREE.Object3D, upAxis: "y" | "z" = "y") {
  object.rotation.set(upAxis === "z" ? -Math.PI / 2 : 0, 0, 0);
  object.updateMatrixWorld(true);
  return object;
}

export function countTriangles(object: THREE.Object3D): number {
  let count = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    count += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(count);
}

export interface ModelCheck {
  format: ModelFormat;
  triangles: number;
  /** Maße in Modelleinheiten (Breite x, Höhe y, Tiefe z) nach Hochachse. */
  size: { x: number; y: number; z: number };
  suggestedUnit: ModelUnit;
}

/** Lokale Prüfung vor dem Hochladen. */
export async function checkModelFile(
  file: File,
  purpose: keyof typeof MODEL_LIMITS,
  upAxis: "y" | "z",
): Promise<ModelCheck> {
  const format = formatFromName(file.name);
  if (!format) throw new Error("Bitte eine .glb-, .gltf- oder .obj-Datei wählen.");
  const limit = MODEL_LIMITS[purpose];
  if (file.size > limit.bytes)
    throw new Error(`Die Datei ist zu groß (höchstens ${Math.round(limit.bytes / 1024 / 1024)} MB).`);
  const object = applyUpAxis(await parseModel(await file.arrayBuffer(), format), upAxis);
  const triangles = countTriangles(object);
  if (triangles === 0) throw new Error("Das Modell enthält keine Flächen.");
  if (triangles > limit.triangles)
    throw new Error(
      `Das Modell hat zu viele Dreiecke (${triangles.toLocaleString("de-DE")}, höchstens ${limit.triangles.toLocaleString("de-DE")}). Bitte vereinfachen.`,
    );
  const box = new THREE.Box3().setFromObject(object);
  const v = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(v.x) || Math.max(v.x, v.y, v.z) <= 0)
    throw new Error("Die Maße des Modells sind ungültig.");
  const biggest = Math.max(v.x, v.y, v.z);
  // Plausible Einheit raten: Skateparks sind < 300 m, Obstacles < 30 m.
  const maxMeters = purpose === "ground" ? 300 : 30;
  const suggestedUnit: ModelUnit =
    format !== "obj" || biggest <= maxMeters ? "m" : biggest <= maxMeters * 100 ? "cm" : "mm";
  return { format, triangles, size: { x: v.x, y: v.y, z: v.z }, suggestedUnit };
}

/** Lädt die geprüfte Datei in den eigenen Ordner des Modell-Speichers. */
export async function uploadModelFile(file: File, userId: string, format: ModelFormat) {
  const path = `${userId}/${crypto.randomUUID()}.${format}`;
  const { error } = await createClient()
    .storage.from(MODEL_BUCKET)
    .upload(path, file, { contentType: CONTENT_TYPES[format], upsert: false });
  if (error) throw new Error("Das Modell konnte nicht hochgeladen werden.");
  return { path, previewUrl: URL.createObjectURL(file) };
}

// Geladene Dateien je URL zwischenspeichern: mehrere Obstacles teilen sich ein Modell.
const modelCache = new Map<string, Promise<THREE.Object3D>>();
const terrainCache = new Map<string, Promise<Float32Array>>();

export function loadModel(url: string, format: ModelFormat): Promise<THREE.Object3D> {
  let hit = modelCache.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Modell nicht erreichbar.");
        return r.arrayBuffer();
      })
      .then((data) => parseModel(data, format));
    modelCache.set(url, hit);
    hit.catch(() => modelCache.delete(url));
  }
  return hit;
}

export function loadTerrain(url: string, expected: number): Promise<Float32Array> {
  let hit = terrainCache.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Höhenraster nicht erreichbar.");
        return r.arrayBuffer();
      })
      .then((data) => {
        const values = new Float32Array(data);
        if (values.length !== expected) throw new Error("Höhenraster hat eine unerwartete Größe.");
        return values;
      });
    terrainCache.set(url, hit);
    hit.catch(() => terrainCache.delete(url));
  }
  return hit;
}
