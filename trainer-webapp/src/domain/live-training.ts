/**
 * Reine Fachlogik des Live-Trainings (ohne React), damit sie ohne Next.js-Build
 * in `node --test` geprüft werden kann. Alle Zahlen stammen aus dem
 * serverbestätigten Session-Stand; hier wird nur abgeleitet, nie gezählt.
 */
import type { SessionExercise, TrainingSession } from "./training";

/** Bereit-Regel – identisch mit Session-Rückblick und Serverprüfung (`progress`). */
export const READY_QUOTE = 80;
export const READY_MIN_ATTEMPTS = 5;

/** Planstatus 0 Offen → 1 Geübt → 2 Gemeldet → 3 Bestätigt. */
export type PlanStep = 0 | 1 | 2 | 3;

export function isReady(attempts: number, landed: number, step: PlanStep, trainer: boolean) {
  return (
    attempts >= READY_MIN_ATTEMPTS &&
    landed * 100 >= attempts * READY_QUOTE &&
    step < (trainer ? 3 : 2)
  );
}

/** Quote in ganzen Prozent, `null` ohne Versuche (keine Nullquote vortäuschen). */
export function percent(landed: number, attempts: number) {
  return attempts ? Math.round((landed / attempts) * 100) : null;
}

/** Farbstufe: ≥ 80 grün, 50–79 blau, < 50 amber, ohne Versuche grau. */
export type Tone = "good" | "mid" | "low" | "none";
export function toneOf(pct: number | null): Tone {
  if (pct === null) return "none";
  return pct >= 80 ? "good" : pct >= 50 ? "mid" : "low";
}

export const isLine = (exercise: SessionExercise) => exercise.content.type === "line";

export function lineTricks(exercise: SessionExercise) {
  return exercise.content.type === "line" ? (exercise.content.trickNames ?? []) : [];
}

export function counts(session: TrainingSession, participantId: string, exerciseId: string) {
  const total = session.totals.find(
    (entry) => entry.participant_id === participantId && entry.exercise_id === exerciseId,
  );
  const attempts = total?.attempts ?? 0;
  const landed = total?.landed ?? 0;
  return { attempts, landed, pct: percent(landed, attempts) };
}

/** Summe über die angegebenen Teilnehmer (Standard: alle Anwesenden). */
export function exerciseTotals(session: TrainingSession, exerciseId: string, participantIds = presentIds(session)) {
  let attempts = 0;
  let landed = 0;
  for (const id of participantIds) {
    const c = counts(session, id, exerciseId);
    attempts += c.attempts;
    landed += c.landed;
  }
  return { attempts, landed, pct: percent(landed, attempts) };
}

export function presentIds(session: TrainingSession) {
  return session.participants.filter((p) => p.present).map((p) => p.id);
}

/**
 * Aktive Zeit = Ende − Start − Pausen. Eine laufende Pause zählt bis `now`
 * (bzw. bis zum Abschluss) ebenfalls nicht mit.
 */
