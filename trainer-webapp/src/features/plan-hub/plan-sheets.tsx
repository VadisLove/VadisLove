"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Link2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isYoutubeVideoId, parseYoutubeVideoUrl } from "@/lib/youtube-video";
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
  youtubeUrl: string;
  note: string;
  attempts: number;
  rating: number;
}

/**
 * „<Trick> melden“ für Athlet*innen. Das Video ist optional und wird als
 * YouTube-Link übergeben (kein eigener Upload). Ohne Video wird nur der
 * Status „Gemeldet“ gesetzt; Notiz, Versuche und Selbsteinschätzung werden
 * zusammen mit dem Video als Nachweis gespeichert.
 */
export function ReportSheet({
  trickName,
  busy,
  onSubmit,
  onClose,
}: {
  trickName: string;
  busy: boolean;
  onSubmit: (input: ReportInput) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [attempts, setAttempts] = useState("");
  const [rating, setRating] = useState(3);
  const noteId = useId();
  const attemptsId = useId();
  const w = words();

  function linkVideo() {
    const parsed = parseYoutubeVideoUrl(url);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    setVideoId(parsed.videoId);
  }

  const attemptCount = Number(attempts);
  const videoReady = Boolean(videoId);
  const canSend = !busy && (!videoReady || (Number.isInteger(attemptCount) && attemptCount > 0));

  return (
    <Sheet label={`${trickName} melden`} onClose={onClose}>
      <h2 className={styles.sheetTitle}>{trickName} melden</h2>
      <p className={styles.sheetLead}>Zeig {w.dat}, dass du ihn kannst.</p>

      {videoReady ? (
        <div className={styles.videoDone}>
          <span className={styles.videoThumb}>
            <Play size={14} fill="currentColor" aria-hidden="true" />
          </span>
          <div>
            <strong>
              <Check size={16} aria-hidden="true" /> Video verknüpft
            </strong>
            <small>youtu.be/{videoId}</small>
          </div>
          <button
            type="button"
            className={styles.textDanger}
            onClick={() => {
              setVideoId("");
              setUrl("");
            }}
          >
            Entfernen
          </button>
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor={`${noteId}-url`}>
            Video-Link <span>· optional</span>
          </label>
          <div className={styles.inlineInput}>
            <input
              id={`${noteId}-url`}
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  linkVideo();
                }
              }}
            />
            <Button variant="secondary" onClick={linkVideo} disabled={!url.trim()}>
              <Link2 size={16} aria-hidden="true" /> Verknüpfen
            </Button>
          </div>
          <small className={error ? styles.fieldError : styles.fieldHint}>
            {error || "Video bei YouTube als „Nicht gelistet“ hochladen und den Link einfügen."}
          </small>
        </div>
      )}

      {videoReady ? (
        <>
          <div className={styles.twoFields}>
            <div className={styles.field}>
              <label htmlFor={attemptsId}>Wie oft probiert?</label>
              <input
                id={attemptsId}
                type="number"
                min={1}
                max={100000}
                inputMode="numeric"
                placeholder="z. B. 5"
                value={attempts}
                onChange={(event) => setAttempts(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Wie sicher?</span>
              <div className={styles.segmented} role="radiogroup" aria-label="Selbsteinschätzung">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    className={rating === value ? styles.segmentOn : undefined}
                    onClick={() => setRating(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
        </>
      ) : null}

      <Button
        size="lg"
        className={styles.sheetSubmit}
        disabled={!canSend}
        onClick={() =>
          onSubmit({
            youtubeUrl: videoReady ? `https://youtu.be/${videoId}` : "",
            note: note.trim(),
            attempts: attemptCount,
            rating,
          })
        }
      >
        {busy ? "Wird gesendet …" : videoReady ? "Mit Video melden" : "Ohne Video melden"}
      </Button>
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
  const videoId = evidence && isYoutubeVideoId(evidence.videoId) ? evidence.videoId : null;

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

      {videoId ? (
        <div className={styles.videoFrame}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
            title={`Video: ${name} · ${trick.name}`}
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className={`${styles.videoFrame} ${styles.videoEmpty}`}>
          <span>Ohne Video gemeldet</span>
        </div>
      )}

      {evidence ? (
        <>
          <p className={styles.quote}>
            {evidence.athleteComment ? `„${evidence.athleteComment}“` : "Keine Notiz"}
          </p>
          <p className={styles.meta}>
            {evidence.attemptCount} {evidence.attemptCount === 1 ? "Versuch" : "Versuche"} · Selbsteinschätzung{" "}
            {evidence.selfRating}/5
          </p>
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
