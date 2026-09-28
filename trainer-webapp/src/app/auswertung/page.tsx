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

/** Serverseitiger Einstieg fuer Einzel-Auswertung und Fahrervergleich (?athlete=<id> waehlt den Athleten vor). */
export default async function EvaluationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, params] = await Promise.all([getEvaluationDashboardData(), searchParams]);
  const fonts = `${figtree.variable} ${barlow.variable}`;
  return (
    <div className={fonts}>
      <EvaluationView
        initialData={data}
        initialAthleteId={typeof params.athlete === "string" ? params.athlete : undefined}
        fontClassName={fonts}
      />
    </div>
  );
}
