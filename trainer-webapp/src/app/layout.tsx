import type { Metadata } from "next";
import { Geist, Oswald } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/current-user";
import { I18nProvider } from "@/i18n/i18n-provider";
import { getTranslations } from "@/i18n/server";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trainer Hub",
  description: "Organisation, Termine und Trainingspläne für den deutschen Rollsport.",
};

/**
 * Das Root-Layout stellt den gemeinsamen App-Rahmen für alle Seiten bereit.
 * Einzelne Features müssen dadurch Navigation, Profil und mobile Bedienung
 * nicht selbst implementieren und können später unabhängig ausgetauscht werden.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ locale, dictionary }, currentUser] = await Promise.all([
    getTranslations(),
    getCurrentUser(),
  ]);

  return (
    <html lang={locale} className={`${geist.variable} ${oswald.variable}`}>
      <body>
        <I18nProvider locale={locale} dictionary={dictionary}>
          <AppShell currentUser={currentUser}>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
