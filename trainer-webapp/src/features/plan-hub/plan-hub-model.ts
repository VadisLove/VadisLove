/**
 * Reine Fachlogik des Trainingsplan-Bereichs (ohne React).
 *
 * Führt die drei vorhandenen Datenquellen zu einer einheitlichen Sicht zusammen:
 * - eigene, versionierte Pläne (`training_plans`),
 * - persönliche Freigaben mit Trick-Fortschritt (`training_plan_snapshot_shares`),
 * - Videonachweise (`training_video_evidence`).
 *
 * Alle Imports sind relativ bzw. reine Typ-Imports, damit die Funktionen auch
 * ohne Next.js-Build in `node --test` geprüft werden können.
 */
import type {
  TrainingPlan,
  TrainingVideoEvidence,
  TrickProgressStatus,
} from "../../domain/models";
import type { SavedPlan } from "../../domain/training";
import type { SessionRecap } from "../../domain/training-recap";

/** Status pro Athlet × Trick: 0 Offen → 1 Geübt → 2 Gemeldet → 3 Bestätigt. */
export type Step = 0 | 1 | 2 | 3;

export const stepOf: Record<TrickProgressStatus, Step> = {
  not_started: 0,
  in_progress: 1,
  awaiting_confirmation: 2,
  confirmed: 3,
};

export const stepLabels = ["Offen", "Geübt", "Gemeldet", "Bestätigt"] as const;

/**
 * Trainer und Vereins-/Verbandsmitarbeitende („Vorstand“) verwalten Pläne,
 * Athleten melden Fortschritt. Alle übrigen Konten sehen nur lesend zu.
 */
export type HubRole = "staff" | "athlete" | "viewer";

export function hubRoleOf(accountType: string | undefined): HubRole {
  if (accountType === "trainer" || accountType === "organization_staff") return "staff";
  if (accountType === "athlete") return "athlete";
  return "viewer";
}

/* ------------------------------------------------------------------ */
/* Anrede (m/w/d)                                                       */
/* ------------------------------------------------------------------ */

export type Salutation = "m" | "w" | "d";

/**
 * Wort-Tabelle aus dem Handoff. Solange die Anrede noch nicht im Profil
 * gespeichert wird, gilt überall die neutrale Form „d“.
 */
const salutationWords = {
  m: { sk: "Skater", tr: "Trainer", acc: "deinen Trainer", nom: "dein Trainer", dat: "deinem Trainer", rank: "Starter" },
  w: { sk: "Skaterin", tr: "Trainerin", acc: "deine Trainerin", nom: "deine Trainerin", dat: "deiner Trainerin", rank: "Starterin" },
  d: { sk: "Skater*in", tr: "Trainer*in", acc: "dein*e Trainer*in", nom: "dein*e Trainer*in", dat: "deine*m Trainer*in", rank: "Starter*in" },
} as const;

export function words(salutation: Salutation | null | undefined = "d") {
  return salutationWords[salutation ?? "d"];
}

/* ------------------------------------------------------------------ */
/* Zusammengeführte Pläne                                               */
/* ------------------------------------------------------------------ */

export interface HubTrick {
  id: string;
  name: string;
  goal: string;
  hint: string;
}

/** Eine persönliche Freigabe = ein Athlet mit eigenem Fortschritt. */
export interface HubAssignment {
  /** Plan-ID der Freigabe im Format `shared-<uuid>` (für Server Actions). */
  shareId: string;
  athleteId: string;
  athleteName: string;
  initials: string;
  /** Fehlt ein Trick in einer älteren Planversion, bleibt der Eintrag leer. */
  steps: Record<string, Step | undefined>;
}

