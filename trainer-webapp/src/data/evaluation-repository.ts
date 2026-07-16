import { getCalendarEvents } from "@/data/supabase-event-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { getSharedTrainingPlanSnapshots } from "@/data/shared-training-plan-repository";
import type {
  AthleteEvaluation,
  AthletePersonalGoal,
  EvaluationContestOverride,
  EvaluationDashboardData,
  EvaluationSkillCategory,
  EvaluationSkillDefinition,
  EvaluationSkillRating,
  EvaluationWeights,
  Person,
} from "@/domain/models";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

export const defaultEvaluationWeights: EvaluationWeights = {
  attendance: 40,
  contests: 30,
  tasks: 20,
  skills: 10,
};

/**
 * Die fachlichen Start-Skills entsprechen der bereitgestellten Halbjahresauswertung.
 * Trainer-Aenderungen werden nur als persoenliche Overrides in Supabase gespeichert.
 */
export const defaultEvaluationSkills: EvaluationSkillDefinition[] = [
  { key: "trick-repertoire", label: "Trick-Repertoire Street", category: "skateboarding", visible: true, sortOrder: 10, custom: false },
  { key: "obstacles", label: "Obstacles", category: "skateboarding", visible: true, sortOrder: 20, custom: false },
  { key: "flip-variations", label: "Variationen: Flip in/out, Shuv in/out", category: "skateboarding", visible: true, sortOrder: 30, custom: false },
  { key: "rotation-variations", label: "Variationen: Rotations in/out", category: "skateboarding", visible: true, sortOrder: 40, custom: false },
  { key: "stance-options", label: "Stance-Optionen: Switch, Fakie", category: "skateboarding", visible: true, sortOrder: 50, custom: false },
  { key: "flow-lines", label: "Flow: Entwicklung von Runs / Lines", category: "skateboarding", visible: true, sortOrder: 60, custom: false },
  { key: "risk-courage", label: "Risikobereitschaft & Mut", category: "mental", visible: true, sortOrder: 10, custom: false },
  { key: "resilience", label: "Emotional gefestigt & belastbar", category: "mental", visible: true, sortOrder: 20, custom: false },
  { key: "focus-commitment", label: "Fokus, Commitment & Konstanz", category: "mental", visible: true, sortOrder: 30, custom: false },
  { key: "fitness", label: "Fitnesszustand", category: "athletic", visible: true, sortOrder: 10, custom: false },
  { key: "coordination", label: "Koordination & Gleichgewicht", category: "athletic", visible: true, sortOrder: 20, custom: false },
  { key: "gym", label: "Athletiktraining / Gym", category: "athletic", visible: true, sortOrder: 30, custom: false },
];

interface EvaluationRow {
  id: string;
  trainer_id: string;
  athlete_id: string;
  period_start: string;
  period_end: string;
  title: string;
  conversation_on: string | null;
  squad: string;
  dalid_status: string;
  personal_notes: string;
  measures: string;
  athlete_evaluation_skill_ratings?: Array<{
    skill_key: string;
    rating: number;
    note: string;
  }>;
  athlete_evaluation_contest_overrides?: Array<{
    event_id: string;
    excluded: boolean;
    category: string;
    placement: number | null;
    note: string;
  }>;
}

interface SkillSettingRow {
  skill_key: string;
  label: string;
  category: EvaluationSkillCategory;
  visible: boolean;
  sort_order: number;
  is_custom: boolean;
}

interface GoalRow {
  id: string;
  athlete_id: string;
  created_by: string;
  title: string;
  completed: boolean;
}

function isMissingEvaluationSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() || "";
  return error.code === "42P01" || error.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist");
}

function mapEvaluation(row: EvaluationRow): AthleteEvaluation {
  const skillRatings: EvaluationSkillRating[] = (row.athlete_evaluation_skill_ratings || []).map((rating) => ({
    skillKey: rating.skill_key,
    rating: rating.rating,
    note: rating.note,
  }));
  const contestOverrides: EvaluationContestOverride[] = (row.athlete_evaluation_contest_overrides || []).map((override) => ({
    eventId: override.event_id,
    excluded: override.excluded,
    category: override.category,
    placement: override.placement,
    note: override.note,
  }));

  return {
    id: row.id,
    trainerId: row.trainer_id,
    athleteId: row.athlete_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title,
    conversationOn: row.conversation_on || "",
    squad: row.squad,
    dalidStatus: row.dalid_status,
    personalNotes: row.personal_notes,
    measures: row.measures,
    skillRatings,
    contestOverrides,
  };
}

function mergeSkills(rows: SkillSettingRow[]): EvaluationSkillDefinition[] {
  const overrides = new Map(rows.map((row) => [row.skill_key, row]));
  const builtIns = defaultEvaluationSkills.map((skill) => {
    const override = overrides.get(skill.key);
    if (!override) return skill;
    return {
      key: override.skill_key,
      label: override.label,
      category: override.category,
      visible: override.visible,
      sortOrder: override.sort_order,
      custom: override.is_custom,
    };
  });
  const customSkills = rows
    .filter((row) => row.is_custom && !defaultEvaluationSkills.some((skill) => skill.key === row.skill_key))
    .map((row) => ({
      key: row.skill_key,
      label: row.label,
      category: row.category,
      visible: row.visible,
      sortOrder: row.sort_order,
      custom: true,
    }));

  return [...builtIns, ...customSkills].sort((left, right) => (
    left.category.localeCompare(right.category) || left.sortOrder - right.sortOrder
  ));
}

