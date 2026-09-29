"use client";

import type { TrainingSession } from "@/domain/training";
import { activeMs, firstName, hm } from "@/domain/live-training";
import { useNow } from "./live-shared";
import styles from "./live-entry.module.css";

/**
 * Übung, an der ein offenes Training zuletzt stand: laufender Timer, der beim
 * Pausieren gemerkte Timer oder die Übung der letzten Eingabe.
 */
export function currentExerciseIndex(session: TrainingSession) {
  const byId = (id: string | null | undefined) => (id ? session.exercises.findIndex((e) => e.id === id) : -1);
  const running = session.exercises.findIndex((e) => e.timer_started_at);
  if (running >= 0) return running;
  const resume = byId(session.resume_exercise_id);
  if (resume >= 0) return resume;
  const last = [...(session.recent ?? [])].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  return Math.max(0, byId(last?.exercise_id));
}

/** Dunkle Karte „Laufendes Training“ bzw. „Pausiertes Training · pausiert seit HH:MM“. */
export function RunningCard({
  session,
  onResume,
  compact = false,
}: {
  session: TrainingSession;
  onResume: (exerciseIndex: number) => void;
  /** Kompakt für die Planliste (Titel des Plans statt Übung). */
  compact?: boolean;
}) {
  const now = useNow(true);
  const paused = Boolean(session.paused_at);
  const index = currentExerciseIndex(session);
  const exercise = session.exercises[index];
  const present = session.participants.filter((p) => p.present).length;
  const who =
    session.mode === "group"
      ? `${present} Anwesende`
      : session.mode === "self"
        ? "Selbsttraining"
        : `Einzel · ${firstName(session.participants[0]?.athlete.display_name ?? "")}`;
  const since = paused
    ? `pausiert seit ${hm(session.paused_at!)}`
    : `seit ${Math.max(1, Math.round(activeMs(session, now || Date.parse(session.started_at)) / 60000))} Min`;
  const title = compact
    ? session.plan_snapshot.title
    : exercise
      ? `Übung ${index + 1}/${session.exercises.length} · ${exercise.content.name}`
      : session.plan_snapshot.title;
  return (
    <button
      type="button"
      className={styles.running}
      data-paused={paused}
      onClick={() => onResume(index)}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>
        <span className={styles.kicker}>{paused ? "Pausiertes Training" : "Laufendes Training"}</span>
        <strong>{title}</strong>
        <small>
          {who} · {since}
        </small>
      </span>
      <span className={styles.resume}>Fortsetzen</span>
    </button>
  );
}

/** Start-Karte je Rolle: Trainer → Start-Screen, Skater → Selbsttraining sofort. */
export function StartCard({
  athlete,
  disabled,
  onStart,
}: {
  athlete: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <div className={styles.card}>
      <div>
        <strong>{athlete ? "Selbsttraining" : "Live-Training"}</strong>
        <small>
          {athlete
            ? "Direkt los – alle Versuche und Quoten gehören dir."
            : "Einzeln oder als Gruppe. Zugewiesene sind vorausgewählt."}
        </small>
      </div>
      <button type="button" className={styles.start} disabled={disabled} onClick={onStart}>
        ▶ Training starten
      </button>
    </div>
  );
}

/** Eltern und Vorstand haben kein Startrecht: Hinweis statt gesperrtem Button. */
export function NoStartCard({
  parent,
  athleteName,
  onReview,
}: {
  parent: boolean;
  athleteName: string | null;
  onReview: () => void;
}) {
  const child = athleteName ? firstName(athleteName) : null;
  return (
    <div className={`${styles.card} ${styles.info}`}>
      <span className={styles.infoIcon} aria-hidden="true">
        i
      </span>
      <div>
        <strong>{parent ? "Das Training startet das Trainerteam" : "Starten kann das Trainerteam der Gruppe"}</strong>
        <p>
          {parent
            ? `Als Elternteil siehst du ${child ? `${child}s` : "die"} Ergebnisse nach jedem Training im Session-Rückblick. Starten können das Trainerteam der Gruppe oder ${child ?? "dein Kind"} selbst im Selbsttraining.`
            : "Als Vorstand verwaltest du Pläne und Vorlagen. Live-Trainings starten Personen, die der Gruppe im Trainerteam zugeordnet sind – oder Athleten im Selbsttraining."}
        </p>
        <button type="button" className={styles.link} onClick={onReview}>
          Session-Rückblick ansehen ›
        </button>
      </div>
    </div>
  );
}