export interface HubPlan {
  key: string;
  title: string;
  category: string;
  level: string;
  goal: string;
  deadline?: string;
  version: number | null;
  createdAt?: string;
  /** own = eigener Plan, sent = nur als Freigabe versendet, received = erhalten. */
  kind: "own" | "sent" | "received";
  isDraft: boolean;
  tricks: HubTrick[];
  assignments: HubAssignment[];
  /** Inhalt für „Bearbeiten“ (nur eigene Pläne, speichert eine neue Version). */
  editable: TrainingPlan | null;
  savedPlanId?: string;
  /** ID für den Trainingsstart: gespeicherter Plan oder `shared-<uuid>`. */
  startId: string | null;
  /** Kurzer Herkunftstext unter dem Plannamen. */
  sourceLabel: string;
  /** Autor laut Snapshot, z. B. für „Von <Name> erstellt“. */
  author: string;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TH";
}

/** Kurzname für enge Stellen: „Mia Kaiser“ → „Mia K.“ */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

function tricksOf(plan: TrainingPlan): HubTrick[] {
  return [...plan.tricks]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((trick) => ({
      id: trick.id,
      name: trick.name,
      goal: trick.targetValue ?? "",
      hint: trick.trainerNote ?? "",
    }));
}

function stepsOf(plan: TrainingPlan): Record<string, Step> {
  return Object.fromEntries(plan.tricks.map((trick) => [trick.id, stepOf[trick.status] ?? 0]));
}

function authorName(plan: TrainingPlan) {
  // Das Repository ergänzt „ · empfangen“ bzw. „ · versendet“ am Autor.
  return plan.author.replace(/ · (empfangen|versendet)$/, "");
}

export function buildHubPlans({
  savedPlans,
  shares,
  userId,
  names,
}: {
  savedPlans: SavedPlan[];
  shares: TrainingPlan[];
  userId: string;
  names: Map<string, string>;
}): HubPlan[] {
  const nameOf = (id: string) => names.get(id) ?? "Athlet*in";

  // Versendete Freigaben werden je Ursprungsplan zu einer Gruppe gebündelt.
  // Neueste zuerst, damit Titel und Trickliste dem aktuellsten Stand folgen.
  const sentGroups = new Map<string, TrainingPlan[]>();
  for (const share of shares) {
    if (share.shareDirection !== "sent") continue;
    const key = share.sourcePlanId || share.title;
    sentGroups.set(key, [...(sentGroups.get(key) ?? []), share]);
  }
  for (const group of sentGroups.values()) {
    group.sort((a, b) => (b.sharedAt ?? "").localeCompare(a.sharedAt ?? ""));
  }

  const assignmentsOf = (group: TrainingPlan[] | undefined): HubAssignment[] => {
    // Pro Athlet zählt nur die neueste Freigabe desselben Plans.
    const seen = new Set<string>();
    return (group ?? []).flatMap((share) => {
      const athleteId = share.recipientUserId ?? "";
      if (!athleteId || seen.has(athleteId)) return [];
      seen.add(athleteId);
      const athleteName = nameOf(athleteId);
      return [{
        shareId: share.id,
        athleteId,
        athleteName,
        initials: initialsOf(athleteName),
        steps: stepsOf(share),
      }];
    });
  };

  const result: HubPlan[] = [];

  for (const saved of savedPlans) {
    const latest = saved.versions[0];
    if (!latest) continue;
    const content = latest.content;
    const group = sentGroups.get(saved.id);
    sentGroups.delete(saved.id);
    const assignments = assignmentsOf(group);
    result.push({
      key: saved.id,
      title: saved.title || content.title,
      category: content.category ?? "",
      level: content.level ?? "",
      goal: content.description ?? "",
      deadline: content.deadline,
      version: latest.version_number,
      createdAt: saved.versions[saved.versions.length - 1]?.created_at ?? latest.created_at,
      kind: "own",
      isDraft: content.status === "draft" && assignments.length === 0,
      tricks: tricksOf(content),
      assignments,
      editable: content,
      savedPlanId: saved.id,
      startId: saved.id,
      sourceLabel: assignments.length ? "" : "Eigener Plan",
      author: "",
    });
  }

  for (const [key, group] of sentGroups) {
    const newest = group[0];
    result.push({
      key: `sent:${key}`,
      title: newest.title,
      category: newest.category ?? "",
      level: newest.level ?? "",
      goal: newest.description ?? "",
      deadline: newest.deadline,
      version: Number.parseInt(newest.version, 10) || null,
      createdAt: group[group.length - 1].sharedAt,
      kind: "sent",
      isDraft: false,
      tricks: tricksOf(newest),
      assignments: assignmentsOf(group),
      editable: null,
      startId: newest.id,
      sourceLabel: "",
      author: authorName(newest),
    });
  }

  for (const share of shares) {
    if (share.shareDirection !== "received") continue;
    const sender = (share.sharedById && names.get(share.sharedById)) || authorName(share);
    result.push({
      key: share.id,
      title: share.title,
      category: share.category ?? "",
      level: share.level ?? "",
      goal: share.description ?? "",
      deadline: share.deadline,
      version: Number.parseInt(share.version, 10) || null,
      createdAt: share.sharedAt,
      kind: "received",
      isDraft: false,
      tricks: tricksOf(share),
      assignments: [{
        shareId: share.id,
        athleteId: userId,
        athleteName: nameOf(userId),
        initials: initialsOf(nameOf(userId)),
        steps: stepsOf(share),
      }],
      editable: null,
      startId: share.id,
      sourceLabel: sender,
      author: sender,
    });
  }

  return result;
}

