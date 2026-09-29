import type { TrainingPlan, TrainingTrick } from "./models";

/** Serverbestätigte Stände; Login und Athletenidentität bleiben getrennte Felder. */
export interface SavedPlan {
  id: string;
  title: string;
  versions: {
    id: string;
    version_number: number;
    content: TrainingPlan;
    created_at: string;
  }[];
}
export interface SessionExercise {
  id: string;
  source_trick_id: string;
  content: TrainingTrick;
  sort_order: number;
  note: string;
  elapsed_ms: number;
  timer_started_at: string | null;
}
export interface SessionParticipant {
  id: string;
  athlete_id: string;
  present: boolean;
  athlete: { id: string; user_id: string | null; display_name: string };
}
export interface TrainingSession {
  id: string;
  created_by: string;
  mode: "self" | "individual" | "group";
  source_key: string;
  plan_version_id: string | null;
  plan_snapshot: TrainingPlan;
  revision: number;
  status: "running" | "completed";
  note: string;
  started_at: string;
  completed_at: string | null;
  /** Pausiert, solange gesetzt; das Training bleibt dabei offen (`running`). */
  paused_at: string | null;
  /** Summe aller abgeschlossenen Pausen – zählt nicht zur aktiven Zeit. */
  paused_ms: number;
  pause_count: number;
  /** Übung, deren Timer beim Pausieren lief und beim Fortsetzen weiterläuft. */
  resume_exercise_id: string | null;
  participants: SessionParticipant[];
  exercises: SessionExercise[];
  totals: {
    participant_id: string;
    exercise_id: string;
    attempts: number;
    landed: number;
  }[];
  /** Nicht komplette Line-Versuche je Bruchstelle (`null` = ohne Angabe). */
  breaks: {
    participant_id: string;
    exercise_id: string;
    broke_at: number | null;
    attempts: number;
  }[];
  /** Letzte gültige Eingabe je Übung – Grundlage für „Rückgängig“. */
  recent: {
    exercise_id: string;
    participant_id: string;
    landed: boolean;
    broke_at: number | null;
    recorded_at: string;
  }[];
}
export interface TrainingWorkspace {
  plans: SavedPlan[];
  shares: TrainingPlan[];
  sessions: TrainingSession[];
  sharePeople: { id: string; name: string }[];
  /** Eigene Athleten; `group` = erster Verein bzw. erste Gruppe für die Auswahl. */
  people: { id: string; name: string; group?: string }[];
  user: { id: string; displayName: string; accountType: string };
}
export interface TrainingCommand {
  request_id: string;
  operation: string;
  payload: Record<string, unknown>;
  /** Nur Client: lesbares Label für Kopfzeile, Banner und betroffene Zeile. */
  label?: string;
}
export type TrainingReply =
  | {
      ok: true;
      result: { plan_id?: string; session_id?: string };
      workspace: TrainingWorkspace;
    }
  | { ok: false; message: string; conflict?: boolean };

/** Kein Planstatus und keine Anwesenheit fließen in die reale Versuchsquote ein. */
export function attemptSummary(
  session: TrainingSession,
  participantId: string,
  exerciseId: string,
) {
  const total = session.totals.find(
    (a) => a.participant_id === participantId && a.exercise_id === exerciseId,
  );
  const attempts = total?.attempts ?? 0;
  const landed = total?.landed ?? 0;
  return {
    attempts,
    landed,
    percent: attempts ? Math.round((landed / attempts) * 100) : null,
  };
}
export function timerMilliseconds(exercise: SessionExercise, now: number) {
  return (
    Number(exercise.elapsed_ms) +
    (exercise.timer_started_at
      ? Math.max(0, now - Date.parse(exercise.timer_started_at))
      : 0)
  );
}
