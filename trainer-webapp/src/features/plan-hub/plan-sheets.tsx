"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Play, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isYoutubeVideoId } from "@/lib/youtube-video";
import { checkVideo, formatClip, removeVideo, uploadVideo, videoLimits, type UploadedVideo } from "./video-upload";
import { formatRelative, shortName, words, type WaitingReport } from "./plan-hub-model";
import styles from "./plan-hub.module.css";

/**
 * Bottom-Sheet auf dem Handy, rechte Seitenleiste auf dem Desktop.
 * Escape und Klick auf den Hintergrund schließen das Sheet.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <span className={styles.sheetHandle} aria-hidden="true" />
        <button type="button" className={styles.sheetClose} aria-label="Schließen" onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </section>
    </div>
  );
}

export interface ReportInput {
  note: string;
  video: { storagePath: string; durationSeconds: number } | null;
}

type UploadState =
  | { phase: "idle"; error?: string }
  | { phase: "uploading"; fileName: string; percent: number }
  | { phase: "done"; video: UploadedVideo };

/**
 * „<Trick> melden“ für Athlet*innen: Video aufnehmen oder aus der Galerie
 * wählen (MP4/MOV, max. 60 Sekunden, max. 50 MB) und/oder eine Notiz.
 * Das Video geht direkt in den privaten Speicher und wird nach 14 Tagen gelöscht.
 */
