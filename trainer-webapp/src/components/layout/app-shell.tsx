"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import styles from "./app-shell.module.css";
import { CurrentUserProvider } from "@/components/auth/current-user-context";
import type { CurrentUser } from "@/domain/current-user";
import { useI18n } from "@/i18n/i18n-provider";
import { LanguageSwitcher } from "./language-switcher";

const navigation = [
  { href: "/", labelKey: "navigation.dashboard", icon: LayoutDashboard },
  { href: "/kalender", labelKey: "navigation.calendar", icon: CalendarDays },
  { href: "/trainingsplaene", labelKey: "navigation.plans", icon: ClipboardList },
  { href: "/personen", labelKey: "navigation.people", icon: Users },
  { href: "/organisation", labelKey: "navigation.organization", icon: Building2 },
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
}: {
  children: React.ReactNode;
  currentUser: CurrentUser | null;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Öffentliche Seiten wie der Login benötigen weder Navigation noch App-Rahmen.
  if (pathname.startsWith("/login")) {
    return children;
  }

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <CurrentUserProvider user={currentUser}>
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
          <button type="button" className={styles.secondaryLink}>
            <Settings size={19} />
            {t("navigation.settings")}
          </button>
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
            <Search size={20} />
            <Bell size={20} />
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
      </div>
    </CurrentUserProvider>
  );
}
