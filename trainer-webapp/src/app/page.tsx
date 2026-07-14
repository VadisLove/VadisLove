import { Dashboard } from "@/features/dashboard/dashboard";
import { trainerRepository } from "@/data/trainer-repository";
import { getUpcomingCalendarEvents } from "@/data/supabase-event-repository";

/**
 * Lädt alle voneinander unabhängigen Dashboard-Daten parallel.
 *
 * Termine kommen aus derselben Supabase-Quelle wie der Kalender. Dadurch zeigt
 * das Dashboard nur Termine, die der aktuelle Account per RLS sehen darf.
  */
export default async function HomePage() {
  const [events, attendance, plans, regions] = await Promise.all([
    getUpcomingCalendarEvents(),
    trainerRepository.getAttendance("e1"),
    trainerRepository.getTrainingPlans(),
    trainerRepository.getRegions(),
  ]);

  return (
    <Dashboard
      events={events}
      attendance={attendance}
      plans={plans}
      regions={regions}
    />
  );
}
