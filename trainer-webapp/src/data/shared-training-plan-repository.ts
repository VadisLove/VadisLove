import type { TrainingPlan } from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function isTrainingPlan(value: unknown): value is TrainingPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<TrainingPlan>;
  return (
    typeof plan.id === "string" &&
    typeof plan.title === "string" &&
    Array.isArray(plan.goals) &&
    Array.isArray(plan.tricks)
  );
}

/** Laedt dauerhaft empfangene Plan-Momentaufnahmen fuer die Planbibliothek. */
export async function getReceivedTrainingPlanSnapshots(): Promise<TrainingPlan[]> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return [];

  const { data, error } = await supabase
    .from("training_plan_snapshot_shares")
    .select("id, plan_snapshot, created_at")
    .eq("recipient_user_id", currentUserId)
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.code === "PGRST205" ||
      error.code === "42P01" ||
      error.message.toLowerCase().includes("schema cache")
    ) {
      return [];
    }
    throw new Error(`Geteilte Trainingspläne konnten nicht geladen werden: ${error.message}`);
  }

  return (data || []).flatMap((row) => {
    if (!isTrainingPlan(row.plan_snapshot)) return [];
    return [{
      ...row.plan_snapshot,
      id: `shared-${row.id}`,
      sourcePlanId: row.plan_snapshot.id,
      author: `${row.plan_snapshot.author} · geteilt`,
    }];
  });
}
