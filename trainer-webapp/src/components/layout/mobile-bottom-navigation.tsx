"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  ArrowUp,
  CalendarDays,
  ClipboardList,
  House,
  Plus,
  UserRound,
} from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import styles from "./mobile-bottom-navigation.module.css";

const mobileDestinations = [
  { href: "/", labelKey: "navigation.dashboard", icon: House },
  { href: "/kalender", labelKey: "navigation.calendar", icon: CalendarDays },
  { href: "/trainingsplaene", labelKey: "navigation.plansShort", icon: ClipboardList },
  { href: "/profil", labelKey: "navigation.profile", icon: UserRound },
] as const;

/**
 * Modus des mittleren Buttons im Planbereich. Der Planbereich meldet, ob die
 * Person Pläne erstellen darf („create“) oder stattdessen Tricks meldet („report“).
 */
type PlanCreateMode = "create" | "report";
let planCreateMode: PlanCreateMode = "create";
const planCreateListeners = new Set<() => void>();

export function setPlanCreateMode(mode: PlanCreateMode) {
  if (mode === planCreateMode) return;
  planCreateMode = mode;
  planCreateListeners.forEach((listener) => listener());
}

function subscribePlanCreateMode(listener: () => void) {
  planCreateListeners.add(listener);
  return () => planCreateListeners.delete(listener);
}

/**
 * Stellt die wichtigsten Bereiche auf Smartphones dauerhaft in Daumenreichweite.
 * Der ausführliche Drawer bleibt für alle seltener benötigten Ziele erhalten.
 */
export function MobileBottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const mode = useSyncExternalStore(subscribePlanCreateMode, () => planCreateMode, () => "create" as const);

  /**
   * Eine eindeutige Anfrage öffnet den Dialog auch dann erneut, wenn er auf der
   * Kalenderseite zuvor geschlossen wurde und der Nutzer nochmals auf Plus tippt.
   */
  function openCreateEvent() {
    router.push(`/kalender?neu=${Date.now()}`);
  }

  // Im Planbereich erstellt der zentrale Button einen Plan statt eines Events;
  // ohne Erstellrecht öffnet er das Melden-Sheet („↑ Melden“).
  const onPlans = pathname.startsWith("/trainingsplaene");
  const reporting = onPlans && mode === "report";
  function openCreate() {
    if (onPlans) router.push(`/trainingsplaene?neu=${Date.now()}`);
    else openCreateEvent();
  }
  const createLabel = t(reporting ? "navigation.reportTrick" : onPlans ? "navigation.createPlan" : "navigation.createEvent");

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
        aria-label={createLabel}
        title={createLabel}
        onClick={openCreate}
      >
        {reporting ? (
          <ArrowUp size={25} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <Plus size={27} strokeWidth={2.4} aria-hidden="true" />
        )}
      </button>

      {mobileDestinations.slice(2).map(renderDestination)}
    </nav>
  );
}
