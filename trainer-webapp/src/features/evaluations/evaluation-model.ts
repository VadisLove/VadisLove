import type {
  AthleteEvaluation,
  CalendarEvent,
  EvaluationDashboardData,
  EvaluationSkillCategory,
  EvaluationSkillDefinition,
  EvaluationSkillRating,
  Person,
  TrainingPlan,
  TrickProgressStatus,
} from "../../domain/models";

/*
 * Reine Rechenlogik der Auswertung (ohne React), damit Kennzahlen, Vorwerte
 * und Trickziele unabhängig von der Oberfläche getestet werden können.
 */

export const skillCategories: EvaluationSkillCategory[] = ["skateboarding", "mental", "athletic"];

export const skillCategoryMeta: Record<EvaluationSkillCategory, { number: string; short: string; title: string }> = {
  skateboarding: { number: "01", short: "Skate", title: "Skateboardspezifische Anforderungen" },
  mental: { number: "02", short: "Mental", title: "Mentaler Zustand" },
  athletic: { number: "03", short: "Athletik", title: "Athletik" },
};

export function todayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentYearStart() {
  return `${todayIso().slice(0, 4)}-01-01`;
}

/** 2026-06-12 → 12.06.2026 (ohne Zeitzonen-Umrechnung). */
export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

/** 2026-06-12 → 12.06. */
export function formatShortDate(iso: string) {
  return formatDate(iso).slice(0, 6);
}

/** Dezimalkomma mit einer Nachkommastelle, „–“ ohne Wert. */
export function formatAverage(value: number | null) {
  return value === null ? "–" : value.toFixed(1).replace(".", ",");
}

export function withinPeriod(event: CalendarEvent, from: string, to: string) {
  return event.date <= to && event.endDate >= from;
}

export function participantStatus(event: CalendarEvent, athleteId: string) {
  return event.participants.find((participant) => participant.id === athleteId)?.status;
}

export function matchingEvaluation(evaluations: AthleteEvaluation[], athleteId: string, from: string, to: string) {
  return evaluations.find((evaluation) => (
    evaluation.athleteId === athleteId
    && evaluation.periodStart === from
    && evaluation.periodEnd === to
  ));
}

/**
 * Letzte gespeicherte Auswertung vor dem gewählten Zeitraum. Die Liste kommt
 * bereits nach period_end absteigend sortiert aus der Datenbank; hier wird sie
 * trotzdem selbst sortiert, damit das Ergebnis nicht von der Abfrage abhängt.
 */
export function previousEvaluation(evaluations: AthleteEvaluation[], athleteId: string, from: string, to: string) {
  return evaluations
    .filter((evaluation) => (
      evaluation.athleteId === athleteId
      && !(evaluation.periodStart === from && evaluation.periodEnd === to)
      && evaluation.periodEnd <= to
      && evaluation.skillRatings.length > 0
    ))
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd) || right.periodStart.localeCompare(left.periodStart))[0];
}

/** Stichtag einer Auswertung: Gesprächsdatum, sonst Ende des Zeitraums. */
export function evaluationDate(evaluation: AthleteEvaluation) {
  return evaluation.conversationOn || evaluation.periodEnd;
}

export type DeltaTone = "up" | "down" | "same" | "open" | "new";

export interface Delta {
  tone: DeltaTone;
  label: string;
}

/** Δ-Pille einer Zeile: ↑ n / ↓ n / = / offen (unbewertet) / neu (ohne Vorwert). */
export function ratingDelta(current: number | undefined, previous: number | undefined): Delta {
  if (!current) return { tone: "open", label: "offen" };
  if (!previous) return { tone: "new", label: "neu" };
  const diff = current - previous;
  if (diff > 0) return { tone: "up", label: `↑ ${diff}` };
  if (diff < 0) return { tone: "down", label: `↓ ${-diff}` };
  return { tone: "same", label: "=" };
}

