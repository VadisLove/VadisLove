import { attendance, events, people, regions, trainingPlans } from "@/data/mock-data";
import type {
  Attendance,
  CalendarEvent,
  Person,
  Region,
  TrainingPlan,
} from "@/domain/models";

/**
 * Vertrag für die Daten, welche die Oberfläche benötigt.
 *
 * Eine spätere `SupabaseTrainerRepository` implementiert dieselben Methoden.
 * Die UI bleibt dadurch unabhängig davon, ob Daten lokal, per REST oder direkt
 * aus Supabase geladen werden.
 */
export interface TrainerRepository {
  getEvents(): Promise<CalendarEvent[]>;
  getAttendance(eventId: string): Promise<Attendance[]>;
  getPeople(): Promise<Person[]>;
  getTrainingPlans(): Promise<TrainingPlan[]>;
  getRegions(): Promise<Region[]>;
}

class MockTrainerRepository implements TrainerRepository {
  async getEvents() {
    return events;
  }

  async getAttendance(eventId: string) {
    return attendance.filter((entry) => entry.eventId === eventId);
  }

  async getPeople() {
    return people;
  }

  async getTrainingPlans() {
    return trainingPlans;
  }

  async getRegions() {
    return regions;
  }
}

/**
 * Zentral exportierte Datenquelle des MVP.
 *
 * Alle Server-Seiten verwenden dieses Objekt. Beim Anschluss an Supabase wird
 * ausschließlich diese Instanz gegen die produktive Implementierung getauscht.
 */
export const trainerRepository: TrainerRepository = new MockTrainerRepository();
