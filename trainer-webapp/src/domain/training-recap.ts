/** Personenbezogene Projektion der bestehenden Sessions, ohne Gruppen-Snapshots. */
export interface SessionRecap {
  participant_id: string;
  athlete_id: string;
  athlete_name: string;
  session_id: string;
  title: string;
  mode: "self" | "individual" | "group";
  present: boolean;
  started_at: string;
  completed_at: string;
  is_self: boolean;
  can_review: boolean;
  can_confirm: boolean;
  note: string | null;
  exercises: { id: string; skill_id: string; name: string; elapsed_ms: number; note: string | null; trainer_note: string | null; attempts: number; landed: number }[];
  reviews: { id: string; exercise_id: string | null; kind: "hint" | "goal" | "request" | "confirmation"; body: string; author_name: string; author_role: "trainer" | "self"; created_at: string; supersedes: string | null }[];
}

/** Null unterscheidet fehlende Versuche von einer tatsächlich gemessenen Nullquote. */
export function recapQuota(attempts: number, landed: number) {
  return attempts > 0 ? `${Math.round(landed / attempts * 100)} %` : "Keine Quote · keine Versuche";
}
export const reviewLabels = { hint: "Trainerhinweis", goal: "Nächstes Ziel", request: "Bestätigung angefragt", confirmation: "Fortschritt ausdrücklich bestätigt" };
