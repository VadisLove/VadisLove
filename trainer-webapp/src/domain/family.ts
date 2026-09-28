/** Die Athleten-ID bleibt auch beim späteren eigenen Login dieselbe. */
export interface FamilyChild {
  id: string;
  name: string;
  hasLogin: boolean;
  events: FamilyEvent[];
}

export interface FamilyEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: "scheduled" | "cancelled";
  attendance: "open" | "confirmed" | "declined" | null;
  revision: number;
  responseAt: string | null;
  needsAcknowledgement: boolean;
  late: boolean;
  deadline: string | null;
}

export interface FamilyOverview {
  children: FamilyChild[];
  notifications?: { id: string; title: string; message: string; createdAt: string }[];
}

/** Offene Antworten und wichtige Änderungen zählen getrennt als Aufgaben. */
export function familyTaskCount(child: FamilyChild): number {
  return child.events.reduce((count, event) => count
    + (event.status === "scheduled" && event.attendance === "open" ? 1 : 0)
    + (event.needsAcknowledgement ? 1 : 0), 0);
}

/** Serverfehler werden als feste Codes übertragen, niemals als SQL-/Kontodetails. */
export type FamilyResult = {
  ok: boolean;
  code: "saved" | "invalid" | "forbidden" | "linkInvalid" | "conflict" | "failed";
  invitationToken?: string;
};

export function familyErrorCode(message: string): FamilyResult["code"] {
  if (message.includes("FAMILY_LINK_INVALID")) return "linkInvalid";
  if (message.includes("FAMILY_CONFLICT")) return "conflict";
  if (message.includes("FAMILY_INVALID") || message.includes("invalid input syntax")) return "invalid";
  if (message.includes("FAMILY_FORBIDDEN")) return "forbidden";
  return "failed";
}