export function activeMs(session: TrainingSession, now: number) {
  const end = session.completed_at ? Date.parse(session.completed_at) : now;
  const openPause = session.paused_at ? Math.max(0, end - Date.parse(session.paused_at)) : 0;
  return Math.max(0, end - Date.parse(session.started_at) - Number(session.paused_ms ?? 0) - openPause);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** „04:32“ bzw. ab einer Stunde „1:04:32“. */
export function clock(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return sec >= 3600
    ? `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`
    : `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

/** Ganze Minuten, mindestens 1 – für Rückfrage und Abschluss. */
export function minutes(ms: number) {
  return Math.max(1, Math.round(ms / 60000));
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

const berlin = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...options });

/** „16:12“ */
export function hm(value: string | number) {
  return berlin({ hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** „Di. 29.09. · 16:12–16:48 · 1 Pause“ */
export function sessionWhen(session: TrainingSession, now: number) {
  const start = new Date(session.started_at);
  const weekday = berlin({ weekday: "short" }).format(start).replace(/\.$/, "");
  const day = berlin({ day: "2-digit", month: "2-digit" }).format(start).replace(/\.$/, "");
  const end = session.completed_at ?? now;
  const pauses = session.pause_count
    ? ` · ${session.pause_count} ${session.pause_count === 1 ? "Pause" : "Pausen"}`
    : "";
  return `${weekday}. ${day}. · ${hm(session.started_at)}–${hm(end)}${pauses}`;
}

/* ------------------------------------------------------------------ */
/* Lines                                                                */
/* ------------------------------------------------------------------ */

/** Bruchstellen einer Line für die angegebenen Teilnehmer. */
export function lineBreaks(session: TrainingSession, exerciseId: string, participantIds: string[]) {
  const map = new Map<number | null, number>();
  for (const entry of session.breaks ?? []) {
    if (entry.exercise_id !== exerciseId || !participantIds.includes(entry.participant_id)) continue;
    map.set(entry.broke_at, (map.get(entry.broke_at) ?? 0) + entry.attempts);
  }
  return map;
}

export interface LineTrickStat {
  index: number;
  name: string;
  /** Versuche, die diesen Trick erreicht haben (ohne „ohne Angabe“). */
  reached: number;
  /** Davon diesen Trick gestanden (komplett oder erst später gebrochen). */
  landed: number;
  pct: number | null;
  weak: boolean;
}

/**
 * „Wo bricht die Line?“ – je Trick gestanden / erreicht. Versuche ohne Angabe
 * der Bruchstelle sind für keinen Trick aussagekräftig und bleiben außen vor.
 * Der schwächste Trick unter 80 % wird als Schwachstelle markiert.
 */
export function lineStats(
  session: TrainingSession,
  exercise: SessionExercise,
  participantIds: string[],
): LineTrickStat[] {
  const names = lineTricks(exercise);
  const complete = participantIds.reduce((sum, id) => sum + counts(session, id, exercise.id).landed, 0);
  const breaks = lineBreaks(session, exercise.id, participantIds);
  const brokeAt = (k: number) => breaks.get(k) ?? 0;
  const stats = names.map((name, index) => {
    let reached = complete;
    let landed = complete;
    for (let k = index; k < names.length; k++) reached += brokeAt(k);
    for (let k = index + 1; k < names.length; k++) landed += brokeAt(k);
    return { index, name, reached, landed, pct: percent(landed, reached), weak: false };
  });
  const candidates = stats.filter((s) => s.reached);
  const weakest = candidates.length
    ? candidates.reduce((a, b) => ((b.pct ?? 0) < (a.pct ?? 0) ? b : a))
    : null;
  if (weakest && (weakest.pct ?? 0) < 80) weakest.weak = true;
  return stats;
}

/** „meist raus bei <Trick>“ je Person, sonst leer. */
export function mostBrokenAt(session: TrainingSession, exercise: SessionExercise, participantId: string) {
  const names = lineTricks(exercise);
  let best: number | null = null;
  let count = 0;
  for (const [index, n] of lineBreaks(session, exercise.id, [participantId])) {
    if (index === null || n <= count) continue;
    best = index;
    count = n;
  }
  return best === null ? "" : `meist raus bei ${names[best] ?? `Trick ${best + 1}`}`;
}

/* ------------------------------------------------------------------ */
/* Labels                                                               */
/* ------------------------------------------------------------------ */

/** Lesbares Label einer Versuchseingabe, z. B. „Raus bei Kickturn 180 · Jonas“. */
export function attemptLabel(
  exercise: SessionExercise,
  landed: boolean,
  brokeAt: number | null,
  who: string | null,
) {
  const suffix = who ? ` · ${who}` : "";
  if (!isLine(exercise)) return `${landed ? "Gestanden" : "Nicht gestanden"}${suffix}`;
  if (landed) return `Line komplett${suffix}`;
  const name = brokeAt === null ? null : lineTricks(exercise)[brokeAt];
  return `${name ? `Raus bei ${name}` : "Line nicht komplett"}${suffix}`;
}
