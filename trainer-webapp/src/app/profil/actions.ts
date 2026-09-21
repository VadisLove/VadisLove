"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseDisciplines,
  validateProfileDetails,
  type ProfileVisibility,
} from "@/domain/profile";
import { getAuthenticatedUserId } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  hasPasswordIdentity,
  validateNewPassword,
} from "@/domain/password-security";

export interface ProfileActionState {
  status: "idle" | "success" | "error";
  message: string;
  federationBecameInvalid?: boolean;
}

export interface PasswordActionState {
  status: "idle" | "code_sent" | "success" | "error";
  message: string;
  codeRequested?: boolean;
}

function databaseMessage(
  message: string,
  translations: Array<[string, string]>,
  fallback: string,
) {
  const normalized = message.toLowerCase();
  return (
    translations.find(([needle]) => normalized.includes(needle))?.[1] ||
    fallback
  );
}

/** Speichert ausschliesslich frei bearbeitbare Profildaten des eigenen Kontos. */
export async function updateProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const disciplines = parseDisciplines(String(formData.get("disciplines") || ""));
  const visibility = String(formData.get("visibility") || "") as ProfileVisibility;

  const validationError = validateProfileDetails({
    firstName,
    lastName,
    phone,
    location,
    bio,
    disciplines,
    visibility,
  });
  if (validationError) return { status: "error", message: validationError };

  const supabase = await createClient();
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return { status: "error", message: "Bitte melde dich erneut an." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      location: location || null,
      bio: bio || null,
      disciplines,
      visibility,
    })
    .eq("id", userId);

  if (error) {
    return {
      status: "error",
      message: "Dein Profil konnte nicht gespeichert werden. Bitte versuche es erneut.",
    };
  }

  revalidatePath("/profil");
  revalidatePath("/", "layout");
  return { status: "success", message: "Dein Profil wurde gespeichert." };
}

/**
 * Ändert das eigene Passwort nach Prüfung des aktuellen Passworts. Konten ohne
 * Passwort bestätigen den Vorgang stattdessen mit einem E-Mail-Einmalcode.
 */
export async function changeOwnPassword(
  previousState: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "error", message: "Bitte melde dich erneut an." };
  }

  const hasPassword = hasPasswordIdentity(user.identities);
  if (!user.email_confirmed_at) {
    return {
      status: "error",
      message:
        "Für dieses Konto ist keine bestätigte Login-E-Mail verfügbar. Verwende weiterhin deinen Anmeldeanbieter.",
    };
  }

  const intent = String(formData.get("intent") || "");
  const nonce = String(formData.get("nonce") || "").trim();

  if (!hasPassword && (intent === "request-code" || !nonce)) {
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      return {
        status: "error",
        codeRequested: previousState.codeRequested,
        message:
          error.status === 429
            ? "Bitte warte kurz, bevor du einen neuen Code anforderst."
            : "Der Bestätigungscode konnte nicht versendet werden. Bitte versuche es später erneut.",
      };
    }

    return {
      status: "code_sent",
      codeRequested: true,
      message: "Ein Bestätigungscode wurde an deine bestätigte Login-E-Mail gesendet.",
    };
  }

  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("passwordConfirmation") || "");
  const validationError = validateNewPassword(password, confirmation);
  if (validationError) {
    return {
      status: "error",
      codeRequested: previousState.codeRequested,
      message: validationError,
    };
  }

  const currentPassword = String(formData.get("currentPassword") || "");
  if (hasPassword && !currentPassword) {
    return {
      status: "error",
      message: "Bitte gib dein aktuelles Passwort ein.",
    };
  }

  const { error } = await supabase.auth.updateUser(
    hasPassword
      ? { password, current_password: currentPassword }
      : { password, nonce },
  );

  if (error) {
    const message =
      error.code === "weak_password"
        ? "Dieses Passwort erfüllt die Sicherheitsanforderungen noch nicht."
        : error.code === "reauthentication_not_valid" ||
            error.code === "invalid_credentials"
          ? "Das aktuelle Passwort oder der Bestätigungscode ist nicht gültig."
          : error.code === "same_password"
            ? "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden."
        : error.code === "reauthentication_needed"
              ? "Bitte bestätige die Änderung erneut."
              : "Das Passwort konnte nicht geändert werden. Bitte versuche es erneut.";
    return {
      status: "error",
      codeRequested: previousState.codeRequested,
      message,
    };
  }

  // Die aktuelle Sitzung bleibt nutzbar; alle anderen Refresh-Sitzungen werden
  // nach der sicherheitsrelevanten Änderung widerrufen.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    // Falls der gezielte Widerruf nicht bestätigt werden kann, beendet der
    // strengere Fallback alle Sitzungen statt alte Geräte angemeldet zu lassen.
    await supabase.auth.signOut({ scope: "global" });
    redirect(
      "/login?status=success&message=Passwort+ge%C3%A4ndert.+Bitte+melde+dich+neu+an.",
    );
  }

  return {
    status: "success",
    message: "Dein Passwort wurde geändert. Andere Sitzungen wurden beendet.",
  };
}

