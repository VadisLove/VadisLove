"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { validateProfilePhoto } from "@/domain/profile";
import { createClient } from "@/lib/supabase/client";
import styles from "./profile-view.module.css";

const PROFILE_PHOTO_SIZE = 512;

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Das Bild konnte nicht gelesen werden."));
    };
    image.src = objectUrl;
  });
}

/**
 * Schneidet das Foto mittig quadratisch zu und komprimiert es vor dem Upload
 * auf 512 x 512 Pixel. WebP spart dabei auf Mobilgeraeten deutlich Daten.
 */
async function compressSquarePhoto(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Das Bild konnte nicht verarbeitet werden.");

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PROFILE_PHOTO_SIZE,
    PROFILE_PHOTO_SIZE,
  );

  if ("close" in image && typeof image.close === "function") image.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Die Komprimierung ist fehlgeschlagen.")),
      "image/webp",
      0.82,
    );
  });
}

export function ProfilePhotoEditor({
  userId,
  initials,
  initialPath,
  initialUrl,
}: {
  userId: string;
  initials: string;
  initialPath: string | null;
  initialUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoPath, setPhotoPath] = useState(initialPath);
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    const validationError = validateProfilePhoto(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const newPath = `${userId}/${crypto.randomUUID()}.webp`;
    let oldFileCleanupFailed = false;

    try {
      const compressed = await compressSquarePhoto(file);
      const uploadResult = await supabase.storage
        .from("profile-photos")
        .upload(newPath, compressed, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: false,
        });
      if (uploadResult.error) throw uploadResult.error;

      const profileResult = await supabase
        .from("profiles")
        .update({ avatar_path: newPath })
        .eq("id", userId);
      if (profileResult.error) {
        await supabase.storage.from("profile-photos").remove([newPath]);
        throw profileResult.error;
      }

      if (photoPath) {
        const removal = await supabase.storage
          .from("profile-photos")
          .remove([photoPath]);
        if (removal.error) {
          oldFileCleanupFailed = true;
          setMessage(
            "Das neue Foto ist aktiv. Die alte Datei konnte noch nicht bereinigt werden.",
          );
        }
      }

      const signed = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(newPath, 60 * 60);
      setPhotoPath(newPath);
      setPhotoUrl(signed.data?.signedUrl || null);
      if (!oldFileCleanupFailed) setMessage("Profilfoto wurde aktualisiert.");
    } catch {
      setError("Das Profilfoto konnte nicht hochgeladen werden. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!photoPath) return;
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();

    const profileResult = await supabase
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", userId);
    if (profileResult.error) {
      setError("Das Profilfoto konnte nicht entfernt werden.");
      setBusy(false);
      return;
    }

    const removal = await supabase.storage
      .from("profile-photos")
      .remove([photoPath]);
    setPhotoPath(null);
    setPhotoUrl(null);
    setMessage(
      removal.error
        ? "Das Foto ist nicht mehr sichtbar. Die Datei konnte noch nicht bereinigt werden."
        : "Profilfoto wurde entfernt.",
    );
    setBusy(false);
  };

  return (
    <div className={styles.photoEditor}>
      <div className={styles.avatar} aria-label={`Profilfoto von ${initials}`}>
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            sizes="112px"
            unoptimized
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className={styles.photoActions}>
        <input
          ref={inputRef}
          id="profile-photo"
          className={styles.visuallyHidden}
          type="file"
          aria-label="Profilfoto auswählen"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Camera size={18} />}
          {photoPath ? "Foto ersetzen" : "Foto hochladen"}
        </button>
        {photoPath ? (
          <button
            type="button"
            className={styles.textDangerButton}
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 size={17} />
            Foto löschen
          </button>
        ) : null}
        <small>JPG, PNG oder WebP bis 5 MB · quadratischer Mittelausschnitt</small>
        {message ? <p className={styles.inlineSuccess} role="status">{message}</p> : null}
        {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
