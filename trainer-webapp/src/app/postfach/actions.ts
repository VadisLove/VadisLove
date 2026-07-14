"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationRole, RequestStatus } from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface InboxActionState {
  status: "idle" | "success" | "error";
  message: string;
}

const responseStatuses = new Set<RequestStatus>(["approved", "rejected"]);
const selfRequestRoles = new Set<OrganizationRole>([
  "federal_chair",
  "specialist",
  "federal_trainer",
  "state_trainer",
  "athlete",
  "guardian",
  "club_trainer",
  "club_board",
  "medical",
]);

function refreshInbox() {
  revalidatePath("/postfach");
  revalidatePath("/personen");
  revalidatePath("/kalender");
  revalidatePath("/", "layout");
}

/** Nimmt eine Kontaktanfrage an oder lehnt sie ab. */
export async function respondRelationshipRequest(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const requestId = String(formData.get("requestId") || "");
  const status = String(formData.get("status") || "") as RequestStatus;
  if (!requestId || !responseStatuses.has(status)) {
    return { status: "error", message: "Ungültige Anfrage." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { error } = await supabase
    .from("relationship_requests")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("recipient_user_id", currentUserId)
    .eq("status", "pending");

  if (error) return { status: "error", message: "Die Anfrage konnte nicht beantwortet werden." };
  refreshInbox();
  return { status: "success", message: status === "approved" ? "Anfrage angenommen." : "Anfrage abgelehnt." };
}

/** Zieht eine selbst versendete Kontaktanfrage zurück. */
export async function withdrawRelationshipRequest(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const requestId = String(formData.get("requestId") || "");
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!requestId || !currentUserId) return { status: "error", message: "Ungültige Anfrage." };

  const { error } = await supabase
    .from("relationship_requests")
    .update({ status: "withdrawn" })
    .eq("id", requestId)
    .eq("sender_user_id", currentUserId)
    .eq("status", "pending");

  if (error) return { status: "error", message: "Die Anfrage konnte nicht zurückgezogen werden." };
  refreshInbox();
  return { status: "success", message: "Anfrage zurückgezogen." };
}

/** Erstellt eine Gruppe; der Datenbank-Trigger setzt den Ersteller als Besitzer. */
export async function createSocialGroup(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (name.length < 2 || name.length > 80 || description.length > 500) {
    return { status: "error", message: "Bitte einen gültigen Gruppennamen eingeben." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId) return { status: "error", message: "Bitte erneut anmelden." };

  const { error } = await supabase.from("social_groups").insert({
    name,
    description,
    created_by: currentUserId,
  });

  if (error) return { status: "error", message: "Die Gruppe konnte nicht erstellt werden." };
  refreshInbox();
  return { status: "success", message: `Gruppe „${name}“ wurde erstellt.` };
}

/** Laedt eine registrierte Person in eine selbst verwaltete Gruppe ein. */
export async function inviteToGroup(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const groupId = String(formData.get("groupId") || "");
  const invitedUserId = String(formData.get("invitedUserId") || "");
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!groupId || !invitedUserId || !currentUserId || invitedUserId === currentUserId) {
    return { status: "error", message: "Bitte Gruppe und Person auswählen." };
  }

  const { error } = await supabase.from("group_invitations").insert({
    group_id: groupId,
    invited_by: currentUserId,
    invited_user_id: invitedUserId,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "Diese Einladung ist bereits offen." : "Die Einladung konnte nicht gesendet werden.",
    };
  }

  refreshInbox();
  return { status: "success", message: "Gruppeneinladung wurde gesendet." };
}

/** Beantwortet eine Gruppeneinladung. */
export async function respondGroupInvitation(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const invitationId = String(formData.get("invitationId") || "");
  const status = String(formData.get("status") || "") as RequestStatus;
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!invitationId || !currentUserId || !responseStatuses.has(status)) {
    return { status: "error", message: "Ungültige Einladung." };
  }

  const { error } = await supabase
    .from("group_invitations")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("invited_user_id", currentUserId)
    .eq("status", "pending");

  if (error) return { status: "error", message: "Die Einladung konnte nicht beantwortet werden." };
  refreshInbox();
  return { status: "success", message: status === "approved" ? "Gruppe beigetreten." : "Einladung abgelehnt." };
}

/** Stellt eine Beitrittsanfrage an Verein oder Verband. */
export async function createMembershipRequest(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const organizationId = String(formData.get("organizationId") || "");
  const requestedRole = String(formData.get("requestedRole") || "") as OrganizationRole;
  const note = String(formData.get("note") || "").trim();
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!organizationId || !currentUserId || !selfRequestRoles.has(requestedRole)) {
    return { status: "error", message: "Bitte Organisation und Rolle auswählen." };
  }

  const { error } = await supabase.from("membership_requests").insert({
    organization_id: organizationId,
    user_id: currentUserId,
    requested_role: requestedRole,
    note: note.slice(0, 500),
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "Für diese Organisation ist bereits eine Anfrage offen." : "Die Beitrittsanfrage konnte nicht gesendet werden.",
    };
  }

  refreshInbox();
  return { status: "success", message: "Beitrittsanfrage wurde gesendet." };
}

/** Vereins- und Verbandsverantwortliche bestaetigen oder verwerfen Beitritte. */
export async function reviewMembershipRequest(
  _previousState: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const requestId = String(formData.get("requestId") || "");
  const status = String(formData.get("status") || "") as RequestStatus;
  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);

  if (!requestId || !currentUserId || !responseStatuses.has(status)) {
    return { status: "error", message: "Ungültige Beitrittsanfrage." };
  }

  const { error } = await supabase
    .from("membership_requests")
    .update({
      status,
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) return { status: "error", message: "Die Beitrittsanfrage konnte nicht bearbeitet werden." };
  refreshInbox();
  return { status: "success", message: status === "approved" ? "Beitritt bestätigt." : "Beitritt abgelehnt." };
}
