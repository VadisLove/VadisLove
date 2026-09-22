# Technischer Bericht – Schritt 4: Verbindliche Kalenderkommunikation

Stand: 22.09.2026
Arbeitsbranch: `codex/step-4-calendar-communication`
Ausgangsstand: `codex/step-3-password-recovery` (`45a0c60`)
Zielprojekt: Supabase `lglmlktrngmrimvhwxab`, Vercel `trainer-webapp`

## Bewertungsrahmen

Zielentität sind Termine mit Teilnahme, Rückmeldefrist, Kommunikationsrevision,
Kenntnisnahme, Zustellung, Informationslinks, Serienzuordnung und persönlichem
ICS-Feed. Der Nutzungskontext umfasst die mobile und die Desktop-Webanwendung
für Athleten, Terminersteller sowie aktiv verknüpfte Eltern minderjähriger
Athleten. Maßgeblich sind funktionale Eignung, Sicherheit, Zuverlässigkeit,
Interoperabilität, Benutzbarkeit und Wartbarkeit gemäß der projektinternen
ISO/IEC-25002-Zusammenfassung.

## Umgesetzter Umfang

- Die neue Migration
  `20260922122040_step_4_calendar_communication.sql` ergänzt Fristen,
  Verspätungskennzeichnung, Terminrevisionen, getrennte Kenntnisnahmen,
  Informationslinks, stabile Serien-IDs, fachliche Absagen und Feed-Tokens.
- Nur der Ersteller kann Termin-Kommunikationsdaten ändern. Teilnehmer verwalten
  ausschließlich ihre eigene Teilnahme, Erinnerung und Kenntnisnahme.
- Freiwillige Erinnerungen sind standardmäßig aus. Der Worker materialisiert nur
  noch mögliche 72-/24-Stunden-Stufen vor einer offenen Frist und dedupliziert
  pro Termin, Person und Stufe.
- Einladung, wichtige Änderung und Absage erzeugen unabhängig von der
  Reminder-Option fachliche In-App- und Resend-Zustellungen. Queue, Lease,
  Wiederholungsgrenze und Idempotenzschlüssel sind vom Fahrten-Worker getrennt.
- Automatisch wichtige Änderungen erzeugen pro Termin eine neue Revision.
  Titel, Beschreibung, Kapazität und Links können ausdrücklich als
  kenntnisnahmepflichtig markiert werden.
- Kommunizierte Termine werden für 30 Tage als abgesagt im Feed gehalten;
  unkommunizierte Termine ohne Abhängigkeiten dürfen hart gelöscht werden.
  Bestehende Fahrgemeinschaften werden über die vorhandene Absagelogik geführt.
- Elternhinweise setzen eine aktive, geprüfte Beziehung zu einem minderjährigen
  Athleten voraus. Sie führen weder Terminzugriff noch Antwortrechte ein.
- Persönliche ICS-Feeds verwenden stabile UIDs, `SEQUENCE`, `Europe/Berlin`,
  abgesagte Einträge und sichere Informationslinks. Tokens werden zufällig
  erzeugt und nur als SHA-256-Hash gespeichert. Direkte Tabellenzugriffe können
  weder Tokens erzeugen noch widerrufene Tokens reaktivieren.
- Neu erstellte Wochenserien erhalten eine stabile Serien-ID. Bearbeitungen
  betreffen wahlweise nur einen oder diesen und alle zukünftigen Termine;
  bestehende Termine ohne Serien-ID bleiben unverändert eigenständig.

## Sicherheits- und Datenbankgrenzen

Alle neuen Tabellen im exponierten Schema besitzen RLS und minimale Grants.
Private Zustellungsdaten bleiben im Schema `private` und sind nur dem
`service_role` zugänglich. Rechte stammen aus Datenbankbeziehungen und
`auth.uid()`, nicht aus `user_metadata`. Externe Links akzeptieren ausschließlich
HTTP/HTTPS ohne eingebettete Zugangsdaten. Feed-Routen liefern bei ungültigen
oder widerrufenen Tokens keine Daten und setzen `no-store` sowie `nosniff`.
Fremdschlüssel und Worker-Abfragen besitzen passende Indizes.

## Technische Prüfergebnisse

| Prüfung | Stand 22.09.2026 | Ergebnis |
| --- | --- | --- |
| Schritt-4-Datenbank- und RLS-Suite (PGlite) | 8 Tests | bestanden |
| Schritt-4-Suite auf isoliertem PostgreSQL 17 / Node 24 | 8 Tests | bestanden |
| Vollständiger nativer Release-Runner | 40 Tests in vier isolierten Suiten | bestanden |
| Desktop-Browserprüfung Kalender und Einstellungen | Chromium, lokales Fixture | bestanden, keine Konsolenfehler |
| Mobile Browserprüfung Kalenderdetail und Bearbeitung | Chromium, Mobile-Viewport | bestanden; überlagernden Detail-Sheet behoben |
| Typecheck | TypeScript 5, Node 24.20.0 | bestanden |
| ESLint | vollständiger Quellstand | bestanden |
| Vollständige Testsuite | 138 Tests | bestanden |
| Next.js-Produktionsbuild | Next.js 16.2.12 | bestanden, 28 Seiten erzeugt |
| `git diff --check` | vollständiger Patch | bestanden |

Die automatisierten Schritt-4-Prüfungen decken insbesondere Erstellerrechte,
gefährliche Links, späte Antworten, Reminder-Opt-in und Deduplizierung,
Revisionen, getrennte Kenntnisnahme, Elternrechte, Token-Widerruf,
Sommer-/Winterzeit, stabile ICS-UIDs, Serienänderungen und
Fahrgemeinschaftsabsagen ab.

## Bekannte Grenzen und Freigabestatus

- Die technische lokale Prüfung ist von der fachlichen Praxisabnahme getrennt.
  Die Praxisabnahme durch den Nutzer ist noch offen; dafür existiert eine eigene
  mobile Prüfliste.
- Die produktive Supabase-Migrationshistorie und das aktuelle Produktionsschema
  konnten noch nicht erneut gelesen werden, weil lokal kein Supabase-CLI-Zugriff
  (`SUPABASE_ACCESS_TOKEN`) für das Projekt vorliegt. Die neue Migration wurde
  deshalb nicht auf Produktion angewendet.
- Reale Schritt-4-Mails über Resend und ein produktiver ICS-Abruf wurden noch
  nicht ausgelöst. Es wurden keine Geheimnisse ausgegeben oder dokumentiert.
- Es erfolgte noch kein Commit, Push, Produktions-Tag oder Vercel-Deployment.
  Diese Schritte beginnen erst nach erfolgreicher Produktionsschema-Prüfung und
  vollständigem grünen Abschlusslauf.
- Die offenen Praxispunkte aus Schritt 3 bleiben unverändert separat offen.

## Rollback-Konzept

Vor einem späteren Produktionsdeployment wird der dann aktive stabile
Produktionscommit eindeutig getaggt. Bei einem kritischen Fehler wird die
Anwendung auf diesen Commit zurückgesetzt. Für die additive Datenbankmigration
erfolgt kein unkontrolliertes Down-Migration-Skript; eine Datenbankkorrektur wird
als geprüfte Vorwärtsmigration ausgeführt, damit bereits entstandene
Kommunikations- und Kenntnisnahmedaten erhalten bleiben.
