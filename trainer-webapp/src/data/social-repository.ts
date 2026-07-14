import type {
  GroupInvitation,
  GroupMemberRole,
  InboxOverview,
  JoinableOrganization,
  MembershipInboxRequest,
  OrganizationLevel,
  OrganizationRole,
  RelationshipRequest,
  RelationshipType,
  RequestStatus,
  SocialGroup,
} from "@/domain/models";
import { getPeopleDirectory } from "@/data/supabase-people-repository";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

interface RelationshipRequestRow {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  relationship_type: RelationshipType;
  status: RequestStatus;
  message: string;
  created_at: string;
}

interface GroupInvitationRow {
  id: string;
  group_id: string;
  invited_by: string;
  invited_user_id: string;
  status: RequestStatus;
  created_at: string;
  social_groups: { name: string } | Array<{ name: string }> | null;
}

interface MembershipRequestRow {
  id: string;
  organization_id: string;
  user_id: string;
  requested_role: OrganizationRole;
  status: RequestStatus;
  note: string;
  created_at: string;
  organizations: { name: string } | Array<{ name: string }> | null;
}

interface GroupMembershipRow {
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  social_groups:
    | { id: string; name: string; description: string }
    | Array<{ id: string; name: string; description: string }>
    | null;
}

function isMissingSocialSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message?.toLowerCase().includes("schema cache") ||
    error.message?.toLowerCase().includes("does not exist")
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Laedt alle Postfachbereiche in wenigen gebuendelten Abfragen.
 *
 * Namen kommen aus dem datenschutzfreundlichen Verzeichnis-RPC. So muessen
 * Profile fuer noch unbestaetigte Anfragen nicht direkt per RLS lesbar sein.
 */
export async function getInboxOverview(): Promise<InboxOverview> {
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!currentUserId) {
    return {
      relationshipRequests: [],
      groupInvitations: [],
      membershipRequests: [],
      groups: [],
      people: [],
      organizations: [],
    };
  }

  const [
    people,
    relationshipResult,
    groupInvitationResult,
    membershipRequestResult,
    groupMembershipResult,
    organizationResult,
  ] = await Promise.all([
    getPeopleDirectory(),
    supabase
      .from("relationship_requests")
      .select(
        "id, sender_user_id, recipient_user_id, relationship_type, status, message, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("group_invitations")
      .select(
        "id, group_id, invited_by, invited_user_id, status, created_at, social_groups(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("membership_requests")
      .select(
        "id, organization_id, user_id, requested_role, status, note, created_at, organizations(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("group_memberships")
      .select("group_id, user_id, role, social_groups(id, name, description)"),
    supabase
      .from("organizations")
      .select("id, name, level")
      .order("name"),
  ]);

  const socialErrors = [
    relationshipResult.error,
    groupInvitationResult.error,
    groupMembershipResult.error,
  ];
  const unexpectedSocialError = socialErrors.find(
    (error) => error && !isMissingSocialSchema(error),
  );

  if (unexpectedSocialError) {
    throw new Error(`Postfach konnte nicht geladen werden: ${unexpectedSocialError.message}`);
  }

  if (membershipRequestResult.error) {
    throw new Error(
      `Organisationsanfragen konnten nicht geladen werden: ${membershipRequestResult.error.message}`,
    );
  }

  if (organizationResult.error) {
    throw new Error(
      `Organisationen konnten nicht geladen werden: ${organizationResult.error.message}`,
    );
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const personSummary = (personId: string) => {
    const person = peopleById.get(personId);
    const name = person?.name || "Trainer-Hub Nutzer";

    return {
      id: personId,
      name,
      initials: person?.initials || initials(name) || "TH",
      accountType: person?.accountType,
    };
  };

  const relationshipRequests: RelationshipRequest[] = (
    (relationshipResult.data || []) as RelationshipRequestRow[]
  ).map((request) => {
    const incoming = request.recipient_user_id === currentUserId;
    return {
      id: request.id,
      senderUserId: request.sender_user_id,
      recipientUserId: request.recipient_user_id,
      relationshipType: request.relationship_type,
      status: request.status,
      message: request.message,
      createdAt: request.created_at,
      otherPerson: personSummary(
        incoming ? request.sender_user_id : request.recipient_user_id,
      ),
      direction: incoming ? "incoming" : "outgoing",
    };
  });

  const groupInvitations: GroupInvitation[] = (
    (groupInvitationResult.data || []) as unknown as GroupInvitationRow[]
  ).map((invitation) => {
    const group = Array.isArray(invitation.social_groups)
      ? invitation.social_groups[0]
      : invitation.social_groups;
    const incoming = invitation.invited_user_id === currentUserId;

    return {
      id: invitation.id,
      groupId: invitation.group_id,
      groupName: group?.name || "Gruppe",
      invitedBy: invitation.invited_by,
      invitedUserId: invitation.invited_user_id,
      status: invitation.status,
      createdAt: invitation.created_at,
      actorName: incoming
        ? personSummary(invitation.invited_by).name
        : personSummary(invitation.invited_user_id).name,
      direction: incoming ? "incoming" : "outgoing",
    };
  });

  const membershipRequests: MembershipInboxRequest[] = (
    (membershipRequestResult.data || []) as unknown as MembershipRequestRow[]
  ).map((request) => {
    const organization = Array.isArray(request.organizations)
      ? request.organizations[0]
      : request.organizations;
    const outgoing = request.user_id === currentUserId;

    return {
      id: request.id,
      organizationId: request.organization_id,
      organizationName: organization?.name || "Organisation",
      userId: request.user_id,
      userName: outgoing ? "Du" : personSummary(request.user_id).name,
      requestedRole: request.requested_role,
      status: request.status,
      note: request.note,
      createdAt: request.created_at,
      direction: outgoing ? "outgoing" : "incoming",
    };
  });

  const membershipRows = (
    (groupMembershipResult.data || []) as unknown as GroupMembershipRow[]
  );
  const groupsById = new Map<string, SocialGroup>();

  for (const membership of membershipRows) {
    const group = Array.isArray(membership.social_groups)
      ? membership.social_groups[0]
      : membership.social_groups;
    if (!group) continue;

    const existing = groupsById.get(group.id);
    groupsById.set(group.id, {
      id: group.id,
      name: group.name,
      description: group.description,
      role:
        membership.user_id === currentUserId
          ? membership.role
          : existing?.role || "member",
      memberCount: (existing?.memberCount || 0) + 1,
    });
  }

  const organizations = (organizationResult.data || []).map(
    (organization): JoinableOrganization => ({
      id: organization.id,
      name: organization.name,
      level: organization.level as OrganizationLevel,
    }),
  );

  return {
    relationshipRequests,
    groupInvitations,
    membershipRequests,
    groups: Array.from(groupsById.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "de"),
    ),
    people,
    organizations,
  };
}
