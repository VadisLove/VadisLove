import { de } from "./dictionaries/de";
import { en } from "./dictionaries/en";
import type { Locale } from "./config";

export type Dictionary = typeof en;
export type TranslationValues = Record<string, string | number>;

export const dictionaries: Record<Locale, Dictionary> = { de, en };

/**
 * Löst verschachtelte Schlüssel auf und ersetzt Platzhalter. Ein fehlender
 * Schlüssel bleibt sichtbar, damit unvollständige Übersetzungen auffallen.
 */
export function translate(
  dictionary: Dictionary,
  key: string,
  values: TranslationValues = {},
) {
  const result = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, dictionary);

  if (typeof result !== "string") return key;

  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    result,
  );
}
