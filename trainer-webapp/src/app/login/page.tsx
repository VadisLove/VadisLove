import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, UserPlus } from "lucide-react";
import { login, register } from "@/app/login/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTranslations } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getRegistrationOrganizations } from "@/data/registration-organization-repository";
import { RegistrationOrganizationFields } from "./registration-organization-fields";
import styles from "./page.module.css";

interface LoginPageProps {
  searchParams: Promise<{
    message?: string;
    next?: string;
    mode?: "login" | "register";
    status?: "error" | "success";
  }>;
}

/**
 * Gemeinsame Auth-Seite für Anmeldung und Registrierung.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { message, next = "/", mode = "login", status = "error" } = await searchParams;
  const configured = isSupabaseConfigured();
  const isRegistering = mode === "register";
  const { t } = await getTranslations();
  const registrationOrganizations = isRegistering && configured
    ? await getRegistrationOrganizations()
    : [];

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
            <span>{t("common.appName")}</span>
            <h1>{isRegistering ? t("auth.createAccount") : t("auth.login")}</h1>
          </div>
        </div>

        <p className={styles.intro}>
          {isRegistering
            ? t("auth.registerIntro")
            : t("auth.loginIntro")}
        </p>

        <nav className={styles.tabs} aria-label={t("auth.tabsAria")}>
          <Link
            href={`/login?mode=login&next=${encodeURIComponent(next)}`}
            className={!isRegistering ? styles.activeTab : ""}
          >
            {t("auth.login")}
          </Link>
          <Link
            href={`/login?mode=register&next=${encodeURIComponent(next)}`}
            className={isRegistering ? styles.activeTab : ""}
          >
            {t("auth.register")}
          </Link>
        </nav>

        {!configured ? (
          <div className={styles.setupNotice}>
            {t("auth.missingConfig")}
          </div>
        ) : null}

        {message ? (
          <div className={status === "success" ? styles.success : styles.error}>
            {message}
          </div>
        ) : null}

        {isRegistering ? (
          <form action={register} className={styles.form}>
            <label>
              {t("auth.fullName")}
              <input
                type="text"
                name="displayName"
                autoComplete="name"
                placeholder={t("auth.fullNamePlaceholder")}
                required
              />
            </label>

            <label>
              {t("auth.email")}
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="name@verein.de"
                required
              />
            </label>

            <RegistrationOrganizationFields
              organizations={registrationOrganizations}
            />

            <div className={styles.passwordGrid}>
              <label>
                {t("auth.password")}
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label>
                {t("auth.repeatPassword")}
                <input
                  type="password"
                  name="passwordConfirmation"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            </div>

            <p className={styles.roleNotice}>
              {t("auth.roleNotice")}
            </p>

            <button type="submit" disabled={!configured}>
              <UserPlus size={18} />
              {t("auth.createAccount")}
            </button>
          </form>
        ) : (
          <form action={login} className={styles.form}>
            <input type="hidden" name="next" value={next} />

            <label>
              {t("auth.email")}
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="name@verein.de"
                required
              />
            </label>

            <label>
              {t("auth.password")}
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>

            <button type="submit" disabled={!configured}>
              <LockKeyhole size={18} />
              {t("auth.login")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
