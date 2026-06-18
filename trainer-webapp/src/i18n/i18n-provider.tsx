"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { translate, type Dictionary, type TranslationValues } from "./index";

interface I18nContextValue {
  locale: Locale;
  dictionary: Dictionary;
  t: (key: string, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Stellt Sprache und Wörterbuch allen Client-Komponenten bereit. */
export function I18nProvider({
  children, dictionary, locale,
}: {
  children: React.ReactNode;
  dictionary: Dictionary;
  locale: Locale;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, dictionary, t: (key, values) => translate(dictionary, key, values) }),
    [dictionary, locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n muss innerhalb des I18nProvider verwendet werden.");
  return context;
}
