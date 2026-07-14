import type {
  AssignableProfile,
  ManageableFederalOrganization,
  OrganizationOverview,
  OrganizationRole,
  RoleAssignmentOption,
} from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
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

interface OwnOrganizationMembershipRow {
  organization_id: string;
  role: OrganizationRole;
}

interface OwnPendingMembershipRequestRow {
  organization_id: string;
  requested_role: OrganizationRole;
}

export interface OrganizationMembershipStatus {
  organizationId: string;
  roles: OrganizationRole[];
  pendingRequestedRole: OrganizationRole | null;
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

  const organizations = ((data || []) as OrganizationRow[]).map((organization) => {
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

  // Die Datenbank liefert flache Datensätze. Für die Oberfläche wird daraus
  // eine stabile Tiefensortierung, sodass jeder Verein direkt nach seinem
  // Landesverband erscheint und nicht gesammelt am Listenende.
  const childrenByParent = new Map<string | null, OrganizationOverview[]>();
  for (const organization of organizations) {
    const siblings = childrenByParent.get(organization.parentId) || [];
    siblings.push(organization);
    childrenByParent.set(organization.parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) =>
      left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
    );
  }

  const sortedOrganizations: OrganizationOverview[] = [];
  const appendedOrganizationIds = new Set<string>();
  const appendWithChildren = (organization: OrganizationOverview) => {
    if (appendedOrganizationIds.has(organization.id)) {
      return;
    }

    appendedOrganizationIds.add(organization.id);
    sortedOrganizations.push(organization);
    for (const child of childrenByParent.get(organization.id) || []) {
      appendWithChildren(child);
    }
  };

  for (const rootOrganization of childrenByParent.get(null) || []) {
    appendWithChildren(rootOrganization);
  }

  // Verwaiste Alt-Datensätze bleiben sichtbar, auch wenn ihr parent_id nicht
  // mehr in der geladenen Ergebnismenge enthalten sein sollte.
  for (const organization of organizations) {
    if (!appendedOrganizationIds.has(organization.id)) {
      appendWithChildren(organization);
    }
  }

  return sortedOrganizations;
}

/**
 * Lädt ausschließlich die eigenen Rollen und offenen Beitrittsanfragen.
 * Die Organisationskarten können damit klar zwischen „Beitreten“,
 * „Anfrage ausstehend“ und einer vorhandenen Mitgliedschaft unterscheiden.
 */
export async function getOwnOrganizationMembershipStatuses(): Promise<
  OrganizationMembershipStatus[]
> {
  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);

  if (!userId) {
    return [];
  }

  const [membershipResult, requestResult] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", userId),
    supabase
      .from("membership_requests")
      .select("organization_id, requested_role")
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);

  if (membershipResult.error) {
    throw new Error(
      `Eigene Mitgliedschaften konnten nicht geladen werden: ${membershipResult.error.message}`,
    );
  }

  if (requestResult.error) {
    throw new Error(
      `Offene Beitrittsanfragen konnten nicht geladen werden: ${requestResult.error.message}`,
    );
  }

  const statuses = new Map<string, OrganizationMembershipStatus>();
  const ensureStatus = (organizationId: string) => {
    const existing = statuses.get(organizationId);
    if (existing) return existing;

    const created: OrganizationMembershipStatus = {
      organizationId,
      roles: [],
      pendingRequestedRole: null,
    };
    statuses.set(organizationId, created);
    return created;
  };

  for (const membership of (membershipResult.data || []) as OwnOrganizationMembershipRow[]) {
    const status = ensureStatus(membership.organization_id);
    if (!status.roles.includes(membership.role)) {
      status.roles.push(membership.role);
    }
  }

  for (const request of (requestResult.data || []) as OwnPendingMembershipRequestRow[]) {
    ensureStatus(request.organization_id).pendingRequestedRole =
      request.requested_role;
  }

  return Array.from(statuses.values());
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
  const userId = await getAuthenticatedUserId(supabase);

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
