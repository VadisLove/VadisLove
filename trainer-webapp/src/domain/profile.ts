import type { AccountType } from "@/domain/current-user";
import type { OrganizationRole } from "@/domain/models";

export type ProfileVisibility = "all_members" | "contacts" | "private";

export interface ClubMembership {
  organizationId: string;
  clubName: string;
  federationId: string;
  federationName: string;
  roles: OrganizationRole[];
  joinedAt: string;
  status: "active";
}

export interface EligibleFederation {
  id: string;
  name: string;
  qualifyingClubs: string[];
}

export interface FederationAffiliation {
  id: string;
  federationId: string;
  federationName: string;
  active: boolean;
  selectedAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
}

export interface ProfileOverview {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  disciplines: string[];
  visibility: ProfileVisibility;
  avatarPath: string | null;
  avatarUrl: string | null;
  accountType: AccountType;
  organizationRoles: OrganizationRole[];
  clubMemberships: ClubMembership[];
  eligibleFederations: EligibleFederation[];
  activeFederation: FederationAffiliation | null;
  invalidFederation: FederationAffiliation | null;
}

export const profileVisibilityLabels: Record<ProfileVisibility, string> = {
  all_members: "Alle Mitglieder",
  contacts: "Nur Kontakte",
  private: "Privat",
};

export const accountTypeLabels: Record<AccountType, string> = {
  unspecified: "Nicht festgelegt",
  athlete: "Athlet",
  trainer: "Trainer",
  medical: "Medizinische Fachkraft",
  guardian: "Erziehungsberechtigte Person",
  organization_staff: "Organisationskonto",
};

export const organizationRoleLabels: Record<OrganizationRole, string> = {
  federal_chair: "Bundesvorsitz",
  specialist: "Fachwart",
  federal_trainer: "Bundestrainer",
  state_trainer: "Landestrainer",
  club_trainer: "Vereinstrainer",
  club_board: "Vereinsvorstand",
  athlete: "Athlet",
  guardian: "Erziehungsberechtigte Person",
  medical: "Medizinische Fachkraft",
};

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Validiert Bild-Metadaten sowohl vor der Komprimierung im Browser als auch in
 * Tests. Supabase erzwingt dieselben MIME-Typen und dieselbe Groesse nochmals.
 */
export function validateProfilePhoto(file: Pick<File, "type" | "size">): string | null {
  if (!allowedPhotoTypes.has(file.type)) {
    return "Bitte wähle ein JPG-, PNG- oder WebP-Bild.";
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return "Das Profilfoto darf höchstens 5 MB groß sein.";
  }
  return null;
}

/** Normalisiert eine komma- oder zeilengetrennte Disziplinen-Eingabe. */
export function parseDisciplines(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((discipline) => discipline.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export interface EditableProfileDetails {
  firstName: string;
  lastName: string;
  phone: string;
  location: string;
  bio: string;
  disciplines: string[];
  visibility: ProfileVisibility;
}

export interface ProfileMembershipSource {
  organization_id: string;
  role: OrganizationRole;
  created_at: string;
}

export interface ProfileOrganizationSource {
  id: string;
  name: string;
  level: "federal" | "state" | "club";
  parent_id: string | null;
}

function uniqueMembershipRoles(memberships: ProfileMembershipSource[]) {
  return Array.from(new Set(memberships.map((membership) => membership.role)));
}

/**
 * Fuehrt mehrere Rollen in demselben Verein zu einer fachlichen Mitgliedschaft
 * zusammen. Andere Vereinsmitgliedschaften bleiben als eigene Karten erhalten.
 */
export function buildClubMemberships(
  memberships: ProfileMembershipSource[],
  organizations: ProfileOrganizationSource[],
): ClubMembership[] {
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const membershipsByClub = new Map<string, ProfileMembershipSource[]>();

  for (const membership of memberships) {
    const organization = organizationsById.get(membership.organization_id);
    if (organization?.level !== "club") continue;
    const group = membershipsByClub.get(organization.id) || [];
    group.push(membership);
    membershipsByClub.set(organization.id, group);
  }

  return Array.from(membershipsByClub.entries())
    .flatMap(([clubId, clubRoles]) => {
      const club = organizationsById.get(clubId);
      const federation = club?.parent_id
        ? organizationsById.get(club.parent_id)
        : null;
      if (!club || !federation) return [];

      return [{
        organizationId: club.id,
        clubName: club.name,
        federationId: federation.id,
        federationName: federation.name,
        roles: uniqueMembershipRoles(clubRoles),
        joinedAt: clubRoles
          .map((membership) => membership.created_at)
          .sort()[0],
        status: "active" as const,
      }];
    })
    .sort((left, right) => left.clubName.localeCompare(right.clubName, "de"));
}

/** Leitet nur die ueber aktive Vereine tatsaechlich waehlbaren Verbaende ab. */
export function buildEligibleFederations(
  clubMemberships: ClubMembership[],
): EligibleFederation[] {
  const clubsByFederation = new Map<string, EligibleFederation>();
  for (const membership of clubMemberships) {
    const entry = clubsByFederation.get(membership.federationId) || {
      id: membership.federationId,
      name: membership.federationName,
      qualifyingClubs: [],
    };
    entry.qualifyingClubs.push(membership.clubName);
    clubsByFederation.set(entry.id, entry);
  }
  return Array.from(clubsByFederation.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "de")
  );
}

/** Gemeinsame Laengen- und Pflichtfeldpruefung fuer den Profil-Update-Flow. */
export function validateProfileDetails(
  details: EditableProfileDetails,
): string | null {
  if (!details.firstName || !details.lastName) {
    return "Bitte gib Vor- und Nachname vollständig an.";
  }
  if (
    details.firstName.length > 80 ||
    details.lastName.length > 80 ||
    details.phone.length > 40 ||
    details.location.length > 120 ||
    details.bio.length > 1000 ||
    details.disciplines.length > 20 ||
    details.disciplines.some((discipline) =>
      !discipline || discipline.length > 60
    ) ||
    !Object.hasOwn(profileVisibilityLabels, details.visibility)
  ) {
    return "Bitte prüfe die markierten Angaben und Textlängen.";
  }
  return null;
}