/** Offene Meldungen zuerst, danach aktive vor Entwürfen, sonst neueste zuerst. */
export function sortHubPlans(plans: HubPlan[], role: HubRole) {
  const score = (plan: HubPlan) =>
    role === "staff"
      ? openReports(plan).length * 10 + (plan.assignments.length ? 5 : 0) - (plan.isDraft ? 5 : 0)
      : plan.kind === "received" ? 10 : 0;
  return [...plans].sort(
    (a, b) => score(b) - score(a) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
}

/* ------------------------------------------------------------------ */
/* Kennzahlen                                                           */
/* ------------------------------------------------------------------ */

export function cells(plan: HubPlan) {
  return plan.assignments.flatMap((assignment) =>
    plan.tricks.flatMap((trick) => {
      const step = assignment.steps[trick.id];
      return step === undefined ? [] : [{ assignment, trick, step }];
    }),
  );
}

export function confirmedCount(plan: HubPlan) {
  return cells(plan).filter((cell) => cell.step === 3).length;
}

/** Anteil bestätigter Tricks über alle zugewiesenen Athleten (0–100). */
export function planPercent(plan: HubPlan) {
  const all = cells(plan);
  return all.length ? Math.round((all.filter((cell) => cell.step === 3).length / all.length) * 100) : 0;
}

export function openReports(plan: HubPlan) {
  return cells(plan).filter((cell) => cell.step === 2);
}

export interface TrickAggregate {
  confirmed: number;
  waiting: number;
  practiced: number;
  total: number;
  /** Farbe des Punkts bzw. Knotens: alle bestätigt → 3, Meldung offen → 2 usw. */
  step: Step;
}

export function trickAggregate(plan: HubPlan, trickId: string): TrickAggregate {
  const steps = plan.assignments
    .map((assignment) => assignment.steps[trickId])
    .filter((step): step is Step => step !== undefined);
  const confirmed = steps.filter((step) => step === 3).length;
  const waiting = steps.filter((step) => step === 2).length;
  const practiced = steps.filter((step) => step === 1).length;
  const step: Step = steps.length && confirmed === steps.length
    ? 3
    : waiting
      ? 2
      : practiced || confirmed
        ? 1
        : 0;
  return { confirmed, waiting, practiced, total: steps.length, step };
}

/** Aktueller Trick im Pfad: Athlet = erster < Gemeldet, Staff = erste offene Meldung. */
export function currentTrickIndex(plan: HubPlan, role: HubRole) {
  if (!plan.assignments.length) return -1;
  if (role === "staff") {
    return plan.tricks.findIndex((trick) => trickAggregate(plan, trick.id).waiting > 0);
  }
  const mine = plan.assignments[0];
  return plan.tricks.findIndex((trick) => (mine.steps[trick.id] ?? 0) < 2);
}

export interface NextStep {
  plan: HubPlan;
  trick: HubTrick;
  step: Step;
}

/** „Dein nächster Schritt“: erster erhaltener Trick, der noch nicht gemeldet ist. */
export function nextStepFor(plans: HubPlan[]): NextStep | null {
  for (const plan of plans) {
    if (plan.kind !== "received") continue;
    const mine = plan.assignments[0];
    for (const trick of plan.tricks) {
      const step = mine.steps[trick.id] ?? 0;
      if (step < 2) return { plan, trick, step };
    }
  }
  return null;
}

/** Spielerische Stufe im Pfad: je zwei bestätigte Tricks eine Stufe höher. */
export function levelOf(confirmed: number) {
  return Math.floor(confirmed / 2) + 1;
}

/* ------------------------------------------------------------------ */
/* Videonachweise                                                       */
/* ------------------------------------------------------------------ */

export const cellKey = (shareId: string, trickId: string) => `${shareId}:${trickId}`;

/** Neuester offener Nachweis je Freigabe und Trick. */
export function pendingEvidenceMap(evidence: TrainingVideoEvidence[]) {
  const map = new Map<string, TrainingVideoEvidence>();
  for (const entry of evidence) {
    if (entry.reviewStatus !== "pending") continue;
    const key = cellKey(entry.planId, entry.trickId);
    const known = map.get(key);
    if (!known || known.submittedAt < entry.submittedAt) map.set(key, entry);
  }
  return map;
}

export interface WaitingReport {
  plan: HubPlan;
  assignment: HubAssignment;
  trick: HubTrick;
  evidence?: TrainingVideoEvidence;
}

export function waitingReports(
  plans: HubPlan[],
  evidence: Map<string, TrainingVideoEvidence>,
): WaitingReport[] {
  return plans
    .flatMap((plan) =>
      openReports(plan).map(({ assignment, trick }) => ({
        plan,
        assignment,
        trick,
        evidence: evidence.get(cellKey(assignment.shareId, trick.id)),
      })),
    )
    .sort((a, b) => (b.evidence?.submittedAt ?? "").localeCompare(a.evidence?.submittedAt ?? ""));
}

/* ------------------------------------------------------------------ */
/* Datum & Zahlen (deutsch)                                             */
/* ------------------------------------------------------------------ */

const dayMs = 86_400_000;

function berlinParts(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return {
    weekday: new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "Europe/Berlin" }).format(date),
    day: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(date),
    time: new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date),
  };
}