export interface CategorySummary {
  category: EvaluationSkillCategory;
  skills: EvaluationSkillDefinition[];
  rated: number;
  total: number;
  average: number | null;
  /** Ø aller Vorwerte des Bereichs (Anzeige „zuvor“). */
  previousAverage: number | null;
  /** Ø der Vorwerte genau der jetzt bewerteten Kriterien (Basis für Δ und Strich). */
  comparableAverage: number | null;
  delta: Delta | null;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Bereichs-Ø = Mittel der bewerteten Kriterien. Das Δ vergleicht mit dem Ø der
 * Vorwerte derselben bewerteten Kriterien, damit neue Bewertungen nicht verzerren.
 */
export function summarizeCategory(
  category: EvaluationSkillCategory,
  skills: EvaluationSkillDefinition[],
  ratings: Record<string, EvaluationSkillRating>,
  previous: Record<string, number>,
): CategorySummary {
  const categorySkills = skills.filter((skill) => skill.visible && skill.category === category);
  const ratedSkills = categorySkills.filter((skill) => ratings[skill.key]?.rating);
  const average = mean(ratedSkills.map((skill) => ratings[skill.key].rating));
  const previousAverage = mean(categorySkills.flatMap((skill) => (previous[skill.key] ? [previous[skill.key]] : [])));
  const comparable = ratedSkills.filter((skill) => previous[skill.key]);
  const comparableAverage = mean(comparable.map((skill) => previous[skill.key]));
  let delta: Delta | null = null;
  if (average !== null && comparableAverage !== null) {
    const currentComparable = mean(comparable.map((skill) => ratings[skill.key].rating)) ?? average;
    const diff = currentComparable - comparableAverage;
    delta = diff > 0.05
      ? { tone: "up", label: `↑ ${formatAverage(diff)}` }
      : diff < -0.05
        ? { tone: "down", label: `↓ ${formatAverage(-diff)}` }
        : { tone: "same", label: "=" };
  }
  return {
    category,
    skills: categorySkills,
    rated: ratedSkills.length,
    total: categorySkills.length,
    average,
    previousAverage,
    comparableAverage,
    delta,
  };
}

export type TrickGoalState = "open" | "practicing" | "waiting" | "done";

/** Trickziel aus einem geteilten Trainingsplan (oder Planziel) für die Chips. */
export interface TrickGoal {
  id: string;
  title: string;
  kind: "trick" | "goal";
  state: TrickGoalState;
  done: boolean;
  /** Plan-ID mit „shared-“-Präfix, wie sie updateSharedTrickProgress erwartet. */
  planId: string;
  planTitle: string;
  trickId?: string;
  group?: string;
}

const trickStates: Record<TrickProgressStatus, TrickGoalState> = {
  not_started: "open",
  in_progress: "practicing",
  awaiting_confirmation: "waiting",
  confirmed: "done",
};

/**
 * Übungen und Ziele aus den Trainingsplänen, die dem Athleten zugewiesen sind.
 * Der Status kommt aus training_trick_progress – derselben Quelle wie im
 * Trainingsplan-Bereich, damit beide Ansichten immer übereinstimmen.
 */
export function athleteTrickGoals(plans: TrainingPlan[], athleteId: string): TrickGoal[] {
  const goals = plans
    .filter((plan) => plan.assignedAthletes.includes(athleteId) || plan.tricks.some((trick) => trick.athleteId === athleteId))
    .flatMap((plan): TrickGoal[] => [
      ...plan.tricks
        .filter((trick) => !trick.athleteId || trick.athleteId === athleteId)
        .map((trick) => ({
          id: `${plan.id}-trick-${trick.id}`,
          title: trick.name,
          kind: "trick" as const,
          state: trickStates[trick.status] || "open",
          done: trick.status === "confirmed",
          planId: plan.id,
          planTitle: plan.title,
          trickId: trick.id,
          group: trick.group,
        })),
      ...plan.goals.map((goal) => ({
        id: `${plan.id}-goal-${goal.id}`,
        title: goal.title,
        kind: "goal" as const,
        state: goal.completed ? "done" as const : "open" as const,
        done: goal.completed,
        planId: plan.id,
        planTitle: plan.title,
      })),
    ]);

  return Array.from(new Map(goals.map((goal) => [goal.id, goal])).values());
}

export interface AthleteMetrics {
  athlete: Person;
  attended: number;
  invitedTrainings: number;
  attendance: number;
  contestCount: number;
  contestScore: number;
  taskCompleted: number;
  taskTotal: number;
  taskScore: number;
  skillScore: number;
  overall: number;
}

/** Unveränderte Score-Berechnung der bisherigen Auswertung. */
export function calculateMetrics({
  athlete,
  events,
  plans,
  evaluations,
  from,
  to,
  weights,
}: {
  athlete: Person;
  events: CalendarEvent[];
  plans: TrainingPlan[];
  evaluations: AthleteEvaluation[];
  from: string;
  to: string;
  weights: EvaluationDashboardData["weights"];
}): AthleteMetrics {
  const trainings = events.filter((event) => event.type === "training" && withinPeriod(event, from, to) && participantStatus(event, athlete.id));
  const attended = trainings.filter((event) => participantStatus(event, athlete.id) === "confirmed").length;
  const attendance = trainings.length ? Math.round((attended / trainings.length) * 100) : 0;
  const evaluation = matchingEvaluation(evaluations, athlete.id, from, to);
  const overrides = new Map((evaluation?.contestOverrides || []).map((override) => [override.eventId, override]));
  const contests = events.filter((event) => (
    event.type === "contest"
    && withinPeriod(event, from, to)
    && participantStatus(event, athlete.id) === "confirmed"
    && !overrides.get(event.id)?.excluded
  ));
  const placements = contests.flatMap((event) => {
    const placement = overrides.get(event.id)?.placement;
    return placement ? [placement] : [];
  });
  const averagePlacement = placements.length
    ? placements.reduce((sum, placement) => sum + placement, 0) / placements.length
    : null;
  const contestScore = contests.length === 0 ? 0 : averagePlacement === null ? 50 : Math.max(0, Math.round(100 - (averagePlacement - 1) * 5));
  const tasks = athleteTrickGoals(plans, athlete.id);
  const taskCompleted = tasks.filter((task) => task.done).length;
  const taskScore = tasks.length ? Math.round((taskCompleted / tasks.length) * 100) : 0;
  const ratings = evaluation?.skillRatings || [];
  const skillScore = ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length) * 20)
    : 0;
  const overall = Math.round(
    attendance * weights.attendance / 100
    + contestScore * weights.contests / 100
    + taskScore * weights.tasks / 100
    + skillScore * weights.skills / 100,
  );

  return {
    athlete,
    attended,
    invitedTrainings: trainings.length,
    attendance,
    contestCount: contests.length,
    contestScore,
    taskCompleted,
    taskTotal: tasks.length,
    taskScore,
    skillScore,
    overall,
  };
}

