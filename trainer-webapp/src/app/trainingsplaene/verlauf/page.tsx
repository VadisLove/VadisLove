import { redirect } from "next/navigation";

/** Der Session-Rückblick ist jetzt ein Tab im Planbereich. */
export default function ProgressPage() {
  redirect("/trainingsplaene?tab=rueckblick");
}
