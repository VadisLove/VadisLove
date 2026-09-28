import type { Locale } from "@/i18n/config";

const de = {
  title: "Meine Familie", intro: "Termine und offene Aufgaben deiner Kinder – an einem Ort.",
  add: "Kind anlegen", name: "Name des Kindes", submit: "Kind speichern", cancel: "Abbrechen",
  declaration: "Ich bin für dieses Kind sorgeberechtigt und darf seine Teilnahme organisieren.",
  noLogin: "Ohne eigenes Konto", login: "Mit eigenem Konto", tasks: "offene Aufgaben",
  empty: "Noch kein Kind verknüpft", emptyText: "Lege dein Kind ohne eigene E-Mail an. Bereits per Elternfreigabe verknüpfte Kinder erscheinen hier automatisch.",
  createHelp: "Hat dein Kind bereits ein Konto? Nutze dessen Elternfreigabe oder die bestehende Elternverknüpfung, damit kein zweites Profil entsteht.",
  noEvents: "Zurzeit keine anstehenden Termine.", confirmed: "Zugesagt", declined: "Abgesagt", open: "Antwort offen", noResponse: "Noch nicht angemeldet",
  yes: "Zusagen", no: "Absagen", cancelled: "Termin abgesagt", acknowledge: "Änderung zur Kenntnis nehmen",
  changed: "Wichtige Änderung – bitte prüfen", deadline: "Rückmeldung bis", late: "Antwort nach Rückmeldefrist",
  invite: "Weiteres Elternteil einladen", email: "E-Mail des weiteren Elternteils", createLink: "Bestätigungslink erstellen",
  linkHelp: "Gib diesen Link an das weitere Elternteil weiter. Es muss sich mit der angegebenen, bestätigten E-Mail anmelden. Der Link gilt 14 Tage und kann einmal verwendet werden.",
  copy: "Link kopieren", copied: "Kopiert", acceptTitle: "Elternverknüpfung bestätigen", acceptHelp: "Du hast einen persönlichen Einladungslink erhalten. Bestätige deine Sorgeberechtigung für das Kind der Einladung.",
  accept: "Verknüpfung bestätigen", working: "Wird gespeichert …", refresh: "Erneut laden", loadError: "Deine Familie konnte nicht geladen werden. Bitte versuche es erneut.",
  saved: "Gespeichert.", invalid: "Bitte prüfe deine Angaben und die Bestätigung.", forbidden: "Diese Aktion ist für dein Konto oder dieses Kind nicht mehr möglich.",
  linkInvalid: "Der Link ist abgelaufen, bereits verwendet oder gehört zu einer anderen E-Mail-Adresse.",
  conflict: "Der Termin wurde inzwischen geändert. Lade die Ansicht neu und prüfe die aktuellen Angaben.", failed: "Speichern fehlgeschlagen. Bitte versuche es erneut.",
};
const en: typeof de = {
  title: "My family", intro: "Your children's events and open tasks, together in one place.",
  add: "Add child", name: "Child's name", submit: "Save child", cancel: "Cancel",
  declaration: "I am this child's legal guardian and may organise their participation.",
  noLogin: "Without an account", login: "With their own account", tasks: "open tasks",
  empty: "No children linked yet", emptyText: "Add your child without an email address. Children already linked through guardian approval appear here automatically.",
  createHelp: "Does your child already have an account? Use their guardian approval or existing guardian relationship to avoid creating a second profile.",
  noEvents: "No upcoming events at the moment.", confirmed: "Attending", declined: "Declined", open: "Response needed", noResponse: "Not registered yet",
  yes: "Accept", no: "Decline", cancelled: "Event cancelled", acknowledge: "Acknowledge change",
  changed: "Important change – please review", deadline: "Reply by", late: "Response after deadline",
  invite: "Invite another guardian", email: "Other guardian's email", createLink: "Create confirmation link",
  linkHelp: "Share this link with the other guardian. They must sign in with the specified, verified email. The link expires after 14 days and can be used once.",
  copy: "Copy link", copied: "Copied", acceptTitle: "Confirm guardian relationship", acceptHelp: "You received a personal invitation. Confirm that you are the legal guardian of the child this invitation refers to.",
  accept: "Confirm relationship", working: "Saving …", refresh: "Reload", loadError: "Your family could not be loaded. Please try again.",
  saved: "Saved.", invalid: "Please check your details and confirmation.", forbidden: "This action is no longer available for your account or this child.",
  linkInvalid: "This link has expired, has already been used, or belongs to a different email address.",
  conflict: "The event has changed. Reload the page and review the latest details.", failed: "Could not save. Please try again.",
};
export function familyCopy(locale: Locale) { return locale === "en" ? en : de; }