/** „Do. 24.09.“ */
export function formatDay(value: string | Date) {
  const { weekday, day } = berlinParts(value);
  return `${weekday.replace(/\.$/, "")}. ${day.replace(/\.$/, "")}.`;
}

/** „15:16 Uhr“ */
export function formatTime(value: string | Date) {
  return `${berlinParts(value).time} Uhr`;
}

/** „gerade eben“, „vor 2 Std.“, „gestern, 18:40“, „Mo. 22.09.“ */
export function formatRelative(value: string, now = Date.now()) {
  const diff = now - Date.parse(value);
  if (diff < 5 * 60_000) return "gerade eben";
  if (diff < 60 * 60_000) return `vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 12 * 60 * 60_000) return `vor ${Math.round(diff / 3_600_000)} Std.`;
  if (diff < 2 * dayMs) return `gestern, ${berlinParts(value).time}`;
  return formatDay(value);
}

/** Kalendertage von heute bis zur Frist (heute = 0), sonst null. */
export function daysUntil(deadline: string | undefined, now = Date.now()) {
  if (!deadline) return null;
  const end = new Date(deadline.length === 10 ? `${deadline}T12:00:00` : deadline);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date(now);
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const startDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((endDay - startDay) / dayMs);
}

export function deadlineText(deadline: string | undefined, now = Date.now()) {
  const days = daysUntil(deadline, now);
  if (days === null || !deadline) return null;
  const day = formatDay(deadline.length === 10 ? `${deadline}T12:00:00` : deadline).replace(/^\S+ /, "");
  if (days < 0) return `${day} · abgelaufen`;
  if (days === 0) return `${day} · heute`;
  return `${day} · noch ${days} ${days === 1 ? "Tag" : "Tage"}`;
}

export function inDays(days: number) {
  return days === 0 ? "heute" : days === 1 ? "in 1 Tag" : `in ${days} Tagen`;
}

export function formatDecimal(value: number) {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/** „1 min 32 s“ bzw. „42 min“ */
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 10) return `${minutes} min`;
  return `${minutes} min ${seconds % 60} s`;
}

/* ------------------------------------------------------------------ */
/* Session-Rückblick                                                    */
/* ------------------------------------------------------------------ */

export type RecapPeriod = "7" | "30" | "season";

/** Saison = laufendes Kalenderjahr. */
export function periodStart(period: RecapPeriod, now = new Date()) {
  if (period === "season") return new Date(now.getFullYear(), 0, 1).getTime();
  return now.getTime() - Number(period) * dayMs;
}

export function quoteOf(attempts: number, landed: number) {
  return attempts > 0 ? Math.round((landed / attempts) * 100) : null;
}

/** Farbstufe einer Quote: ≥ 80 grün, 50–79 blau, < 50 amber. */
export function quoteTone(quote: number | null): "good" | "mid" | "low" | "none" {
  if (quote === null) return "none";
  return quote >= 80 ? "good" : quote >= 50 ? "mid" : "low";
}

export interface RecapTotals {
  sessions: number;
  attempts: number;
  landed: number;
  quote: number | null;
  elapsedMs: number;
}

export function recapTotals(recaps: SessionRecap[]): RecapTotals {
  let attempts = 0;
  let landed = 0;
  let elapsedMs = 0;
  for (const recap of recaps) {
    for (const exercise of recap.exercises) {
      attempts += exercise.attempts;
      landed += exercise.landed;
      elapsedMs += Number(exercise.elapsed_ms);
    }
  }
  return { sessions: recaps.length, attempts, landed, quote: quoteOf(attempts, landed), elapsedMs };
}

export interface SkillSummary {
  skillId: string;
  name: string;
  attempts: number;
  landed: number;
  quote: number | null;
  /** Quote je Session in zeitlicher Reihenfolge (für die Mini-Balken). */
  series: number[];
  /** Letzte minus erste Session-Quote, null bei nur einer Session. */
  trend: number | null;
}

/**
 * Fasst Skills pro Trick über den Zeitraum zusammen. Quoten werden aus Summen
 * berechnet (nie als Mittel von Prozentwerten).
 */
export function skillSummaries(recaps: SessionRecap[]): SkillSummary[] {
  const chronological = [...recaps].sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const skills = new Map<string, SkillSummary>();
  for (const recap of chronological) {
    for (const exercise of recap.exercises) {
      if (!exercise.attempts) continue;
      const skill = skills.get(exercise.skill_id) ?? {
        skillId: exercise.skill_id,
        name: exercise.name,
        attempts: 0,
        landed: 0,
        quote: null,
        series: [],
        trend: null,
      };
      skill.attempts += exercise.attempts;
      skill.landed += exercise.landed;
      skill.series.push(quoteOf(exercise.attempts, exercise.landed) ?? 0);
      skills.set(exercise.skill_id, skill);
    }
  }
  return [...skills.values()]
    .map((skill) => ({
      ...skill,
      quote: quoteOf(skill.attempts, skill.landed),
      trend: skill.series.length > 1 ? skill.series[skill.series.length - 1] - skill.series[0] : null,
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** Planstatus eines Skills über den Namen des Tricks im zugewiesenen Plan. */
export function planStepForSkill(plans: HubPlan[], athleteId: string, skillName: string) {
  const needle = skillName.trim().toLowerCase();
  let best: { step: Step; plan: HubPlan; trick: HubTrick; assignment: HubAssignment } | null = null;
  for (const plan of plans) {
    const assignment = plan.assignments.find((entry) => entry.athleteId === athleteId);
    if (!assignment) continue;
    for (const trick of plan.tricks) {
      const step = assignment.steps[trick.id];
      if (step === undefined || trick.name.trim().toLowerCase() !== needle) continue;
      if (!best || step > best.step) best = { step, plan, trick, assignment };
    }
  }
  return best;
}
