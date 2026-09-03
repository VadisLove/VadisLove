/** Fachtypen der Fahrgemeinschaften; unabhängig von React und Datenbankclient. */
export type RideDirection = "outbound" | "return";
export type RideOperation =
  | "offer"
  | "wanted"
  | "remove_wanted"
  | "request"
  | "confirm"
  | "decline"
  | "cancel_request"
  | "acknowledge"
  | "edit"
  | "cancel_ride"
  | "review"
  | "comment"
  | "preferences";
export interface RideRequest {
  id: string;
  passenger_id: string;
  passenger_name: string;
  status: "pending" | "confirmed" | "declined" | "cancelled";
  acknowledged_revision: number;
}
export interface RideComment {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}
export interface CarpoolRide {
  id: string;
  event_id: string | null;
  driver_id: string;
  driver_name: string;
  direction: RideDirection;
  departure_at: string;
  origin: string;
  meeting_point: string;
  seats: number;
  confirmed_count: number;
  note: string;
  status: "active" | "review" | "cancelled";
  revision: number;
  can_request: boolean;
  can_comment: boolean;
  requests: RideRequest[];
  comments: RideComment[];
}
export interface RideWanted {
  id: string;
  user_id: string;
  user_name: string;
  direction: RideDirection;
  origin: string;
  note: string;
}
export interface CarpoolPreferences {
  own_app: boolean;
  own_email: boolean;
  guardian_app: boolean;
  guardian_email: boolean;
  locale: "de" | "en";
}
export interface CarpoolSnapshot {
  asOf: string;
  userId: string;
  canOffer: boolean;
  canUseEvent: boolean;
  rides: CarpoolRide[];
  wanted: RideWanted[];
  preferences: CarpoolPreferences;
}
export const carpoolOperations = new Set<RideOperation>([
  "offer",
  "wanted",
  "remove_wanted",
  "request",
  "confirm",
  "decline",
  "cancel_request",
  "acknowledge",
  "edit",
  "cancel_ride",
  "review",
  "comment",
  "preferences",
]);
export function isCarpoolId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
/** Nur bekannte Fehlercodes gelangen ins UI; interne SQL-Details bleiben verborgen. */
export function carpoolErrorCode(error: {
  code?: string;
  message?: string;
}): string {
  if (error.code === "23505") return "duplicate";
  const code = error.message?.match(/CARPOOL_([A-Z_]+)/)?.[1];
  if (code) return code.toLowerCase();
  if (["PGRST202", "42P01", "42883"].includes(error.code || ""))
    return "unavailable";
  return "failed";
}
