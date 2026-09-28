import { Dashboard } from "@/features/dashboard/dashboard";
import { trainerRepository } from "@/data/trainer-repository";
import { getUpcomingCalendarEvents } from "@/data/supabase-event-repository";
import { getSharedTrainingPlanSnapshots } from "@/data/shared-training-plan-repository";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { pendingTrickConfirmations, type PendingConfirmation } from "@/features/evaluations/evaluation-model";
import { getCurrentUser } from "@/lib/current-user";

/** Gemeldete Tricks aller eigenen Athleten; Fehler blenden nur die Warteschlange aus. */
async function loadConfirmationQueue(): Promise<PendingConfirmation[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.accountType === "athlete") return [];
  try {
    const [plans, people] = await Promise.all([getSharedTrainingPlanSnapshots(), getPeopleDirectory()]);
    return pendingTrickConfirmations(plans, new Map(people.map((person) => [person.id, person.name])));
  } catch {
    return [];
  }
}

/**
 * Lädt alle voneinander unabhängigen Dashboard-Daten parallel.
 *
 * Termine kommen aus derselben Supabase-Quelle wie der Kalender. Dadurch zeigt
 * das Dashboard nur Termine, die der aktuelle Account per RLS sehen darf.
  */
export default async function HomePage() {
  const [events, plans, regions, confirmations] = await Promise.all([
    getUpcomingCalendarEvents(),
    trainerRepository.getTrainingPlans(),
    trainerRepository.getRegions(),
    loadConfirmationQueue(),
  ]);

  return (
    <Dashboard
      events={events}
      plans={plans}
      regions={regions}
      confirmations={confirmations}
    />
  );
}
