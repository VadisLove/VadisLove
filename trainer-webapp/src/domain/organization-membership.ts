import type { AccountType } from "@/domain/current-user";
import type { OrganizationLevel, OrganizationRole } from "@/domain/models";

/**
 * Ordnet Kontotyp und Organisationsebene der fachlich passenden Rolle zu.
 * Die Rolle wird lediglich beantragt; Verwaltungsrechte entstehen erst nach
 * der Bestätigung durch die zuständige Organisation.
 */
export function getRequestedOrganizationRole(
  accountType: AccountType | undefined,
  level: OrganizationLevel,
): OrganizationRole | null {
  if (accountType === "trainer") {
    if (level === "federal") return "federal_trainer";
    if (level === "state") return "state_trainer";
    return "club_trainer";
  }

  if (accountType === "organization_staff") {
    if (level === "federal") return "federal_chair";
    if (level === "state") return "specialist";
    return "club_board";
  }

  if (accountType === "medical") return "medical";
  if (accountType === "athlete" && level === "club") return "athlete";
  if (accountType === "guardian" && level === "club") return "guardian";

  return null;
}
