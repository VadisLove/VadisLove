import { redirect } from "next/navigation";
import { TrainingWorkspaceView } from "@/features/training/training-workspace";
import { getTrainingWorkspace } from "@/data/training-repository";

export default async function TrainingPlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
    plan?: string;
    action?: string;
    exercise?: string;
  }>;
}) {
  const params = await searchParams;
  // Bestehende Benachrichtigungslinks öffnen weiterhin die bisherige Freigabe.
  if (params.plan || params.action) {
    const query = new URLSearchParams();
    if (params.plan) query.set("plan", params.plan);
    if (params.action) query.set("action", params.action);
    redirect(`/trainingsplaene/freigaben?${query}`);
  }
  const initial = await getTrainingWorkspace().catch(() => null);
  return (
    <TrainingWorkspaceView
      initial={initial}
      initialSessionId={params.session ?? null}
      initialExercise={Number(params.exercise) || 0}
    />
  );
}