export function ReportSheet({
  trickName,
  busy,
  onSubmit,
  onClose,
}: {
  trickName: string;
  busy: boolean;
  onSubmit: (input: ReportInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [note, setNote] = useState("");
  const noteId = useId();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const w = words();

  async function pick(file: File | undefined) {
    if (!file) return;
    const check = await checkVideo(file);
    if (!check.ok) {
      setUpload({ phase: "idle", error: check.error });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setUpload({ phase: "uploading", fileName: file.name, percent: 0 });
    try {
      const video = await uploadVideo(file, check.extension, check.seconds, (percent) =>
        setUpload({ phase: "uploading", fileName: file.name, percent }),
        controller.signal,
      );
      setUpload({ phase: "done", video });
    } catch (error) {
      const aborted = (error as Error).name === "AbortError";
      setUpload({ phase: "idle", error: aborted ? undefined : (error as Error).message });
    } finally {
      abort.current = null;
    }
  }

  function discard() {
    abort.current?.abort();
    if (upload.phase === "done") void removeVideo(upload.video.storagePath);
    setUpload({ phase: "idle" });
  }

  // Schließen ohne Melden räumt ein bereits hochgeladenes Video wieder weg.
  function close() {
    discard();
    onClose();
  }

  const video = upload.phase === "done" ? upload.video : null;
  const canSend = !busy && upload.phase !== "uploading" && (Boolean(video) || note.trim().length > 0);

  return (
    <Sheet label={`${trickName} melden`} onClose={close}>
      <h2 className={styles.sheetTitle}>{trickName} melden</h2>
      <p className={styles.sheetLead}>Zeig {w.dat}, dass du ihn kannst.</p>

      <input
        ref={cameraInput}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {upload.phase === "done" ? (
        <div className={styles.videoDone}>
          <span className={styles.videoThumb}>
            <Play size={14} fill="currentColor" aria-hidden="true" /> {formatClip(upload.video.durationSeconds)}
          </span>
          <div>
            <strong>
              <Check size={16} aria-hidden="true" /> Video hochgeladen
            </strong>
            <small>{upload.video.fileName}</small>
          </div>
          <button type="button" className={styles.textDanger} onClick={discard}>
            Entfernen
          </button>
        </div>
      ) : upload.phase === "uploading" ? (
        <div className={styles.uploadBox}>
          <div className={styles.rowBetween}>
            <strong>{upload.fileName}</strong>
            <span>{upload.percent} %</span>
          </div>
          <span className={styles.uploadTrack}>
            <span style={{ width: `${upload.percent}%` }} />
          </span>
          <button type="button" className={styles.linkButton} onClick={discard}>
            Abbrechen
          </button>
        </div>
      ) : (
        <>
          <div className={styles.pickGrid}>
            <button type="button" className={styles.pickTile} onClick={() => cameraInput.current?.click()}>
              <span className={styles.recordIcon} aria-hidden="true" />
              Video aufnehmen
            </button>
            <button type="button" className={styles.pickTile} onClick={() => galleryInput.current?.click()}>
              <Upload size={30} className={styles.textBlue} aria-hidden="true" />
              Aus Galerie
            </button>
          </div>
          <small className={upload.error ? styles.fieldError : styles.fieldHint}>
            {upload.error || "MP4 oder MOV · max. 60 Sek. · max. 50 MB · optional"}
          </small>
        </>
      )}

      <div className={styles.field}>
        <label htmlFor={noteId}>
          Notiz <span>· optional</span>
        </label>
        <input
          id={noteId}
          maxLength={2000}
          placeholder="z. B. 4 von 5 sauber gelandet"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Button
        size="lg"
        className={styles.sheetSubmit}
        disabled={!canSend}
        onClick={async () => {
          const sent = await onSubmit({
            note: note.trim(),
            video: video ? { storagePath: video.storagePath, durationSeconds: video.durationSeconds } : null,
          });
          // Gemeldete Videos gehören jetzt zum Nachweis und bleiben erhalten.
          if (sent) setUpload({ phase: "idle" });
        }}
      >
        {busy ? "Wird gesendet …" : video ? "Mit Video melden" : "Melden"}
      </Button>
      <small className={styles.fieldHint}>
        Nur du und {w.nom} sehen das Video. Es wird nach {videoLimits.retentionDays} Tagen automatisch gelöscht.
      </small>
    </Sheet>
  );
}

/** Freigabe einer Meldung durch Trainer*innen: Video, Notiz, Entscheidung. */
export function ReviewSheet({
  report,
  busy,
  onConfirm,
  onAgain,
  onClose,
}: {
  report: WaitingReport;
  busy: boolean;
  onConfirm: (feedback: string) => void;
  onAgain: (feedback: string) => void;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const feedbackId = useId();
  const { assignment, trick, evidence } = report;
  const name = shortName(assignment.athleteName);
  const youtubeId = evidence?.provider === "youtube" && evidence.videoId && isYoutubeVideoId(evidence.videoId) ? evidence.videoId : null;

  return (
    <Sheet label={`${name} · ${trick.name}`} onClose={onClose}>
      <div className={styles.reviewHead}>
        <span className={styles.avatarLg}>{assignment.initials}</span>
        <div>
          <strong>
            {name} · {trick.name}
          </strong>
          <small>{evidence ? `Gemeldet ${formatRelative(evidence.submittedAt)}` : "Gemeldet · ohne Video"}</small>
        </div>
      </div>

      {evidence?.provider === "upload" && evidence.videoUrl ? (
        <div className={styles.videoFrame}>
          <video src={evidence.videoUrl} controls playsInline preload="metadata" />
        </div>
      ) : youtubeId ? (
        <div className={styles.videoFrame}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
            title={`Video: ${name} · ${trick.name}`}
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className={`${styles.videoFrame} ${styles.videoEmpty}`}>
          <span>
            {evidence?.videoRemovedAt
              ? `Video nach ${videoLimits.retentionDays} Tagen automatisch gelöscht`
              : evidence?.provider === "upload"
                ? "Video nicht verfügbar"
                : "Ohne Video gemeldet"}
          </span>
        </div>
      )}

      {evidence ? (
        <>
          <p className={styles.quote}>
            {evidence.athleteComment ? `„${evidence.athleteComment}“` : "Keine Notiz"}
          </p>
          {evidence.attemptCount ? (
            <p className={styles.meta}>
              {evidence.attemptCount} {evidence.attemptCount === 1 ? "Versuch" : "Versuche"}
              {evidence.selfRating ? ` · Selbsteinschätzung ${evidence.selfRating}/5` : ""}
            </p>
          ) : null}
        </>
      ) : null}

      <div className={styles.field}>
        <label htmlFor={feedbackId}>
          Hinweis an {name.split(" ")[0]} <span>· optional</span>
        </label>
        <input
          id={feedbackId}
          maxLength={2000}
          placeholder="z. B. Schultern parallel zum Board"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </div>

      <div className={styles.decision}>
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => onAgain(feedback.trim())}>
          Nochmal üben
        </Button>
        <Button variant="success" size="lg" disabled={busy} onClick={() => onConfirm(feedback.trim())}>
          <Check size={18} aria-hidden="true" /> Bestätigen
        </Button>
      </div>
    </Sheet>
  );
}
