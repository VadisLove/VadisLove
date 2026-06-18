import type { OrganizationRole } from "@/domain/models";

export type InvitationRole = Exclude<OrganizationRole, "medical">;

export const invitationRoles: InvitationRole[] = [
  "federal_chair",
  "specialist",
  "federal_trainer",
  "state_trainer",
  "club_trainer",
  "club_board",
  "athlete",
  "guardian",
];

/**
 * Ermittelt aus den echten Mitgliedschaftsrollen, welche Konto-Rollen eine
 * Person einladen darf. Die Datenbank prüft dieselbe Regel zusätzlich per RLS.
 */
export function getAllowedInvitationRoles(
  memberships: OrganizationRole[],
): InvitationRole[] {
  const allowed = new Set<InvitationRole>();

  for (const role of memberships) {
    if (
      role === "club_trainer" ||
      role === "state_trainer" ||
      role === "federal_trainer"
    ) {
      allowed.add("athlete");
      allowed.add("guardian");
    }

    if (role === "specialist") {
      allowed.add("specialist");
      allowed.add("state_trainer");
      allowed.add("club_board");
      allowed.add("club_trainer");
      allowed.add("athlete");
      allowed.add("guardian");
    }

    if (role === "federal_chair") {
      for (const invitationRole of invitationRoles) {
        allowed.add(invitationRole);
      }
    }
  }

  return invitationRoles.filter((role) => allowed.has(role));
}

export function isInvitationRole(value: string): value is InvitationRole {
  return invitationRoles.includes(value as InvitationRole);
}
