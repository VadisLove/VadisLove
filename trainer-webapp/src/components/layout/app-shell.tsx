"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ChartNoAxesCombined,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Plus,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import styles from "./app-shell.module.css";
import { CurrentUserProvider } from "@/components/auth/current-user-context";
import type { CurrentUser } from "@/domain/current-user";
import type { NotificationPreview } from "@/data/notification-repository";
import { useI18n } from "@/i18n/i18n-provider";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationCenter } from "./notification-center";
import { NotificationProvider } from "./notification-context";

const navigation = [
  { href: "/", labelKey: "navigation.dashboard", icon: LayoutDashboard },
  { href: "/kalender", labelKey: "navigation.calendar", icon: CalendarDays },
  { href: "/trainingsplaene", labelKey: "navigation.plans", icon: ClipboardList },
  { href: "/auswertung", labelKey: "navigation.evaluations", icon: ChartNoAxesCombined },
  { href: "/personen", labelKey: "navigation.people", icon: Users },
  { href: "/postfach", labelKey: "navigation.inbox", icon: MessagesSquare },
  { href: "/organisation", labelKey: "navigation.organization", icon: Building2 },
  { href: "/profil", labelKey: "navigation.profile", icon: UserRound },
];

/**
 * Gemeinsamer responsiver Rahmen der Anwendung.
 *
 * Auf Desktop bleibt die Navigation sichtbar. Auf kleinen Displays wird
 * derselbe Inhalt als Drawer geöffnet. Alle Seiten werden über `children`
 * eingesetzt und müssen ihre mobile Navigation daher nicht selbst verwalten.
 */
export function AppShell({
  children,
  currentUser,
  notificationPreview,
}: {
  children: React.ReactNode;
  currentUser: CurrentUser | null;
  notificationPreview: NotificationPreview;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Öffentliche Seiten wie der Login benötigen weder Navigation noch App-Rahmen.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/konto-wiederherstellen")
  ) {
    return children;
  }

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <CurrentUserProvider user={currentUser}>
      <NotificationProvider preview={notificationPreview}>
      <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.open : ""}`}>
        <div className={styles.brand}>
          <Image
            src="/brand/sksb-logo.webp"
            alt="Skateboard Deutschland SKSB"
            width={64}
            height={64}
            priority
          />
          <span>{t("common.appName")}</span>
          <button
            className={styles.closeButton}
            type="button"
            aria-label={t("navigation.close")}
            onClick={closeMobileMenu}
          >
            <X size={22} />
          </button>
        </div>

        <nav className={styles.navigation} aria-label={t("navigation.main")}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.activeLink : styles.navLink}
                onClick={closeMobileMenu}
              >
                <Icon size={20} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/kalender?neu=1" className={styles.createButton}>
            <Plus size={20} />
            {t("navigation.createEvent")}
          </Link>
          <LanguageSwitcher />
          <Link href="/einstellungen" className={styles.secondaryLink} onClick={closeMobileMenu}>
            <Settings size={19} />
            {t("navigation.settings")}
          </Link>
          <form action={logout}>
            <button type="submit" className={styles.secondaryLink}>
              <LogOut size={19} />
              {t("navigation.logout")}
            </button>
          </form>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          className={styles.backdrop}
          type="button"
          aria-label={t("navigation.close")}
          onClick={closeMobileMenu}
        />
      ) : null}

      <div className={styles.contentColumn}>
        <header className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("navigation.open")}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <strong>{t("common.appName")}</strong>
          <div className={styles.mobileActions}>
            <NotificationCenter
              initialItems={notificationPreview.items}
              initialUnreadCount={notificationPreview.unreadCount}
            />
            {/* Der Logout bleibt mobil immer sichtbar, auch wenn der Drawer lang ist. */}
            <form action={logout} className={styles.mobileLogoutForm}>
              <button
                type="submit"
                className={styles.iconButton}
                aria-label={t("navigation.logout")}
                title={t("navigation.logout")}
              >
                <LogOut size={20} />
              </button>
            </form>
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
      </div>
      </NotificationProvider>
    </CurrentUserProvider>
  );
}
