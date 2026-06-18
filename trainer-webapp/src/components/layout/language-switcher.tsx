"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { localeCookieName, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./language-switcher.module.css";

/** Speichert die Auswahl und rendert Server-Komponenten in der neuen Sprache. */
export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();

  function changeLocale(nextLocale: Locale) {
    document.cookie = `${localeCookieName}=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <label className={styles.languageSwitcher}>
      <Languages size={18} />
      <span>{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(event) => changeLocale(event.target.value as Locale)}
      >
        <option value="de">DE</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
