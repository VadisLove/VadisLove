/**
 * Gemeinsame Fachtypen des MVP.
 *
 * Diese Typen sind bewusst unabhängig von React und Supabase. Dadurch können
 * Web-App, spätere Mobile-App und Server-Funktionen dasselbe Datenmodell nutzen.
 */

export type EventType = "training" | "contest" | "medical" | "meeting";
export type AttendanceStatus = "confirmed" | "open" | "declined";
export type OrganizationLevel = "federal" | "state" | "club";
export type OrganizationRole =
  | "federal_chair"
  | "specialist"
  | "federal_trainer"
  | "state_trainer"
  | "club_trainer"
  | "club_board"
  | "athlete"
  | "guardian"
  | "medical";

export interface Region {
  id: string;
  name: string;
  state: string;
  eventCount: number;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  accountType?: string;
  role: "Athlet" | "Trainer" | "Medizinische Fachkraft";
  region: string;
  initials: string;
  roles?: OrganizationRole[];
  states?: string[];
  clubs?: string[];
}

export interface Attendance {
  id: string;
  eventId: string;
  person: Person;
  status: AttendanceStatus;
}

export interface CalendarEvent {
  id: string;
  organizationId?: string;
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  state: string;
  region: string;
  capacity: number;
  confirmed: number;
  description: string;
  createdBy?: string;
  canManage?: boolean;
}

export interface EventOrganizationOption {
  id: string;
  name: string;
}

export interface TrainingPlan {
  id: string;
  title: string;
  category: string;
  version: string;
  author: string;
  ownerLevel: OrganizationLevel;
  sharedWith: OrganizationLevel[];
  updatedAt: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  visibility: "private" | "public";
  isTemplate: boolean;
  sourcePlanId?: string;
  deadline?: string;
  assignedGroups: string[];
  assignedAthletes: string[];
  sharedTrainers: string[];
  goals: TrainingGoal[];
  tricks: TrainingTrick[];
}

export type GoalCadence = "daily" | "weekly" | "monthly" | "yearly";
export type TrickProgressStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_confirmation"
  | "confirmed";

export interface TrainingGoal {
  id: string;
  title: string;
  cadence: GoalCadence;
  completed: boolean;
}

export interface TrainingTrick {
  id: string;
  name: string;
  group: string;
  level: number;
  athleteId: string;
  status: TrickProgressStatus;
}

export interface OrganizationOverview {
  id: string;
  parentId: string | null;
  name: string;
  level: OrganizationLevel;
  stateCode: string | null;
  regionName: string | null;
  memberCount: number;
  roleCounts: Partial<Record<OrganizationRole, number>>;
}

export interface ManageableFederalOrganization {
  id: string;
  name: string;
}

export interface AssignableProfile {
  id: string;
  displayName: string;
  email: string;
  accountType: string;
  createdAt: string;
}

export interface RoleAssignmentOption {
  organizationId: string;
  role: OrganizationRole;
}
