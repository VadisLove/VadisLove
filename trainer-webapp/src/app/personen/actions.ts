"use server";

import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  getAllowedInvitationRoles,
  isInvitationRole,
  type InvitationRole,
} from "@/domain/invitation-permissions";
import type { OrganizationRole } from "@/domain/models";
import type { RelationshipType } from "@/domain/models";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface InvitePersonState {
  status: "idle" | "success" | "error";
  message: string;
  inviteLink?: string;
}

export interface RelationshipActionState {
  status: "idle" | "success" | "error";
  message: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildInviteLink(origin: string, token: string) {
  const inviteUrl = new URL("/einladung", origin);
  inviteUrl.searchParams.set("token", token);
  return inviteUrl.toString();
}

/**
 * Legt eine Konto-Einladung an. Die UI prüft vorab verfügbare Rollen, aber die
 * eigentliche Autorisierung passiert zusätzlich über RLS in PostgreSQL.
 */
export async function invitePerson(
  _previousState: InvitePersonState,
  formData: FormData,
): Promise<InvitePersonState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const targetRole = String(formData.get("targetRole") || "");

  if (!emailPattern.test(email)) {
    return { status: "error", message: "Bitte eine gültige E-Mail-Adresse eingeben." };
  }

  if (!isInvitationRole(targetRole)) {
    return { status: "error", message: "Bitte eine gültige Einladungsrolle wählen." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase ist noch nicht konfiguriert. Die Einladung wurde nicht gespeichert.",
    };
  }

  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);

  if (!userId) {
    return {
      status: "error",
      message: "Bitte melde dich an, bevor du Personen einlädst.",
    };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("user_id", userId);

  if (membershipsError) {
    return {
      status: "error",
      message: "Deine Einladungsrechte konnten nicht geprüft werden.",
    };
  }

  const allowedRoles = getAllowedInvitationRoles(
    (memberships || []).map((membership) => membership.role as OrganizationRole),
  );

  if (!allowedRoles.includes(targetRole as InvitationRole)) {
    return {
      status: "error",
      message: "Für diese Rolle hast du keine Einladungsberechtigung.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") || "http://localhost:3000";

  const { error } = await supabase.from("account_invitations").insert({
    email,
    target_role: targetRole,
    invited_by: userId,
    token_hash: hashInvitationToken(token),
  });

  if (error) {
    const duplicatePendingInvite = error.code === "23505";
    return {
      status: "error",
      message: duplicatePendingInvite
        ? "Für diese E-Mail und Rolle gibt es bereits eine offene Einladung."
        : "Die Einladung konnte nicht gespeichert werden.",
    };
  }

  revalidatePath("/personen");

  return {
    status: "success",
    message: `Einladung an ${email} wurde erstellt.`,
    inviteLink: buildInviteLink(origin, token),
  };
}

const relationshipTypes = new Set<RelationshipType>([
  "friend",
  "trainer_athlete",
  "guardian",
]);

/**
 * Verschickt eine soziale oder fachliche Anfrage an ein registriertes Konto.
 *
 * Kontotypen werden fuer schnelles UI-Feedback vorgeprueft. Die verbindliche
 * Rollenpruefung erfolgt zusaetzlich im Datenbank-Trigger und kann daher nicht
 * durch manipulierte Formulardaten umgangen werden.
 */
export async function sendRelationshipRequest(
  _previousState: RelationshipActionState,
  formData: FormData,
): Promise<RelationshipActionState> {
  const recipientUserId = String(formData.get("recipientUserId") || "").trim();
  const recipientAccountType = String(formData.get("recipientAccountType") || "");
  const relationshipType = String(
    formData.get("relationshipType") || "",
  ) as RelationshipType;

  if (!recipientUserId || !relationshipTypes.has(relationshipType)) {
    return { status: "error", message: "Die Anfrage ist unvollständig." };
  }

  const supabase = await createClient();
  const currentUserId = await getAuthenticatedUserId(supabase);
  if (!currentUserId || currentUserId === recipientUserId) {
    return { status: "error", message: "Die Anfrage kann nicht gesendet werden." };
  }

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", currentUserId)
    .maybeSingle();
  const ownAccountType = ownProfile?.account_type;

  const values: Record<string, string> = {
    sender_user_id: currentUserId,
    recipient_user_id: recipientUserId,
    relationship_type: relationshipType,
  };

  if (relationshipType === "trainer_athlete") {
    if (ownAccountType === "trainer" && recipientAccountType === "athlete") {
      values.trainer_user_id = currentUserId;
      values.athlete_user_id = recipientUserId;
    } else if (ownAccountType === "athlete" && recipientAccountType === "trainer") {
      values.trainer_user_id = recipientUserId;
      values.athlete_user_id = currentUserId;
    } else {
      return {
        status: "error",
        message: "Diese Verbindung ist nur zwischen Trainer und Athlet möglich.",
      };
    }
  }

  if (relationshipType === "guardian") {
    if (ownAccountType === "guardian" && recipientAccountType === "athlete") {
      values.guardian_user_id = currentUserId;
      values.athlete_user_id = recipientUserId;
    } else if (ownAccountType === "athlete" && recipientAccountType === "guardian") {
      values.guardian_user_id = recipientUserId;
      values.athlete_user_id = currentUserId;
    } else {
      return {
        status: "error",
        message: "Eine Elternverknüpfung benötigt ein Eltern- und ein Athletenkonto.",
      };
    }
  }

  const { error } = await supabase.from("relationship_requests").insert(values);

  if (error) {
    return {
      status: "error",
      message:
        error.code === "23505"
          ? "Zwischen euch gibt es bereits eine offene Anfrage."
          : "Die Anfrage konnte nicht gesendet werden.",
    };
  }

  revalidatePath("/personen");
  revalidatePath("/postfach");
  revalidatePath("/", "layout");

  return { status: "success", message: "Anfrage wurde gesendet." };
}
