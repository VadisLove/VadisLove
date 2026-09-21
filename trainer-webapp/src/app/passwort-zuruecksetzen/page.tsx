import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, KeyRound } from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import {
  forgotPasswordPath,
  passwordRecoveryCookieName,
} from "@/lib/password-recovery";
import { verifyPasswordRecoveryGrant } from "@/lib/password-recovery-grant";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";
import styles from "@/app/login/page.module.css";

/** Zielseite für genau einen zuvor eingelösten Passwort-Recovery-Link. */
export default async function ResetPasswordPage() {
  const [cookieStore, supabase] = await Promise.all([cookies(), createClient()]);
  const userResult = await supabase.auth.getUser();
  const authUser = userResult.data.user;
  let canReset = false;
  if (authUser) {
    try {
      canReset = verifyPasswordRecoveryGrant(
        cookieStore.get(passwordRecoveryCookieName)?.value,
        authUser.id,
      );
    } catch {
      canReset = false;
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <LanguageSwitcher />
        <div className={styles.brand}>
          <Image
            src="/brand/sksb-logo.webp"
            alt="Skateboard Deutschland SKSB"
            width={72}
            height={72}
            priority
          />
          <div>
            <span>Trainer Hub</span>
            <h1>Neues Passwort</h1>
          </div>
        </div>

        <div className={styles.recoveryIntro}>
          <span><KeyRound size={20} aria-hidden="true" /></span>
          <p>
            Lege jetzt dein neues Passwort fest. Der Recovery-Zugang ist nur
            kurz gültig und kann anschließend nicht erneut verwendet werden.
          </p>
        </div>

        {canReset ? (
          <ResetPasswordForm />
        ) : (
          <div className={styles.expiredRecovery}>
            <AlertTriangle size={24} aria-hidden="true" />
            <div>
              <strong>Recovery-Link nicht mehr gültig</strong>
              <p>Fordere einen neuen Link an, um dein Passwort zurückzusetzen.</p>
              <Link href={forgotPasswordPath}>Neuen Link anfordern</Link>
            </div>
          </div>
        )}

        <footer className={styles.legalFooter}>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutzerklärung</Link>
          <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
        </footer>
      </section>
    </main>
  );
}
