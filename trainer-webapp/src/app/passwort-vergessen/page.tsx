import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { RecoveryRequestForm } from "./recovery-request-form";
import styles from "@/app/login/page.module.css";

/** Öffentliche, kontoneutrale Startseite des Passwort-Recovery-Ablaufs. */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const configured = isSupabaseConfigured();

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
            <h1>Passwort zurücksetzen</h1>
          </div>
        </div>

        <div className={styles.recoveryIntro}>
          <span><KeyRound size={20} aria-hidden="true" /></span>
          <p>
            Gib deine bestätigte Login-E-Mail ein. Ein gültiger Link kann nur
            einmal verwendet werden.
          </p>
        </div>

        {status === "expired" || status === "unavailable" ? (
          <div className={styles.error} role="alert">
            {status === "unavailable"
              ? "Der Passwortdienst ist vorübergehend nicht verfügbar. Bitte versuche es später erneut."
              : "Der Link ist ungültig, abgelaufen oder wurde bereits verwendet. Fordere bei Bedarf einen neuen an."}
          </div>
        ) : null}
        {!configured ? (
          <div className={styles.setupNotice}>
            Der Passwortdienst ist noch nicht vollständig konfiguriert.
          </div>
        ) : null}

        <RecoveryRequestForm configured={configured} />

        <div className={styles.authBackLink}>
          <Link href="/login"><ArrowLeft size={17} aria-hidden="true" />Zur Anmeldung</Link>
        </div>
        <footer className={styles.legalFooter}>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutzerklärung</Link>
          <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>
        </footer>
      </section>
    </main>
  );
}
