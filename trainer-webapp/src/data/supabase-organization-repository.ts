import type {
  AssignableProfile,
  ManageableFederalOrganization,
  OrganizationOverview,
  OrganizationRole,
  RoleAssignmentOption,
} from "@/domain/models";
import { createClient } from "@/lib/supabase/server";

interface OrganizationRow {
  id: string;
  parent_id: string | null;
  name: string;
  level: OrganizationOverview["level"];
  state_code: string | null;
  region_name: string | null;
  organization_memberships: Array<{
    role: OrganizationRole;
  }>;
}

interface AssignableProfileRow {
  id: string;
  display_name: string;
  email: string;
  account_type: string;
  created_at: string;
}

interface RoleAssignmentOptionRow {
  organization_id: string;
  role: OrganizationRole;
}

function isMissingRpcFunction(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    error.message?.toLowerCase().includes("schema cache") ||
    error.message?.toLowerCase().includes("could not find the function")
  );
}

/**
 * Lädt die für den aktuellen Nutzer sichtbare Organisationshierarchie.
 *
 * Welche Datensätze zurückkommen, entscheidet PostgreSQL über RLS. Die
 * Repository-Schicht wandelt lediglich Datenbanknamen in Fachtypen um.
 */
export async function getOrganizationOverview(): Promise<OrganizationOverview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(`
      id,
      parent_id,
      name,
      level,
      state_code,
      region_name,
      organization_memberships(role)
    `)
    .order("level")
    .order("name");

  if (error) {
    throw new Error(`Organisationen konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as OrganizationRow[]).map((organization) => {
    const roleCounts = organization.organization_memberships.reduce<
      Partial<Record<OrganizationRole, number>>
    >((counts, membership) => {
      counts[membership.role] = (counts[membership.role] || 0) + 1;
      return counts;
    }, {});

    return {
      id: organization.id,
      parentId: organization.parent_id,
      name: organization.name,
      level: organization.level,
      stateCode: organization.state_code,
      regionName: organization.region_name,
      memberCount: organization.organization_memberships.length,
      roleCounts,
    };
  });
}

/**
 * Ermittelt die Bundesverbände, in denen der aktuelle Nutzer Bundesvorsitz ist.
 *
 * Die Abfrage nutzt nur die eigene Mitgliedschaft. Die eigentliche
 * Schreibberechtigung wird beim Anlegen zusätzlich in PostgreSQL geprüft.
 */
export async function getManageableFederalOrganizations(): Promise<
  ManageableFederalOrganization[]
> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations!inner(id, name, level)")
    .eq("user_id", userId)
    .eq("role", "federal_chair")
    .eq("organizations.level", "federal");

  if (error) {
    throw new Error(
      `Berechtigungen konnten nicht geladen werden: ${error.message}`,
    );
  }

  return (data || []).flatMap((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;

    return organization
      ? [{ id: organization.id, name: organization.name }]
      : [];
  });
}

/**
 * Lädt registrierte Accounts, die für die Rollenvergabe auswählbar sind.
 *
 * Die Datenbankfunktion gibt nur dann Profile zurück, wenn der aktuelle Nutzer
 * eine organisatorische Verwaltungsrolle besitzt.
 */
export async function getAssignableProfiles(): Promise<AssignableProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_assignable_profiles");

  if (error) {
    if (isMissingRpcFunction(error)) {
      return [];
    }

    throw new Error(`Konten konnten nicht geladen werden: ${error.message}`);
  }

  return ((data || []) as AssignableProfileRow[]).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    email: profile.email,
    accountType: profile.account_type,
    createdAt: profile.created_at,
  }));
}

/**
 * Lädt die konkreten Rollenoptionen, die der aktuelle Nutzer vergeben darf.
 */
export async function getRoleAssignmentOptions(): Promise<RoleAssignmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_role_assignment_options");

  if (error) {
    if (isMissingRpcFunction(error)) {
      return [];
    }

    throw new Error(
      `Rollenoptionen konnten nicht geladen werden: ${error.message}`,
    );
  }

  return ((data || []) as RoleAssignmentOptionRow[]).map((option) => ({
    organizationId: option.organization_id,
    role: option.role as OrganizationRole,
  }));
}
