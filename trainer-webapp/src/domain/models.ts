/**
 * Gemeinsame Fachtypen des MVP.
 *
 * Diese Typen sind bewusst unabhängig von React und Supabase. Dadurch können
 * Web-App, spätere Mobile-App und Server-Funktionen dasselbe Datenmodell nutzen.
 */

export type EventType = "training" | "contest" | "medical" | "meeting";
export type AttendanceStatus = "confirmed" | "open" | "declined";
export type OrganizationLevel = "federal" | "state" | "club";
export type RequestStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type RelationshipType = "friend" | "trainer_athlete" | "guardian";
export type GroupMemberRole = "owner" | "admin" | "member";
export type NotificationType =
  | "relationship_request"
  | "relationship_response"
  | "membership_request"
  | "membership_response"
  | "group_invitation"
  | "group_activity"
  | "event_created"
  | "training_plan_shared"
  | "guardian_activity"
  | "club_joined"
  | "club_left"
  | "federation_changed"
  | "federation_invalidated"
  | "account_deletion_scheduled"
  | "account_restored"
  | "account_finalized";
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
  activeRelationships?: RelationshipType[];
  pendingSent?: RelationshipType[];
  pendingReceived?: RelationshipType[];
}

export interface RelationshipRequest {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  relationshipType: RelationshipType;
  status: RequestStatus;
  message: string;
  createdAt: string;
  otherPerson: Pick<Person, "id" | "name" | "initials" | "accountType">;
  direction: "incoming" | "outgoing";
}

export interface SocialGroup {
  id: string;
  name: string;
  description: string;
  role: GroupMemberRole;
  memberCount: number;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  invitedBy: string;
  invitedUserId: string;
  status: RequestStatus;
  createdAt: string;
  actorName: string;
  direction: "incoming" | "outgoing";
}

export interface MembershipInboxRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
  requestedRole: OrganizationRole;
  status: RequestStatus;
  note: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
}

export interface JoinableOrganization {
  id: string;
  name: string;
  level: OrganizationLevel;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  relationshipRequests: boolean;
  requestUpdates: boolean;
  groupActivity: boolean;
  newEvents: boolean;
  trainingPlans: boolean;
  guardianActivity: boolean;
}

export interface InboxOverview {
  relationshipRequests: RelationshipRequest[];
  groupInvitations: GroupInvitation[];
  membershipRequests: MembershipInboxRequest[];
  groups: SocialGroup[];
  people: Person[];
  organizations: JoinableOrganization[];
}

export interface Attendance {
  id: string;
  eventId: string;
  person: Person;
  status: AttendanceStatus;
}

export interface EventParticipantSummary {
  id: string;
  name: string;
  email: string;
  accountType: string;
  status: AttendanceStatus;
}

export interface CalendarEvent {
  id: string;
  organizationId?: string;
  title: string;
  type: EventType;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  state: string;
  region: string;
  capacity: number;
  confirmed: number;
  attendanceSummary: Record<AttendanceStatus, number>;
  attendanceStatus?: AttendanceStatus;
  participants: EventParticipantSummary[];
  description: string;
  createdBy?: string;
  canManage?: boolean;
}

export interface EventOrganizationOption {
  id: string;
  name: string;
  allowedEventTypes: EventType[];
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
export type TrainingTargetType =
  | "attempts"
  | "repetitions"
  | "duration"
  | "free";

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
  /**
   * Neue strukturierte Felder sind optional typisiert, damit bereits im
   * Umlauf befindliche Plan-Snapshots weiterhin eingelesen werden koennen.
   * Vor der Anzeige werden sie zentral auf vollstaendige Standardwerte normalisiert.
   */
  targetType?: TrainingTargetType;
  targetValue?: string;
  trainerNote?: string;
  sortOrder?: number;
  equipment?: string;
  athleteId: string;
  status: TrickProgressStatus;
}

/**
 * Externer Videonachweis, getrennt vom Plan-Snapshot.
 * So kann die spaetere RLS den Zugriff pro Athlet und Trainer absichern.
 */
export interface TrainingVideoEvidence {
  id: string;
  planId: string;
  trickId: string;
  athleteId: string;
  provider: "youtube";
  videoId: string;
  athleteComment: string;
  attemptCount: number;
  selfRating: 1 | 2 | 3 | 4 | 5;
  submittedAt: string;
  reviewStatus: "pending" | "approved" | "changes_requested";
  trainerFeedback: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/**
 * YouTube-Demonstration eines Trainers fuer eine konkrete Uebung.
 * Auch hier bleibt die rohe URL ausserhalb des Datenmodells.
 */
export interface TrainingExerciseDemoVideo {
  id: string;
  sourcePlanId: string;
  trickId: string;
  createdBy: string;
  provider: "youtube";
  videoId: string;
  title: string;
  trainerNote: string;
  visibility: "assigned" | "public";
  createdAt: string;
}

export interface TrainingLeaderboardEntry {
  userId: string;
  displayName: string;
  initials: string;
  xpTotal: number;
}

export type EvaluationSkillCategory = "skateboarding" | "mental" | "athletic";

export interface EvaluationWeights {
  attendance: number;
  contests: number;
  tasks: number;
  skills: number;
}

export interface EvaluationSkillDefinition {
  key: string;
  label: string;
  category: EvaluationSkillCategory;
  visible: boolean;
  sortOrder: number;
  custom: boolean;
}

export interface EvaluationSkillRating {
  skillKey: string;
  rating: number;
  note: string;
}

export interface EvaluationContestOverride {
  eventId: string;
  excluded: boolean;
  category: string;
  placement: number | null;
  note: string;
}

export interface AthleteEvaluation {
  id: string;
  trainerId: string;
  athleteId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  conversationOn: string;
  squad: string;
  dalidStatus: string;
  personalNotes: string;
  measures: string;
  skillRatings: EvaluationSkillRating[];
  contestOverrides: EvaluationContestOverride[];
}

export interface AthletePersonalGoal {
  id: string;
  athleteId: string;
  title: string;
  completed: boolean;
  createdBy: string;
}

/** Rohdaten fuer die Auswertungsoberflaeche; Kennzahlen werden pro Zeitraum im Client berechnet. */
export interface EvaluationDashboardData {
  currentUserId: string;
  canManage: boolean;
  athletes: Person[];
  events: CalendarEvent[];
  plans: TrainingPlan[];
  evaluations: AthleteEvaluation[];
  personalGoals: AthletePersonalGoal[];
  skills: EvaluationSkillDefinition[];
  weights: EvaluationWeights;
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
