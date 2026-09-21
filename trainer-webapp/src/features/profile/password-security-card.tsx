"use client";

import { AlertTriangle, CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import { useActionState } from "react";
import {
  changeOwnPassword,
  type PasswordActionState,
} from "@/app/profil/actions";
import { minimumPasswordLength } from "@/domain/password-security";
import styles from "./profile-view.module.css";

const initialState: PasswordActionState = { status: "idle", message: "" };

/** Eigenständiges Formular, damit keine Passwortfelder im Profilformular liegen. */
export function PasswordSecurityCard({
  hasPassword,
  hasConfirmedEmail,
}: {
  hasPassword: boolean;
  hasConfirmedEmail: boolean;
}) {
  const [state, action, pending] = useActionState(
    changeOwnPassword,
    initialState,
  );
  const codeRequested = !hasPassword && Boolean(state.codeRequested);

  return (
    <section className={styles.sectionCard} aria-labelledby="password-heading">
      <header className={styles.sectionHeader}>
        <span><KeyRound size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="password-heading">Passwort und Anmeldung</h2>
          <p>
            {hasPassword
              ? "Ändere dein Passwort nach Bestätigung des aktuellen Passworts."
              : "Lege nach Bestätigung deiner Login-E-Mail ein zusätzliches Passwort fest."}
          </p>
        </div>
      </header>

      {!hasConfirmedEmail ? (
        <div className={styles.passwordExplanation}>
          <MailCheck size={22} aria-hidden="true" />
          <div>
            <strong>Weiterhin über Google oder Apple anmelden</strong>
            <p>
              Für dieses Konto ist keine bestätigte Login-E-Mail verfügbar.
              Deshalb wird hier kein ungesichertes Passwortformular angeboten.
            </p>
          </div>
        </div>
      ) : state.status === "success" ? (
        <div className={styles.passwordSuccess} role="status" aria-live="polite">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div><strong>Passwort aktualisiert</strong><p>{state.message}</p></div>
        </div>
      ) : (
        <form action={action} className={styles.passwordForm}>
          {state.message ? (
            <p
              className={
                state.status === "code_sent"
                  ? styles.passwordCodeMessage
                  : styles.passwordError
              }
              role={state.status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {state.status === "error" ? (
                <AlertTriangle size={17} aria-hidden="true" />
              ) : (
                <MailCheck size={17} aria-hidden="true" />
              )}
              {state.message}
            </p>
          ) : null}

          <div className={styles.passwordFieldGrid}>
            {hasPassword ? (
              <label className={styles.passwordFullField}>
                <span>Aktuelles Passwort</span>
                <input
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Neues Passwort</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={minimumPasswordLength}
                required
              />
            </label>
            <label>
              <span>Neues Passwort wiederholen</span>
              <input
                type="password"
                name="passwordConfirmation"
                autoComplete="new-password"
                minLength={minimumPasswordLength}
                required
              />
            </label>
            {codeRequested ? (
              <label className={styles.passwordFullField}>
                <span>Bestätigungscode aus der E-Mail</span>
                <input
                  name="nonce"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  required
                />
              </label>
            ) : null}
          </div>

          <div className={styles.passwordFooter}>
            <small>
              Mindestens {minimumPasswordLength} Zeichen. Nach der Änderung
              werden alle anderen Sitzungen beendet.
            </small>
            <div>
              {codeRequested ? (
                <button
                  type="submit"
                  name="intent"
                  value="request-code"
                  formNoValidate
                  className={styles.passwordSecondaryButton}
                  disabled={pending}
                >
                  Code erneut senden
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={pending}
              >
                {pending
                  ? "Wird geprüft …"
                  : hasPassword
                    ? "Passwort ändern"
                    : codeRequested
                      ? "Passwort festlegen"
                      : "Code anfordern"}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