/** Verlaesst einen Verein ausschliesslich ueber die transaktionale Datenbankfunktion. */
export async function leaveClub(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const clubId = String(formData.get("clubId") || "").trim();
  if (!clubId) {
    return { status: "error", message: "Der Verein wurde nicht gefunden." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leave_club_membership", {
    p_club_id: clubId,
    p_confirmed: true,
  });

  if (error) {
    return {
      status: "error",
      message: databaseMessage(
        error.message,
        [
          [
            "successor must be assigned",
            "Du bist die letzte verantwortliche Person. Lege zuerst eine Nachfolge fest.",
          ],
          ["no active club membership", "Diese Mitgliedschaft ist nicht mehr aktiv."],
        ],
        "Der Vereinsaustritt konnte nicht durchgeführt werden.",
      ),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const federationBecameInvalid = Boolean(
    result?.federation_became_invalid,
  );
  revalidatePath("/profil");
  revalidatePath("/organisation");
  revalidatePath("/personen");
  revalidatePath("/", "layout");
  return {
    status: "success",
    federationBecameInvalid,
    message: federationBecameInvalid
      ? "Du hast den Verein verlassen. Dein bisheriger Startverband ist dadurch nicht mehr gültig – bitte wähle einen neuen berechtigten Verband."
      : "Du hast den Verein verlassen.",
  };
}

/** Setzt den Startverband; Eligibility und Eindeutigkeit prueft PostgreSQL. */
export async function changeActiveFederation(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const federationId = String(formData.get("federationId") || "").trim();
  if (!federationId) {
    return { status: "error", message: "Bitte wähle einen Verband aus." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_athlete_federation", {
    p_federation_id: federationId,
    p_confirmed: true,
  });

  if (error) {
    return {
      status: "error",
      message: databaseMessage(
        error.message,
        [
          [
            "not eligible",
            "Dieser Verband ist nicht mehr wählbar. Prüfe deine aktiven Vereinsmitgliedschaften.",
          ],
          [
            "only athlete",
            "Eine Startverbandszuordnung ist nur für Athleten vorgesehen.",
          ],
        ],
        "Der Startverband konnte nicht geändert werden.",
      ),
    };
  }

  revalidatePath("/profil");
  revalidatePath("/personen");
  revalidatePath("/", "layout");
  return { status: "success", message: "Dein Startverband wurde aktualisiert." };
}

/**
 * Plant die Loeschung und beendet danach global alle Refresh-Sitzungen.
 * Restriktive RLS-Policies sperren auch noch nicht abgelaufene Access Tokens.
 */
export async function scheduleAccountDeletion(formData: FormData) {
  const confirmation = String(formData.get("confirmation") || "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_account_deletion", {
    p_confirmation: confirmation,
  });

  if (error) {
    const message = databaseMessage(
      error.message,
      [
        [
          "successor must be assigned",
          "Die Löschung ist blockiert: Du bist letzte verantwortliche Person einer Organisation. Lege zuerst eine Nachfolge fest.",
        ],
        ["confirmation is invalid", "Bitte gib zur Bestätigung exakt „LÖSCHEN“ ein."],
      ],
      "Die Kontolöschung konnte nicht geplant werden.",
    );
    redirect(`/profil?deleteError=${encodeURIComponent(message)}#gefahrenbereich`);
  }

  // Standard-Scope "global": alle Refresh-Tokens des Kontos werden widerrufen.
  await supabase.auth.signOut();
  redirect(
    "/login?status=success&message=Dein+Profil+wurde+deaktiviert.+Du+kannst+es+30+Tage+lang+wiederherstellen.",
  );
}

/** Hebt eine geplante Loeschung innerhalb der Frist wieder auf. */
export async function restoreAccount() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_account");
  if (error) {
    redirect(
      `/konto-wiederherstellen?error=${encodeURIComponent(
        "Die Wiederherstellung ist nicht mehr möglich. Bitte wende dich an den Support.",
      )}`,
    );
  }
  revalidatePath("/", "layout");
  redirect("/profil?restored=1");
}
