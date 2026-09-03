# Trainer Hub MVP

Responsives Next.js-MVP für Kalender, Teilnahme, Personensuche, Organisationen
und geteilte Trainingspläne.

## Start

```bash
npm install
npm run dev
```

Danach läuft die Anwendung unter `http://localhost:3000`.

## Supabase einrichten

1. Im Supabase-Dashboard den SQL Editor öffnen.
2. Den Inhalt von `supabase/schema.sql` als neue Query ausführen.
3. Im Bereich **Authentication > Users** einen Testnutzer mit E-Mail und
   Passwort anlegen.
4. Im **Connect**-Dialog die Project URL und den Publishable Key kopieren.
5. `.env.example` als `.env.local` anlegen und beide Werte eintragen.
6. Den Entwicklungsserver nach Änderungen an `.env.local` neu starten.

Der Secret Key oder alte `service_role`-Schlüssel gehört niemals in eine
`NEXT_PUBLIC_`-Variable und wird für den aktuellen Login nicht benötigt.

## Elternfreigabe und E-Mail

Registrierende Personen ab 13 und unter 18 Jahren erhalten erst nach der
Bestätigung durch eine erziehungsberechtigte Person Zugriff auf Fachdaten. Für
den Versand des einmaligen Freigabelinks werden `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL` und die öffentliche `NEXT_PUBLIC_APP_URL` benötigt. Fehlt
die Konfiguration, bleibt das Konto sicher gesperrt und der Versand kann über
die Warteseite erneut angestoßen werden.

Token werden ausschließlich dem Versandserver ausgegeben. Das minderjährige
Konto kann einen erneuten Versand anfordern, erhält aber niemals den Freigabelink.

## Fahrgemeinschaften

Fahrtangebote, Gesuche, Buchungen und Elterninformationen sind direkt am Termin
verfügbar. Einrichtung, Migrationen und Versandwarteschlange: [Release-Dokumentation](docs/carpools-release.md).

### Bestehende Datenbank aktualisieren

Wenn das Grundschema bereits eingerichtet ist, müssen spätere Korrekturen aus
den passenden `supabase/apply-*.sql`-Dateien einmal vollständig im Supabase SQL
Editor ausgeführt werden. Für die hierarchische Sichtbarkeit und die
rollenabhängigen Erstellungsrechte von Terminen ist das:

```text
supabase/apply-event-hierarchy-visibility.sql
```

Für globale Personensuche, bestätigungspflichtige Kontakte, Gruppen, Postfach,
Benachrichtigungen und Benachrichtigungseinstellungen anschließend diese
Migration vollständig ausführen:

```text
supabase/migrations/20260714082753_social_inbox_notifications.sql
```

Die Social-Migration muss nach den älteren `apply-*.sql`-Dateien laufen, weil
sie das Personenverzeichnis und die Termin-Sichtbarkeit abschließend erweitert.

## Architektur

```text
src/
  app/          Routen und serverseitiges Laden der Seitendaten
  components/   Seitenübergreifende Layout- und UI-Komponenten
  features/     Fachlich getrennte Oberflächen
  domain/       Framework-unabhängige Typen für Web und spätere Mobile-App
  data/         Austauschbare Repository-Schicht und aktuelle Mockdaten
  lib/          Wiederverwendbare Formatierungs- und Fachhelfer
supabase/
  schema.sql    Vorgeschlagenes Produktionsschema inklusive RLS
```

## Datenfluss

1. Eine Route unter `src/app` lädt Daten aus `trainerRepository`.
2. Das Repository liefert die gemeinsamen Typen aus `src/domain/models.ts`.
3. Eine Feature-Komponente erhält diese Daten als Props und verwaltet nur
   temporäre Oberflächenzustände wie Filter oder offene Dialoge.
4. Für Supabase wird später eine zweite Repository-Implementierung ergänzt.
   Die Feature-Komponenten müssen dafür nicht umgebaut werden.

## Mobile-App-Vorbereitung

- Fachtypen enthalten keine React- oder Next.js-Abhängigkeiten.
- Das Datenbankmodell ist API-orientiert und verwendet stabile UUIDs.
- Geschäftslogik wie Gruppierung und Statusbezeichnungen liegt außerhalb der UI.
- Die responsive Web-App kann zunächst als PWA betrieben werden.
- Eine spätere React-Native/Expo-App kann dieselben Typen und API-Verträge nutzen.

## Aktueller MVP-Umfang

- People-First-Dashboard
- Globale Monatsansicht mit Bundesland- und Terminartfilter
- Lokale Event-Erstellung als vorbereiteter API-Workflow
- Teilnahmefilter und E-Mail-Einladung
- Personen- und Trainersuche
- Freundschafts-, Trainer–Athlet- und Elternanfragen mit beidseitiger Zustimmung
- Gruppen mit Einladungen und gemeinsam sichtbaren Terminen
- Postfach für Kontakt-, Gruppen- und Organisationsanfragen
- Echte In-App-Benachrichtigungen mit individuellen Einstellungen
- Trainingsplanübersicht und vorbereitete Freigabe
- Organisationshierarchie
- Supabase-Schema mit Row Level Security

## Noch nicht produktiv angebunden

- E-Mail-Einladungen außerhalb der Elternfreigabe
- Dateiupload für Trainingspläne
- Push-Benachrichtigungen

Diese Punkte sollten nach dem UI-MVP in dieser Reihenfolge ergänzt werden:
E-Mail-Einladungen, Uploads und Push-Benachrichtigungen.