/*
 * Zuordnung von Plan-Übungen zu Skate-Kriterien. Tricks tragen im Plan nur die
 * Plan-Kategorie (Street, Park …) als Gruppe, deshalb wird über Stichworte im
 * Namen zugeordnet. Ein Trick darf mehreren Kriterien helfen (z. B. „Switch
 * Kickflip“ → Flip-Variationen und Stance-Optionen).
 */
const exerciseKeywords: Record<string, RegExp> = {
  obstacles: /grind|slide|stall|rail|ledge|curb|box|hubba|manual|50-50|5-0|crook|smith|feeble|lipslide|nosegrind|gap|stair|treppe|bank|wallride/i,
  "flip-variations": /flip|shuv|shove|varial|heel|tre\b|impossible|hardflip/i,
  "rotation-variations": /180|360|540|bigspin|revert|half.?cab|\bcab\b|rotation|body.?varial/i,
  "stance-options": /switch|fakie|nollie|\bcab\b|half.?cab/i,
  "flow-lines": /\brun|line|flow|kombination|combo|drop.?in|pump|carve/i,
};

/** Übungen (nur Tricks), die zu einem Kriterium passen. Trick-Repertoire umfasst alle Tricks. */
export function exercisesForSkill(skillKey: string, goals: TrickGoal[]): TrickGoal[] {
  const tricks = goals.filter((goal) => goal.kind === "trick");
  if (skillKey === "trick-repertoire") return tricks;
  const pattern = exerciseKeywords[skillKey];
  return pattern ? tricks.filter((goal) => pattern.test(goal.title)) : [];
}

export interface PendingConfirmation {
  id: string;
  planId: string;
  planTitle: string;
  trickId: string;
  trickName: string;
  athleteId: string;
  athleteName: string;
}

/**
 * Warteschlange „Zu bestätigen“: gemeldete Tricks aller Athleten aus selbst
 * versendeten Planfreigaben (nur dort darf der Trainer bestätigen).
 */
export function pendingTrickConfirmations(plans: TrainingPlan[], names: Map<string, string>): PendingConfirmation[] {
  return plans
    .filter((plan) => plan.shareDirection === "sent")
    .flatMap((plan) => plan.tricks
      .filter((trick) => trick.status === "awaiting_confirmation")
      .map((trick) => {
        const athleteId = trick.athleteId || plan.recipientUserId || "";
        return {
          id: `${plan.id}:${trick.id}`,
          planId: plan.id,
          planTitle: plan.title,
          trickId: trick.id,
          trickName: trick.name,
          athleteId,
          athleteName: names.get(athleteId) || "Athlet",
        };
      }))
    .sort((left, right) => left.athleteName.localeCompare(right.athleteName, "de") || left.trickName.localeCompare(right.trickName, "de"));
}
