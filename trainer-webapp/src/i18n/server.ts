import { cookies } from "next/headers";
import { defaultLocale, isLocale, localeCookieName } from "./config";
import { dictionaries, translate, type TranslationValues } from "./index";

export async function getLocale() {
  const cookieStore = await cookies();
  const locale = cookieStore.get(localeCookieName)?.value;
  return isLocale(locale) ? locale : defaultLocale;
}

export async function getTranslations() {
  const locale = await getLocale();
  const dictionary = dictionaries[locale];
  return {
    locale,
    dictionary,
    t: (key: string, values?: TranslationValues) => translate(dictionary, key, values),
  };
}
