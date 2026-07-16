import type {
  TrainingPlan,
  TrainingTargetType,
  TrainingTrick,
  TrickProgressStatus,
} from "@/domain/models";

const targetTypes = new Set<TrainingTargetType>([
  "attempts",
  "repetitions",
  "duration",
  "free",
]);

const progressStatuses = new Set<TrickProgressStatus>([
  "not_started",
  "in_progress",
  "awaiting_confirmation",
  "confirmed",
]);

function textOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Ergaenzt alte Uebungen um sichere, verstaendliche Standardwerte.
 * Die urspruenglichen IDs bleiben erhalten, weil Fortschritt und Nachweise
 * dauerhaft ueber diese ID mit dem unveraenderlichen Snapshot verknuepft sind.
 */
export function normalizeTrainingTrick(
  value: unknown,
  index: number,
): TrainingTrick | null {
  if (!value || typeof value !== "object") return null;
  const trick = value as Partial<TrainingTrick>;
  if (typeof trick.id !== "string" || !trick.id.trim()) return null;

  const level = Number.isFinite(Number(trick.level))
    ? Math.min(5, Math.max(1, Math.round(Number(trick.level))))
    : 1;
  const targetType = targetTypes.has(trick.targetType as TrainingTargetType)
    ? trick.targetType as TrainingTargetType
    : "free";
  const status = progressStatuses.has(trick.status as TrickProgressStatus)
    ? trick.status as TrickProgressStatus
    : "not_started";

  return {
    id: trick.id.trim(),
    name: textOrDefault(trick.name, `Übung ${index + 1}`),
    group: textOrDefault(trick.group, "Allgemein"),
    level,
    targetType,
    targetValue: textOrDefault(
      trick.targetValue,
      targetType === "free" ? "Sauber und kontrolliert ausführen" : "1",
    ),
    trainerNote: textOrDefault(
      trick.trainerNote,
      "Auf eine sichere und kontrollierte Ausführung achten.",
    ),
    sortOrder: Number.isInteger(trick.sortOrder) && Number(trick.sortOrder) >= 0
      ? Number(trick.sortOrder)
      : index,
    equipment: typeof trick.equipment === "string" && trick.equipment.trim()
      ? trick.equipment.trim()
      : undefined,
    athleteId: typeof trick.athleteId === "string" ? trick.athleteId : "",
    status,
  };
}

/** Normalisiert lokale Plaene und historische Snapshots ueber denselben Weg. */
export function normalizeTrainingPlan(plan: TrainingPlan): TrainingPlan {
  return {
    ...plan,
    goals: Array.isArray(plan.goals) ? plan.goals : [],
    tricks: (Array.isArray(plan.tricks) ? plan.tricks : [])
      .map(normalizeTrainingTrick)
      .filter((trick): trick is TrainingTrick => trick !== null)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
}
