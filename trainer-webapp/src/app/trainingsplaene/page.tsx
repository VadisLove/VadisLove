import { Barlow_Condensed, Figtree } from "next/font/google";
import { getTrainingWorkspace } from "@/data/training-repository";
import { getTrainingVideoEvidence } from "@/data/shared-training-plan-repository";
import type { SessionRecap } from "@/domain/training-recap";
import { createClient } from "@/lib/supabase/server";
import { PlanHub, type HubTab } from "@/features/plan-hub/plan-hub";
import { parseHubContext, parseLibrary } from "@/features/plan-hub/plan-hub-model";

// Schriften des Redesigns gelten nur im Planbereich; der Rest der App bleibt unverändert.
const figtree = Figtree({ subsets: ["latin"], variable: "--hub-font", display: "swap" });
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--hub-display",
  display: "swap",
});

const tabs: HubTab[] = ["plaene", "fortschritt", "rueckblick"];

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

/**
 * Trainingspläne, Freigaben & Fortschritte und Session-Rückblick.
 * Alle Daten werden serverseitig geladen; Rechte prüft die Datenbank (RLS/RPC).
 */
export default async function TrainingPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [workspace, evidence, recapResult, contextResult, libraryResult] = await Promise.all([
    getTrainingWorkspace().catch(() => null),
    getTrainingVideoEvidence().catch(() => []),
    supabase.rpc("training_recaps"),
    // Rollen, Erstellrecht, Anrede, Gruppen und Vereinsvorlagen (DB prüft Rechte).
    supabase.rpc("training_plan_hub_context"),
    // Archiv- und Papierkorbstatus der verwaltbaren Pläne (fehlt ohne Migration → null).
    supabase.rpc("training_plan_library"),
  ]);
  const recaps = (recapResult.data ?? []) as SessionRecap[];
  const requestedTab = single(params.tab) as HubTab | undefined;

  return (
    <div className={`${figtree.variable} ${barlow.variable}`}>
      <PlanHub
        workspace={workspace}
        evidence={evidence}
        recaps={recaps}
        recapsFailed={Boolean(recapResult.error)}
        names={recaps.map((recap) => [recap.athlete_user_id ?? recap.athlete_id, recap.athlete_name])}
        context={contextResult.error ? null : parseHubContext(contextResult.data)}
        library={libraryResult.error ? null : parseLibrary(libraryResult.data)}
        initialRights={single(params.rechte) === "1"}
        initialTab={requestedTab && tabs.includes(requestedTab) ? requestedTab : "plaene"}
        initialPlanKey={single(params.plan) ?? null}
        initialAction={single(params.action) ?? null}
        initialSessionId={single(params.session) ?? null}
        initialExercise={Number(single(params.exercise)) || 0}
        createRequest={single(params.neu) ?? null}
      />
    </div>
  );
}
