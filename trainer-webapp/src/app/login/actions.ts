"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

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
  const requestedPath = String(formData.get("next") || "/");
  const nextPath = requestedPath.startsWith("/") ? requestedPath : "/";

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
 * Erstellt ein neues Auth-Konto und übergibt ausschließlich beschreibende
 * Profildaten. Berechtigungen werden nicht aus diesen Metadaten abgeleitet.
 */
export async function register(formData: FormData) {
  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") || "");
  const accountType = String(formData.get("accountType") || "");

  if (!displayName || !email || !password || !accountTypes.has(accountType)) {
    redirect(loginUrl("Bitte alle Felder vollständig ausfüllen.", "/", "register"));
  }

  if (password.length < 8) {
    redirect(loginUrl("Das Passwort muss mindestens 8 Zeichen lang sein.", "/", "register"));
  }

  if (password !== passwordConfirmation) {
    redirect(loginUrl("Die eingegebenen Passwörter stimmen nicht überein.", "/", "register"));
  }

  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") || "http://localhost:3000";

  const {
    data: { session },
    error,
  } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
      data: {
        display_name: displayName,
        account_type: accountType,
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

  if (session) {
    redirect("/");
  }

  redirect(
    loginUrl(
      "Konto erstellt. Bitte bestätige jetzt deine E-Mail-Adresse.",
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
