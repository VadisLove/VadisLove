"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  House,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./mobile-bottom-navigation.module.css";

const mobileDestinations = [
  { href: "/", labelKey: "navigation.dashboard", icon: House },
  { href: "/kalender", labelKey: "navigation.calendar", icon: CalendarDays },
  { href: "/personen", labelKey: "navigation.people", icon: Users },
  { href: "/profil", labelKey: "navigation.profile", icon: UserRound },
] as const;

/**
 * Stellt die wichtigsten Bereiche auf Smartphones dauerhaft in Daumenreichweite.
 * Der ausführliche Drawer bleibt für alle seltener benötigten Ziele erhalten.
 */
export function MobileBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  /**
   * Eine eindeutige Anfrage öffnet den Dialog auch dann erneut, wenn er auf der
   * Kalenderseite zuvor geschlossen wurde und der Nutzer nochmals auf Plus tippt.
   */
  function openCreateEvent() {
    router.push(`/kalender?neu=${Date.now()}`);
  }

  const renderDestination = (
    destination: (typeof mobileDestinations)[number],
  ) => {
    const Icon = destination.icon;
    const isActive = destination.href === "/"
      ? pathname === "/"
      : pathname.startsWith(destination.href);

    return (
      <Link
        key={destination.href}
        href={destination.href}
        className={`${styles.destination} ${isActive ? styles.active : ""}`}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon size={22} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
        <span>{t(destination.labelKey)}</span>
      </Link>
    );
  };

  return (
    <nav className={styles.navigation} aria-label={t("navigation.mobileQuickNavigation")}>
      {mobileDestinations.slice(0, 2).map(renderDestination)}

      <button
        type="button"
        className={styles.createAction}
        aria-label={t("navigation.createEvent")}
        title={t("navigation.createEvent")}
        onClick={openCreateEvent}
      >
        <Plus size={27} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {mobileDestinations.slice(2).map(renderDestination)}
    </nav>
  );
}
