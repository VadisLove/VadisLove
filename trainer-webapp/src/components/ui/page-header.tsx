"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useCurrentUser } from "@/components/auth/current-user-context";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./page-header.module.css";

interface PageHeaderProps {
  title: string;
  description?: string;
  showContext?: boolean;
}

/**
 * Einheitlicher Kopfbereich der Feature-Seiten.
 *
 * `showContext` blendet den aktuell gewählten Rollen- und Regionskontext ein.
 * Dieser Kontext wird später aus der angemeldeten Supabase-Session gespeist.
 */
export function PageHeader({
  title,
  description,
  showContext = false,
}: PageHeaderProps) {
  const currentUser = useCurrentUser();
  const { t } = useI18n();

  return (
    <header className={styles.header}>
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className={styles.actions}>
        {showContext ? (
          <button className={styles.contextButton} type="button">
            {t("context.current")}
            <ChevronDown size={16} />
          </button>
        ) : null}
        <button className={styles.notificationButton} type="button" aria-label={t("navigation.notifications")}>
          <Bell size={21} />
          <span>3</span>
        </button>
        <div className={styles.profile}>
          <span>{currentUser?.initials || "TH"}</span>
          <div>
            <strong>{currentUser?.displayName || t("common.appName")}</strong>
            <small>
              {currentUser
                ? t(`accountTypes.${currentUser.accountType}`)
                : t("common.signedIn")}
            </small>
          </div>
        </div>
      </div>
    </header>
  );
}
