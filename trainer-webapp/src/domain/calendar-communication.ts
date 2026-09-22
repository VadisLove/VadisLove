import type { EventInformationLink } from "@/domain/models";

/** Erlaubt nur explizite Web-Links; Browser-Sonderprotokolle werden verworfen. */
export function normalizeEventInformationLinks(
  entries: Array<{ label: string; url: string }>,
): EventInformationLink[] | null {
  const normalized = entries
    .map((entry) => ({ label: entry.label.trim(), url: entry.url.trim() }))
    .filter((entry) => entry.label || entry.url);

  if (normalized.length > 10) return null;

  const links: EventInformationLink[] = [];
  for (const [index, entry] of normalized.entries()) {
    if (!entry.label || entry.label.length > 80 || entry.url.length > 1000) {
      return null;
    }
    try {
      const parsed = new URL(entry.url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        return null;
      }
      links.push({ label: entry.label, url: parsed.toString(), sortOrder: index });
    } catch {
      return null;
    }
  }

  return links;
}

/** Übersetzt nur bekannte Kalenderfehler; interne SQL-Details bleiben verborgen. */
export function calendarCommunicationError(error: { code?: string; message?: string }) {
  const code = error.message?.match(/CALENDAR_([A-Z_]+)/)?.[1]?.toLowerCase();
  if (code === "invalid_link") return "Mindestens ein Informationslink ist ungültig.";
  if (code === "invalid_deadline") return "Die Rückmeldefrist muss vor dem Termin liegen.";
  if (code === "forbidden") return "Diese Kalenderaktion ist für dein Konto nicht erlaubt.";
  if (["PGRST202", "42P01", "42883"].includes(error.code || "")) {
    return "Die Kalenderkommunikation ist noch nicht verfügbar.";
  }
  return "Die Kalenderaktion konnte nicht gespeichert werden.";
}
