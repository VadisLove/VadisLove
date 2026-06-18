import { getIntlLocale, type Locale } from "@/i18n/config";

/**
 * Wandelt das ISO-Datum aus Repository oder Supabase in ein kurzes deutsches
 * Anzeigedatum um. Das Originalformat bleibt in der Fachschicht unverändert.
 */
export function formatShortDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));
}

/**
 * Gruppiert Kalendereinträge für die Agenda des Dashboards. Das Ergebnis wird
 * von `AgendaPanel` wiederverwendet und kann später auch in der Mobile-App
 * identisch erzeugt werden.
 */
export function groupEventsByDate<T extends { date: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    groups[item.date] ??= [];
    groups[item.date].push(item);
    return groups;
  }, {});
}
