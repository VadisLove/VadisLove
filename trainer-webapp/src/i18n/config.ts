export const supportedLocales = ["de", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "de";
export const localeCookieName = "trainer-hub-locale";

export function isLocale(value: string | undefined): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function getIntlLocale(locale: Locale) {
  return locale === "de" ? "de-DE" : "en-GB";
}
