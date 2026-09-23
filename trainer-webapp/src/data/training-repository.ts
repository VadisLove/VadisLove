import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { getSharedTrainingPlanSnapshots } from "@/data/shared-training-plan-repository";
import type {
  SavedPlan,
  TrainingSession,
  TrainingWorkspace,
} from "@/domain/training";

/** Kein Mock-Fallback: ein fehlgeschlagener Abruf wird als Fehler sichtbar. */
export async function getTrainingWorkspace(): Promise<TrainingWorkspace> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Bitte erneut anmelden.");
  const supabase = await createClient();
  const [snapshot, shares, people] = await Promise.all([
    supabase.rpc("training_workspace_data"),
    getSharedTrainingPlanSnapshots(),
    getPeopleDirectory(),
  ]);
  if (snapshot.error)
    throw new Error(
      "Trainings konnten nicht geladen werden. Bitte erneut versuchen.",
    );
  return {
    user,
    shares,
    plans: (snapshot.data.plans as SavedPlan[]).map((p) => ({
      ...p,
      versions: p.versions.sort((a, b) => b.version_number - a.version_number),
    })),
    sessions: (snapshot.data.sessions as TrainingSession[]).map((s) => ({
      ...s,
      exercises: s.exercises.sort((a, b) => a.sort_order - b.sort_order),
    })),
    sharePeople: people
      .filter(
        (p) => p.id !== user.id && (p.activeRelationships?.length ?? 0) > 0,
      )
      .map((p) => ({ id: p.id, name: p.name })),
    people: people
      .filter(
        (p) =>
          p.accountType === "athlete" &&
          p.activeRelationships?.includes("trainer_athlete"),
      )
      .map((p) => ({ id: p.id, name: p.name })),
  };
}
