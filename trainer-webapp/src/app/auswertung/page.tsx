import { getEvaluationDashboardData } from "@/data/evaluation-repository";
import { EvaluationView } from "@/features/evaluations/evaluation-view";

/** Serverseitiger Einstieg fuer Einzel-Auswertung und Fahrervergleich. */
export default async function EvaluationPage() {
  const data = await getEvaluationDashboardData();
  return <EvaluationView initialData={data} />;
}
