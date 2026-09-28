import { Barlow_Condensed, Figtree } from "next/font/google";
import { getEvaluationDashboardData } from "@/data/evaluation-repository";
import { EvaluationView } from "@/features/evaluations/evaluation-view";

// Schriften des Redesigns gelten nur in der Auswertung (wie im Trainingsplan-Bereich).
const figtree = Figtree({ subsets: ["latin"], variable: "--eval-font", display: "swap" });
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--eval-display",
  display: "swap",
});

/** Serverseitiger Einstieg fuer Einzel-Auswertung und Fahrervergleich. */
export default async function EvaluationPage() {
  const data = await getEvaluationDashboardData();
  return (
    <div className={`${figtree.variable} ${barlow.variable}`}>
      <EvaluationView initialData={data} />
    </div>
  );
}
