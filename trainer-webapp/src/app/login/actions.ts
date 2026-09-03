"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSafeRedirectPath } from "@/lib/safe-redirect-path";
import { createClient } from "@/lib/supabase/server";
import { evaluateRegistrationAge, localIsoDate } from "@/domain/registration-age";
import { issueGuardianApprovalEmail } from "@/lib/guardian-approval-email";
import { legalDocumentVersions } from "@/lib/legal-documents";

const accountTypes = new Set([
  "athlete",
  "trainer",
  "medical",
  "guardian",
  "organization_staff",
]);

function loginUrl(
  message: string,
  nextPath: string,
  mode: "login" | "register" = "login",
  status: "error" | "success" = "error",
) {
  const params = new URLSearchParams({ message, next: nextPath, mode, status });
  return `/login?${params.toString()}`;
}

/**
 * Meldet einen bestehenden Supabase-Nutzer mit E-Mail und Passwort an.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const nextPath = getSafeRedirectPath(formData.get("next"));

  if (!email || !password) {
    redirect(loginUrl("Bitte E-Mail und Passwort eingeben.", nextPath));
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    redirect(loginUrl("Supabase ist noch nicht vollständig konfiguriert.", nextPath));
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(loginUrl("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.", nextPath));
  }

  redirect(nextPath);
}

/**
 * Erstellt ein Auth-Konto. Einmalige Registrierungsangaben werden im Trigger
 * geprüft und in geschützte Tabellen übernommen; spätere Metadatenänderungen
 * verändern weder Altersstatus noch Freigabe oder fachliche Berechtigungen.
 */
export async function register(formData: FormData) {
  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") || "");
  const accountType = String(formData.get("accountType") || "");
  const organizationId = String(formData.get("organizationId") || "");
  const birthDate = String(formData.get("birthDate") || "");
  const guardianEmail = String(formData.get("guardianEmail") || "").trim().toLowerCase();
  const legalAccepted = String(formData.get("legalAccepted") || "") === "true";
  const ageResult = evaluateRegistrationAge(birthDate, localIsoDate());
  const guardianEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail);

  if (
    !displayName ||
    !email ||
    !password ||
    !accountTypes.has(accountType) ||
    !organizationId ||
    !ageResult ||
    !legalAccepted
  ) {
    redirect(loginUrl("Bitte alle Felder vollständig ausfüllen.", "/", "register"));
  }

  if (
    ageResult.requiresGuardianApproval &&
    (!guardianEmailIsValid || guardianEmail === email.toLowerCase())
  ) {
    redirect(
      loginUrl(
        "Für Minderjährige wird eine andere E-Mail-Adresse der erziehungsberechtigten Person benötigt.",
        "/",
        "register",
      ),
    );
  }

  if (password.length < 8) {
    redirect(loginUrl("Das Passwort muss mindestens 8 Zeichen lang sein.", "/", "register"));
  }

  if (password !== passwordConfirmation) {
    redirect(loginUrl("Die eingegebenen Passwörter stimmen nicht überein.", "/", "register"));
  }

  const supabase = await createClient();
  const { data: registrationOrganizations, error: organizationsError } =
    await supabase.rpc("get_registration_organizations");
  const selectedOrganization = registrationOrganizations?.find(
    (organization: { id: string }) => organization.id === organizationId,
  );
  const expectedLevel = accountType === "organization_staff" ? "state" : "club";

  // Die Auswahl wird vor dem Sign-up und erneut im Datenbank-Trigger geprüft.
  // Dadurch kann ein manipuliertes Formular keine unpassende Rolle erzeugen.
  if (organizationsError || selectedOrganization?.level !== expectedLevel) {
    redirect(
      loginUrl(
        accountType === "organization_staff"
          ? "Bitte einen gültigen Landesverband auswählen."
          : "Bitte einen gültigen Verein auswählen.",
        "/",
        "register",
      ),
    );
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") || "http://localhost:3000";
  const {
    data: { session, user },
    error,
  } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
      data: {
        display_name: displayName,
        account_type: accountType,
        registration_organization_id: organizationId,
        birth_date: birthDate,
        guardian_email: ageResult.requiresGuardianApproval ? guardianEmail : "",
        legal_terms_accepted: true,
        terms_version: legalDocumentVersions.terms,
        privacy_version: legalDocumentVersions.privacy,
      },
    },
  });

  if (error) {
    redirect(
      loginUrl(
        "Registrierung fehlgeschlagen. Bitte Eingaben prüfen oder später erneut versuchen.",
        "/",
        "register",
      ),
    );
  }

  let guardianEmailSent = true;
  if (ageResult.requiresGuardianApproval && user && user.identities?.length) {
    const emailResult = await issueGuardianApprovalEmail({
      minorUserId: user.id,
      requestOrigin: origin,
    });
    guardianEmailSent = emailResult.sent;
  }

  if (session) {
    redirect(
      ageResult.requiresGuardianApproval
        ? `/freigabe-ausstehend?mail=${guardianEmailSent ? "sent" : "failed"}`
        : "/",
    );
  }

  redirect(
    loginUrl(
      ageResult.requiresGuardianApproval
        ? guardianEmailSent
          ? "Konto erstellt. Bitte bestätige deine E-Mail-Adresse. Die Elternfreigabe wurde separat versendet."
          : "Konto erstellt. Bitte bestätige deine E-Mail-Adresse. Die Elternfreigabe-Mail konnte noch nicht versendet werden und kann danach erneut angefordert werden."
        : "Konto erstellt. Bitte bestätige jetzt deine E-Mail-Adresse.",
      "/",
      "login",
      "success",
    ),
  );
}

/**
 * Beendet die aktuelle Sitzung und führt zurück zum Login.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
