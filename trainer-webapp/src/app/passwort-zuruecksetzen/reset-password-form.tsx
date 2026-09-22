"use client";

import { AlertTriangle, KeyRound } from "lucide-react";
import { useActionState } from "react";
import { minimumPasswordLength } from "@/domain/password-security";
import { PasswordInput } from "@/components/forms/password-input";
import {
  resetRecoveredPassword,
  type ResetPasswordState,
} from "./actions";
import styles from "@/app/login/page.module.css";

const initialState: ResetPasswordState = { status: "idle", message: "" };

/** Formular für eine zuvor serverseitig bestätigte Recovery-Sitzung. */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(
    resetRecoveredPassword,
    initialState,
  );

  return (
    <form action={action} className={styles.form}>
      {state.message ? (
        <div className={styles.error} role="alert">
          <AlertTriangle size={18} aria-hidden="true" /> {state.message}
        </div>
      ) : null}
      <label>
        Neues Passwort
        <PasswordInput
          name="password"
          autoComplete="new-password"
          minLength={minimumPasswordLength}
          required
          controlClassName={styles.passwordInputControl}
          toggleClassName={styles.passwordVisibilityButton}
        />
      </label>
      <label>
        Neues Passwort wiederholen
        <PasswordInput
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={minimumPasswordLength}
          required
          controlClassName={styles.passwordInputControl}
          toggleClassName={styles.passwordVisibilityButton}
        />
      </label>
      <p className={styles.securityNote}>
        Mindestens {minimumPasswordLength} Zeichen. Nach dem Speichern werden
        alle bisherigen Sitzungen beendet.
      </p>
      <button type="submit" disabled={pending}>
        <KeyRound size={18} aria-hidden="true" />
        {pending ? "Wird gespeichert …" : "Neues Passwort speichern"}
      </button>
    </form>
  );
}
