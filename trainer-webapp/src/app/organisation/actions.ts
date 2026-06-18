"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationRole } from "@/domain/models";
import { createClient } from "@/lib/supabase/server";

export interface CreateStateOrganizationState {
  status: "idle" | "success" | "error";
  message: string;
}

export interface AssignRoleState {
  status: "idle" | "success" | "error";
  message: string;
}

const initialErrorState: CreateStateOrganizationState = {
  status: "error",
  message: "Bitte alle Felder vollständig ausfüllen.",
};

const assignableRoles = new Set<OrganizationRole>([
  "federal_chair",
  "specialist",
  "federal_trainer",
  "state_trainer",
  "club_trainer",
  "club_board",
  "athlete",
  "guardian",
  "medical",
]);

/**
 * Legt Landesverband und Fachwart über eine atomare Datenbankfunktion an.
 *
 * Die Datenbank prüft die Bundesvorsitz-Rolle erneut. Dadurch kann die Aktion
 * nicht durch manipulierte Formularwerte für fremde Verbände verwendet werden.
 */
export async function createStateOrganization(
  _previousState: CreateStateOrganizationState,
  formData: FormData,
): Promise<CreateStateOrganizationState> {
  const parentOrganizationId = String(
    formData.get("parentOrganizationId") || "",
  ).trim();
  const name = String(formData.get("name") || "").trim();
  const stateCode = String(formData.get("stateCode") || "").trim();
  const specialistEmail = String(formData.get("specialistEmail") || "")
    .trim()
    .toLowerCase();

  if (
    !parentOrganizationId ||
    !name ||
    stateCode.length !== 2 ||
    !specialistEmail
  ) {
    return initialErrorState;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "create_state_organization_with_specialist",
    {
      parent_organization_id: parentOrganizationId,
      organization_name: name,
      organization_state_code: stateCode,
      specialist_email: specialistEmail,
    },
  );

  if (error) {
    const knownMessages: Array<[string, string]> = [
      [
        "specialist profile was not found",
        "Für diese E-Mail wurde kein passendes Verbandskonto gefunden.",
      ],
      [
        "state organization already exists",
        "Für dieses Bundesland besteht bereits ein Landesverband.",
      ],
      [
        "not allowed to create",
        "Du bist nicht berechtigt, für diesen Bundesverband Landesverbände anzulegen.",
      ],
    ];
    const translatedMessage = knownMessages.find(([databaseMessage]) =>
      error.message.toLowerCase().includes(databaseMessage),
    )?.[1];

    return {
      status: "error",
      message:
        translatedMessage ||
        "Der Landesverband konnte nicht angelegt werden. Bitte Eingaben prüfen.",
    };
  }

  revalidatePath("/organisation");

  return {
    status: "success",
    message: "Landesverband und Fachwart wurden erfolgreich angelegt.",
  };
}

/**
 * Vergibt eine Mitgliedschaftsrolle an einen registrierten Account.
 *
 * Diese Action validiert nur offensichtliche Formularfehler. Ob die aktuelle
 * Person genau diese Rolle in genau dieser Organisation vergeben darf, prüft
 * PostgreSQL anschließend über die RLS-Policy der Mitgliedschaftstabelle.
 */
export async function assignOrganizationRole(
  _previousState: AssignRoleState,
  formData: FormData,
): Promise<AssignRoleState> {
  const userId = String(formData.get("userId") || "").trim();
  const organizationId = String(formData.get("organizationId") || "").trim();
  const role = String(formData.get("role") || "").trim() as OrganizationRole;

  if (!userId || !organizationId || !assignableRoles.has(role)) {
    return {
      status: "error",
      message: "Bitte Konto, Organisation und Rolle auswählen.",
    };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const actorId = claimsData?.claims.sub;

  if (!actorId) {
    return {
      status: "error",
      message: "Bitte melde dich erneut an, bevor du Rollen vergibst.",
    };
  }

  const { error } = await supabase.from("organization_memberships").insert({
    organization_id: organizationId,
    user_id: userId,
    role,
    assigned_by: actorId,
  });

  if (error) {
    const duplicateMembership = error.code === "23505";
    return {
      status: "error",
      message: duplicateMembership
        ? "Diese Rolle ist für dieses Konto bereits vergeben."
        : "Die Rolle konnte nicht vergeben werden. Bitte Berechtigung und Organisation prüfen.",
    };
  }

  revalidatePath("/organisation");
  revalidatePath("/personen");

  return {
    status: "success",
    message: "Die Rolle wurde vergeben.",
  };
}
