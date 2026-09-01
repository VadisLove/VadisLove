import type { AccountType } from "@/domain/current-user";
import type { OrganizationRole } from "@/domain/models";
import type {
  FederationAffiliation,
  ProfileOverview,
  ProfileVisibility,
} from "@/domain/profile";
import {
  buildClubMemberships,
  buildEligibleFederations,
} from "@/domain/profile";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

interface MembershipRow {
  organization_id: string;
  role: OrganizationRole;
  created_at: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  level: "federal" | "state" | "club";
  parent_id: string | null;
}

interface AffiliationRow {
  id: string;
  federation_id: string;
  active: boolean;
  selected_at: string;
  invalidated_at: string | null;
  invalidation_reason: string | null;
}

interface OwnProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  bio: string | null;
  disciplines: string[];
  visibility: ProfileVisibility;
  avatar_path: string | null;
  account_type: AccountType;
}

function uniqueRoles(memberships: MembershipRow[]) {
  return Array.from(new Set(memberships.map((membership) => membership.role)));
}

/** Laedt das eigene Profil. Organisationsrollen bleiben ausschliesslich lesbar. */
export async function getOwnProfileOverview(): Promise<ProfileOverview> {
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) throw new Error("Bitte erneut anmelden.");

  const [profileResult, membershipsResult, affiliationsResult] = await Promise.all([
    // Kontakt- und Detailfelder sind absichtlich nicht mehr direkt ueber die
    // profiles-Tabelle lesbar. Die RPC bindet die Ausgabe fest an auth.uid().
    supabase
      .rpc("get_own_profile")
      .single(),
    supabase
      .from("organization_memberships")
      .select("organization_id, role, created_at")
      .eq("user_id", userId),
    supabase
      .from("athlete_federation_affiliations")
      .select(
        "id, federation_id, active, selected_at, invalidated_at, invalidation_reason",
      )
      .eq("athlete_id", userId)
      .order("selected_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    throw new Error(`Profil konnte nicht geladen werden: ${profileResult.error.message}`);
  }
  if (membershipsResult.error) {
    throw new Error(
      `Mitgliedschaften konnten nicht geladen werden: ${membershipsResult.error.message}`,
    );
  }
  if (affiliationsResult.error) {
    throw new Error(
      `Startverband konnte nicht geladen werden: ${affiliationsResult.error.message}`,
    );
  }

  const memberships = (membershipsResult.data || []) as MembershipRow[];
  const affiliations = (affiliationsResult.data || []) as AffiliationRow[];
  const organizationIds = Array.from(
    new Set([
      ...memberships.map((membership) => membership.organization_id),
      ...affiliations.map((affiliation) => affiliation.federation_id),
    ]),
  );

  let organizations: OrganizationRow[] = [];
  if (organizationIds.length > 0) {
    const directOrganizations = await supabase
      .from("organizations")
      .select("id, name, level, parent_id")
      .in("id", organizationIds);
    if (directOrganizations.error) {
      throw new Error(
        `Organisationen konnten nicht geladen werden: ${directOrganizations.error.message}`,
      );
    }
    organizations = (directOrganizations.data || []) as OrganizationRow[];

    const parentIds = Array.from(
      new Set(organizations.flatMap((organization) =>
        organization.parent_id ? [organization.parent_id] : []
      )),
    ).filter((id) => !organizationIds.includes(id));
    if (parentIds.length > 0) {
      const parents = await supabase
        .from("organizations")
        .select("id, name, level, parent_id")
        .in("id", parentIds);
      if (parents.error) {
        throw new Error(`Verbände konnten nicht geladen werden: ${parents.error.message}`);
      }
      organizations.push(...((parents.data || []) as OrganizationRow[]));
    }
  }

  const profile = profileResult.data as OwnProfileRow;
  const clubMemberships = buildClubMemberships(memberships, organizations);
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const toAffiliation = (
    affiliation: AffiliationRow | undefined,
  ): FederationAffiliation | null => {
    if (!affiliation) return null;
    return {
      id: affiliation.id,
      federationId: affiliation.federation_id,
      federationName:
        organizationsById.get(affiliation.federation_id)?.name ||
        "Unbekannter Verband",
      active: affiliation.active,
      selectedAt: affiliation.selected_at,
      invalidatedAt: affiliation.invalidated_at,
      invalidationReason: affiliation.invalidation_reason,
    };
  };

  let avatarUrl: string | null = null;
  if (profile.avatar_path) {
    const { data } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(profile.avatar_path, 60 * 60);
    avatarUrl = data?.signedUrl || null;
  }

  return {
    id: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    displayName: profile.display_name,
    email: profile.email,
    phone: profile.phone || "",
    location: profile.location || "",
    bio: profile.bio || "",
    disciplines: profile.disciplines || [],
    visibility: profile.visibility as ProfileVisibility,
    avatarPath: profile.avatar_path,
    avatarUrl,
    accountType: profile.account_type as AccountType,
    organizationRoles: uniqueRoles(memberships),
    clubMemberships,
    eligibleFederations: buildEligibleFederations(clubMemberships),
    activeFederation: toAffiliation(
      affiliations.find((affiliation) => affiliation.active),
    ),
    invalidFederation: toAffiliation(
      affiliations.find((affiliation) => Boolean(affiliation.invalidated_at)),
    ),
  };
}
