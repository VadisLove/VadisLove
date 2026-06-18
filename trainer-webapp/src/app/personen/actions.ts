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
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface InvitePersonState {
  status: "idle" | "success" | "error";
  message: string;
  inviteLink?: string;
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

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
