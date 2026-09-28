"use client";

import { createClient } from "@/lib/supabase/client";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2400;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Verkleinert ein Luftbild auf höchstens 2400 px Kantenlänge, speichert es als
 * WebP im eigenen Ordner des privaten Buckets und liefert Pfad und Seitenverhältnis.
 * Die Freigabe des Bildes für den Park erfolgt erst beim Speichern der Parkversion.
 */
export async function uploadAerialImage(
  file: File,
  userId: string,
): Promise<{ path: string; aspect: number; previewUrl: string }> {
  if (!ALLOWED.includes(file.type))
    throw new Error("Bitte ein JPG-, PNG- oder WebP-Bild wählen.");
  if (file.size > MAX_INPUT_BYTES)
    throw new Error("Das Bild ist zu groß (höchstens 20 MB).");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const aspect = bitmap.height / bitmap.width;
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("Das Bild konnte nicht verarbeitet werden.");

  const path = `${userId}/${crypto.randomUUID()}.webp`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("skatepark-aerials")
    .upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error) throw new Error("Das Luftbild konnte nicht hochgeladen werden.");
  return { path, aspect, previewUrl: URL.createObjectURL(blob) };
}
