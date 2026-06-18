import { Dashboard } from "@/features/dashboard/dashboard";
import { trainerRepository } from "@/data/trainer-repository";

/**
 * Lädt alle voneinander unabhängigen Dashboard-Daten parallel.
 *
 * Das vermeidet unnötige Warteketten. Die Ergebnisse werden als klar benannte
 * Props an das Client-Dashboard übergeben und dort für Filter wiederverwendet.
 */
export default async function HomePage() {
  const [events, attendance, plans, regions] = await Promise.all([
    trainerRepository.getEvents(),
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
