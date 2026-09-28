"use client";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";

/** Grenzen für Trick-Videos; dieselben Werte prüft die Datenbank erneut. */
export const videoLimits = {
  maxSeconds: 60,
  maxBytes: 50 * 1024 * 1024,
  types: ["video/mp4", "video/quicktime"],
  retentionDays: 14,
};

const bucket = "training-evidence-videos";

export interface UploadedVideo {
  storagePath: string;
  durationSeconds: number;
  fileName: string;
}

/** Liest die Videolänge lokal aus, ohne etwas hochzuladen. */
function readDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Video konnte nicht gelesen werden. Bitte MP4 oder MOV verwenden."));
    };
    video.src = url;
  });
}

/** Prüft Format, Größe und Länge vor dem Upload; gibt eine Fehlermeldung oder die Dauer zurück. */
export async function checkVideo(file: File): Promise<{ ok: true; seconds: number; extension: "mp4" | "mov" } | { ok: false; error: string }> {
  const lower = file.name.toLowerCase();
  const extension = file.type === "video/quicktime" || lower.endsWith(".mov") ? "mov" : file.type === "video/mp4" || lower.endsWith(".mp4") ? "mp4" : null;
  if (!extension) return { ok: false, error: "Nur MP4- oder MOV-Videos sind erlaubt." };
  if (file.size > videoLimits.maxBytes) {
    return { ok: false, error: "Das Video ist größer als 50 MB. Bitte kürzer aufnehmen oder zuschneiden." };
  }
  try {
    const seconds = await readDuration(file);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return { ok: false, error: "Die Videolänge konnte nicht erkannt werden." };
    }
    if (seconds > videoLimits.maxSeconds + 0.5) {
      return { ok: false, error: "Das Video ist länger als 60 Sekunden. Bitte zuschneiden." };
    }
    return { ok: true, seconds: Math.max(1, Math.round(seconds)), extension };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Lädt das Video direkt in den privaten Bucket (nicht über Vercel, dort gilt
 * ein Limit von 4,5 MB pro Anfrage). XHR statt supabase-js, damit der
 * Fortschritt angezeigt werden kann. Die Storage-Policy erlaubt nur den
 * eigenen Ordner, MP4/MOV und höchstens 10 Uploads pro 24 Stunden.
 */
export async function uploadVideo(
  file: File,
  extension: "mp4" | "mov",
  seconds: number,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<UploadedVideo> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error("Bitte erneut anmelden.");

  const { url, publishableKey } = getSupabaseConfig();
  const storagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const contentType = extension === "mov" ? "video/quicktime" : "video/mp4";

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${url}/storage/v1/object/${bucket}/${storagePath}`);
    request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    request.setRequestHeader("apikey", publishableKey);
    request.setRequestHeader("Content-Type", contentType);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else if (request.status === 413) reject(new Error("Das Video ist zu groß (max. 50 MB)."));
      else if (request.status === 400 || request.status === 403) {
        reject(new Error("Upload nicht erlaubt: nur für geübte Tricks und höchstens 10 Videos pro Tag."));
      } else reject(new Error("Upload fehlgeschlagen. Bitte erneut versuchen."));
    };
    request.onerror = () => reject(new Error("Keine Verbindung. Bitte erneut versuchen."));
    request.onabort = () => reject(new DOMException("Abgebrochen", "AbortError"));
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });

  return { storagePath, durationSeconds: seconds, fileName: file.name };
}

/** Entfernt ein noch nicht gemeldetes Video wieder (Policy erlaubt nur das). */
export async function removeVideo(storagePath: string) {
  await createClient().storage.from(bucket).remove([storagePath]);
}

export function formatClip(seconds: number | undefined) {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