/** Schlanke Variante fuer die Einstellungsseite ohne Event- und Plandaten. */
export async function getEvaluationPreferences(): Promise<{
  skills: EvaluationSkillDefinition[];
  weights: EvaluationWeights;
}> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.accountType === "athlete") {
    return { skills: defaultEvaluationSkills, weights: defaultEvaluationWeights };
  }
  const supabase = await createClient();
  const [skillsResult, weightsResult] = await Promise.all([
    supabase
      .from("evaluation_skill_settings")
      .select("skill_key, label, category, visible, sort_order, is_custom")
      .eq("trainer_id", currentUser.id),
    supabase
      .from("trainer_evaluation_settings")
      .select("attendance_weight, contest_weight, task_weight, skill_weight")
      .eq("trainer_id", currentUser.id)
      .maybeSingle(),
  ]);
  for (const result of [skillsResult, weightsResult]) {
    if (result.error && !isMissingEvaluationSchema(result.error)) {
      throw new Error(`Auswertungseinstellungen konnten nicht geladen werden: ${result.error.message}`);
    }
  }
  const row = weightsResult.data;
  return {
    skills: mergeSkills((skillsResult.data || []) as SkillSettingRow[]),
    weights: row ? {
      attendance: row.attendance_weight,
      contests: row.contest_weight,
      tasks: row.task_weight,
      skills: row.skill_weight,
    } : defaultEvaluationWeights,
  };
}

function currentAthleteAsPerson(currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): Person {
  return {
    id: currentUser.id,
    name: currentUser.displayName,
    email: "",
    accountType: currentUser.accountType,
    role: "Athlet",
    region: "Eigene Auswertung",
    initials: currentUser.initials,
    activeRelationships: [],
  };
}

/** Laedt alle per RLS erlaubten Rohdaten fuer Einzelansicht und Vergleich. */
export async function getEvaluationDashboardData(): Promise<EvaluationDashboardData> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return {
      currentUserId: "",
      canManage: false,
      athletes: [],
      events: [],
      plans: [],
      evaluations: [],
      personalGoals: [],
      skills: defaultEvaluationSkills,
      weights: defaultEvaluationWeights,
    };
  }

  const supabase = await createClient();
  const [people, events, plans, evaluationResult, skillsResult, weightsResult, goalsResult] = await Promise.all([
    getPeopleDirectory(),
    getCalendarEvents(),
    getSharedTrainingPlanSnapshots(),
    supabase
      .from("athlete_evaluations")
      .select("id, trainer_id, athlete_id, period_start, period_end, title, conversation_on, squad, dalid_status, personal_notes, measures, athlete_evaluation_skill_ratings(skill_key, rating, note), athlete_evaluation_contest_overrides(event_id, excluded, category, placement, note)")
      .order("period_end", { ascending: false }),
    supabase
      .from("evaluation_skill_settings")
      .select("skill_key, label, category, visible, sort_order, is_custom")
      .eq("trainer_id", currentUser.id),
    supabase
      .from("trainer_evaluation_settings")
      .select("attendance_weight, contest_weight, task_weight, skill_weight")
      .eq("trainer_id", currentUser.id)
      .maybeSingle(),
    supabase
      .from("athlete_personal_goals")
      .select("id, athlete_id, created_by, title, completed")
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [evaluationResult, skillsResult, weightsResult, goalsResult]) {
    if (result.error && !isMissingEvaluationSchema(result.error)) {
      throw new Error(`Auswertungsdaten konnten nicht geladen werden: ${result.error.message}`);
    }
  }

  const canManage = currentUser.accountType !== "athlete";
  const connectedAthletes = people.filter((person) =>
    person.role === "Athlet" && person.activeRelationships?.includes("trainer_athlete"),
  );
  const athletes = currentUser.accountType === "athlete"
    ? [currentAthleteAsPerson(currentUser)]
    : connectedAthletes;
  const weightRow = weightsResult.data;
  const weights = weightRow
    ? {
        attendance: weightRow.attendance_weight,
        contests: weightRow.contest_weight,
        tasks: weightRow.task_weight,
        skills: weightRow.skill_weight,
      }
    : defaultEvaluationWeights;
  const personalGoals: AthletePersonalGoal[] = ((goalsResult.data || []) as GoalRow[]).map((goal) => ({
    id: goal.id,
    athleteId: goal.athlete_id,
    title: goal.title,
    completed: goal.completed,
    createdBy: goal.created_by,
  }));

  return {
    currentUserId: currentUser.id,
    canManage,
    athletes,
    events,
    plans,
    evaluations: ((evaluationResult.data || []) as unknown as EvaluationRow[]).map(mapEvaluation),
    personalGoals,
    skills: mergeSkills((skillsResult.data || []) as SkillSettingRow[]),
    weights,
  };
}
