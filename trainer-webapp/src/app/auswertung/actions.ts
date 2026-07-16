"use server";

import { revalidatePath } from "next/cache";
import type {
  EvaluationContestOverride,
  EvaluationSkillCategory,
  EvaluationSkillDefinition,
  EvaluationSkillRating,
  EvaluationWeights,
} from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface EvaluationActionResult {
  status: "success" | "error";
  message: string;
  evaluationId?: string;
}

export interface SaveEvaluationInput {
  athleteId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  conversationOn: string;
  squad: string;
  dalidStatus: string;
  personalNotes: string;
  measures: string;
  skillRatings: EvaluationSkillRating[];
  contestOverrides: EvaluationContestOverride[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedCategories = new Set<EvaluationSkillCategory>(["skateboarding", "mental", "athletic"]);

function validDate(value: string) {
  return datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Speichert redaktionelle Auswertungsdaten und Kindzeilen als eine fachliche Einheit. */
export async function saveAthleteEvaluation(input: SaveEvaluationInput): Promise<EvaluationActionResult> {
  if (!input.athleteId || !validDate(input.periodStart) || !validDate(input.periodEnd) || input.periodEnd < input.periodStart) {
    return { status: "error", message: "Bitte einen gültigen Athleten und Zeitraum wählen." };
  }
  if (input.skillRatings.some((rating) => !rating.skillKey || rating.rating < 1 || rating.rating > 5 || rating.note.length > 3000)) {
    return { status: "error", message: "Mindestens eine Skill-Bewertung ist ungültig." };
  }
  if (input.contestOverrides.some((override) => !override.eventId || (override.placement !== null && override.placement < 1))) {
    return { status: "error", message: "Mindestens ein Contest-Ergebnis ist ungültig." };
  }

  const supabase = await createClient();
  const trainerId = await getAuthenticatedUserId(supabase);
  if (!trainerId) return { status: "error", message: "Bitte erneut anmelden." };

  const { data: evaluation, error } = await supabase
    .from("athlete_evaluations")
    .upsert({
      trainer_id: trainerId,
      athlete_id: input.athleteId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      title: input.title.trim().slice(0, 200),
      conversation_on: input.conversationOn || null,
      squad: input.squad.trim().slice(0, 120),
      dalid_status: input.dalidStatus.trim().slice(0, 240),
      personal_notes: input.personalNotes.trim().slice(0, 10000),
      measures: input.measures.trim().slice(0, 5000),
      updated_at: new Date().toISOString(),
    }, { onConflict: "trainer_id,athlete_id,period_start,period_end" })
    .select("id")
    .single();

  if (error || !evaluation) {
    return {
      status: "error",
      message: error?.code === "42501"
        ? "Auswertungen dürfen nur für aktiv verbundene Athleten gespeichert werden."
        : "Die Auswertung konnte nicht gespeichert werden.",
    };
  }

  // Vollstaendiges Ersetzen verhindert veraltete Bewertungen, wenn Skills ausgeblendet wurden.
  const [ratingDelete, contestDelete] = await Promise.all([
    supabase.from("athlete_evaluation_skill_ratings").delete().eq("evaluation_id", evaluation.id),
    supabase.from("athlete_evaluation_contest_overrides").delete().eq("evaluation_id", evaluation.id),
  ]);
  if (ratingDelete.error || contestDelete.error) {
    return { status: "error", message: "Die Auswertung wurde angelegt, Details konnten aber nicht aktualisiert werden." };
  }

  const ratingRows = input.skillRatings.map((rating) => ({
    evaluation_id: evaluation.id,
    skill_key: rating.skillKey,
    rating: Math.round(rating.rating),
    note: rating.note.trim().slice(0, 3000),
  }));
  const contestRows = input.contestOverrides.map((override) => ({
    evaluation_id: evaluation.id,
    event_id: override.eventId,
    excluded: override.excluded,
    category: override.category.trim().slice(0, 120),
    placement: override.placement,
    note: override.note.trim().slice(0, 2000),
  }));
  const [ratingInsert, contestInsert] = await Promise.all([
    ratingRows.length ? supabase.from("athlete_evaluation_skill_ratings").insert(ratingRows) : Promise.resolve({ error: null }),
    contestRows.length ? supabase.from("athlete_evaluation_contest_overrides").insert(contestRows) : Promise.resolve({ error: null }),
  ]);
  if (ratingInsert.error || contestInsert.error) {
    return { status: "error", message: "Die Stammdaten wurden gespeichert, einzelne Details jedoch nicht." };
  }

  revalidatePath("/auswertung");
  return { status: "success", message: "Auswertung gespeichert.", evaluationId: evaluation.id };
}

/** Speichert Gewichtung und Skill-Katalog ausschließlich fuer den angemeldeten Trainer. */
export async function saveEvaluationSettings({
  weights,
  skills,
}: {
  weights: EvaluationWeights;
  skills: EvaluationSkillDefinition[];
}): Promise<EvaluationActionResult> {
  const weightValues = [weights.attendance, weights.contests, weights.tasks, weights.skills];
  if (weightValues.some((value) => !Number.isInteger(value) || value < 0 || value > 100) || weightValues.reduce((sum, value) => sum + value, 0) !== 100) {
    return { status: "error", message: "Die vier Gewichtungen müssen zusammen genau 100 % ergeben." };
  }
  if (skills.some((skill) => !skill.key.trim() || !skill.label.trim() || !allowedCategories.has(skill.category))) {
    return { status: "error", message: "Bitte alle Skills vollständig ausfüllen." };
  }

  const supabase = await createClient();
  const trainerId = await getAuthenticatedUserId(supabase);
  if (!trainerId) return { status: "error", message: "Bitte erneut anmelden." };

  const { error: weightError } = await supabase.from("trainer_evaluation_settings").upsert({
    trainer_id: trainerId,
    attendance_weight: weights.attendance,
    contest_weight: weights.contests,
    task_weight: weights.tasks,
    skill_weight: weights.skills,
    updated_at: new Date().toISOString(),
  }, { onConflict: "trainer_id" });
  const { error: skillError } = await supabase.from("evaluation_skill_settings").upsert(
    skills.map((skill) => ({
      trainer_id: trainerId,
      skill_key: skill.key,
      label: skill.label.trim().slice(0, 160),
      category: skill.category,
      visible: skill.visible,
      sort_order: skill.sortOrder,
      is_custom: skill.custom,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "trainer_id,skill_key" },
  );

  if (weightError || skillError) {
    return { status: "error", message: "Die Auswertungseinstellungen konnten nicht gespeichert werden." };
  }
  revalidatePath("/einstellungen");
  revalidatePath("/auswertung");
  return { status: "success", message: "Auswertungseinstellungen gespeichert." };
}

export async function createPersonalGoal(athleteId: string, title: string): Promise<EvaluationActionResult> {
  const normalizedTitle = title.trim();
  if (!athleteId || !normalizedTitle || normalizedTitle.length > 240) {
    return { status: "error", message: "Bitte ein gültiges persönliches Ziel eingeben." };
  }
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase.from("athlete_personal_goals").insert({
    athlete_id: athleteId,
    created_by: currentUserId,
    title: normalizedTitle,
  });
  if (error) return { status: "error", message: "Das persönliche Ziel konnte nicht angelegt werden." };
  revalidatePath("/auswertung");
  return { status: "success", message: "Persönliches Ziel ergänzt." };
}

export async function setPersonalGoalCompleted(goalId: string, completed: boolean): Promise<EvaluationActionResult> {
  if (!goalId) return { status: "error", message: "Ziel nicht gefunden." };
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };
  const { error } = await supabase
    .from("athlete_personal_goals")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) return { status: "error", message: "Das Ziel konnte nicht aktualisiert werden." };
  revalidatePath("/auswertung");
  return { status: "success", message: "Ziel aktualisiert." };
}
