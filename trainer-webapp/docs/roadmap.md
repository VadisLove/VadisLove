# Trainer Hub: Roadmap

Stand: 3. September 2026. Fahrgemeinschaften sind der erste Release. Spätere
Phasen werden vor der Umsetzung fachlich konkretisiert; es gibt noch keine
verbindlichen Kalendertermine.

| Reihenfolge | Funktionspaket                                                                                                                      | Nutzen                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1           | Fahrgemeinschaften an Trainings und Contests; separate Hin-/Rückfahrt; Fahrerbestätigung; Elterninformationen; App-/E-Mail-Hinweise | Anreise innerhalb der App organisieren        |
| 2           | Rückmeldefristen, gezielte Erinnerungen, bestätigungspflichtige wichtige Terminänderungen, persönliches Kalender-Abo                | Weniger Nachfragen und übersehene Änderungen  |
| 3           | Familienübersicht, Abwesenheitszeiträume, Trainingswarteliste mit Nachrücken                                                        | Familien und Teilnahme einfacher koordinieren |
| 4           | Tatsächliche Anwesenheit getrennt von Zusagen; Trainingsmodus mit Übungen, Timer und Notizen                                        | Weniger Verwaltungsarbeit am Trainingsort     |
| 5           | Offline-Trainingsplan und Teilnehmerliste; nachträgliche Synchronisierung der Anwesenheit                                           | Nutzung auch bei schlechtem Empfang           |

## Festlegungen für Release 1

- Erwachsene mit Terminzugriff bieten Fahrten an und bestätigen Volljährigkeit
  und Fahrberechtigung. Bekannte Minderjährige dürfen keine Angebote erstellen.
- Athleten fragen für sich selbst an. Eltern werden informiert, müssen aber
  keine Buchungen freigeben. Voraussetzung ist eine aktive Elternverknüpfung.
- Eine Anfrage belegt noch keinen Platz. Der Fahrer entscheidet; die
  Datenbank verhindert Überbuchungen und mehrere aktive Anfragen je Richtung.
- Hin- und Rückfahrt sind unabhängig buchbar. Eine Rückfahrt kann beim
  Erstellen der Hinfahrt gleich mit angelegt werden.
- Kommentare stehen Fahrer, bestätigten Mitfahrern und deren verknüpften
  Eltern zur Verfügung. Eltern erhalten keinen zusätzlichen Terminzugriff.
- Terminänderungen erfordern eine Prüfung durch den Fahrer. Geänderte
  Fahrtdaten können Mitfahrer bestätigen. Absagen geben Plätze wieder frei.
- Routenvermittlung, Zahlungen, Live-Standort, externe Mitfahrer, Sammelbuchungen
  und Push gehören nicht zu Release 1.

Technik, Tests und Veröffentlichung: [Fahrgemeinschaften – Release](carpools-release.md).
