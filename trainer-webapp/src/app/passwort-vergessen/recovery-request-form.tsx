"use client";

import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { passwordResetPath } from "@/lib/password-recovery";
import { getPublicAppUrl } from "@/lib/public-app-url";
import styles from "@/app/login/page.module.css";

const neutralConfirmation =
  "Wenn ein passendes Konto mit bestätigter E-Mail existiert, wurde ein Link zum Zurücksetzen versendet.";

/**
 * Fordert den Recovery-Link direkt beim Auth-Dienst an. Dadurch kann dessen
 * IP-basierter Missbrauchsschutz die tatsächliche Client-IP bewerten. Das UI
 * zeigt für vorhandene, unbekannte und OAuth-only-Adressen dieselbe Antwort.
 */
export function RecoveryRequestForm({ configured }: { configured: boolean }) {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || pending) return;

    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "").trim();
    setPending(true);

    try {
      // Recovery-E-Mails müssen auch aus einem Vorschau-Tab zur dauerhaft
      // verfügbaren Produktionsadresse zurückführen.
      const callbackUrl = new URL("/auth/callback", getPublicAppUrl());
      callbackUrl.searchParams.set("next", passwordResetPath);
      const supabase = createClient();

      // Supabase erzwingt für Recovery standardmäßig 60 Sekunden Abstand je
      // Adresse und zusätzliche IP-Limits. Ein später aktiviertes Turnstile-
      // Token kann hier über options.captchaToken ergänzt werden.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl.toString(),
      });
    } catch {
      // Auch lokale Netzwerk- oder Konfigurationsfehler dürfen die Existenz
      // eines Kontos nicht über eine abweichende Antwort sichtbar machen.
    } finally {
      // Auth-Fehler werden absichtlich nicht unterschieden, damit weder
      // Kontoexistenz noch die vorhandene Login-Methode erkennbar werden.
      form.reset();
      setSubmitted(true);
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className={styles.recoveryConfirmation} role="status" aria-live="polite">
        <MailCheck size={24} aria-hidden="true" />
        <div>
          <strong>E-Mail geprüft</strong>
          <p>{neutralConfirmation}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        E-Mail-Adresse
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="name@verein.de"
          required
        />
      </label>
      <p className={styles.securityNote}>
        Aus Sicherheitsgründen bestätigen wir nicht, ob zu dieser Adresse ein
        Konto oder ein Passwort vorhanden ist.
      </p>
      <button type="submit" disabled={!configured || pending}>
        <MailCheck size={18} aria-hidden="true" />
        {pending ? "Wird geprüft …" : "Recovery-Link anfordern"}
      </button>
    </form>
  );
}
