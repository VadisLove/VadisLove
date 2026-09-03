# Fahrgemeinschaften: Betrieb und Release

## Aufbau

- `src/features/carpools/`: wiederverwendbarer Bereich für Kalender, eigene
  Deep-Link-Seite und Einstellungen; deutsche/englische Texte im Feature-Modul.
- `GET /api/carpools?event=<uuid>` bzw. `?ride=<uuid>` lädt den autorisierten
  Snapshot. Eltern-Links verwenden `/fahrgemeinschaften?ride=<uuid>`.
- `changeCarpool` ruft `public.carpool_command` auf. Der Wrapper läuft mit
  Aufruferrechten; der private Transaktionshelfer prüft das aktive Konto,
  Zugriff, Eigentümerschaft, Buchungsstatus und Eingaben erneut.
- Neue öffentliche Tabellen haben RLS und ausschließlich Leserechte für
  angemeldete Nutzer. Mutationen sind nur über den geprüften Befehl möglich.
- Befehls-UUIDs verhindern doppelte Seiteneffekte bei wiederholten Anfragen.
  Fahrtzeilensperren und ein partieller Unique-Index verhindern Überbuchung und
  doppelte aktive Buchungen. Sperrreihenfolge: Termin, Fahrt, Anfrage.
- Die neue Fahrgemeinschafts-Migration setzt die mitgelieferte `20260901113922_add_guardian_registration_approval.sql` voraus.
  Sie bricht vor Änderungen ab, wenn diese Grundlage fehlt.

## E-Mail und Scheduler

Benötigte serverseitige Umgebungsvariablen im Vercel-Projekt:

| Variable                    | Zweck                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | Bestehende Supabase-Adresse                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Ausschließlich serverseitiger Zugriff auf Versandwarteschlange |
| `RESEND_API_KEY`            | Versandzugang                                                  |
| `RESEND_FROM_EMAIL`         | Verifizierter Absender                                         |
| `NEXT_PUBLIC_APP_URL`       | Öffentliche HTTPS-Produktionsadresse für Links                 |
| `CARPOOL_CRON_SECRET`       | Zufälliges Geheimnis zur Authentifizierung des Workers         |

Keine echten Werte im Repository speichern. Der Endpunkt
`GET /api/carpools/mail` akzeptiert nur `Authorization: Bearer <CARPOOL_CRON_SECRET>`.
Er ist gezielt vom Login-Proxy ausgenommen und prüft sein eigenes Geheimnis.

Die zweite Migration verwendet die im verknüpften Supabase-Projekt bereits
installierten Erweiterungen `pg_cron`, `pg_net` und Vault. In einer anderen
Umgebung müssen diese vor der Scheduler-Migration aktiviert sein.

Vault-Einträge vor der Aktivierung konfigurieren:

- `carpool_worker_url`: `https://<Produktionsdomain>/api/carpools/mail`
- `carpool_cron_secret`: derselbe Wert wie `CARPOOL_CRON_SECRET` in Vercel

Ein Cron-Lauf pro Minute ruft den Worker auf. Ohne Vault-Einträge bleibt der
Aufruf inaktiv und protokolliert eine Warnung. Das funktioniert unabhängig von
den eingeschränkten Cron-Intervallen des verwendeten Vercel-Hobby-Tarifs.

Der Worker beansprucht höchstens 20 Nachrichten für fünf Minuten. Erfolgreiche
Zustellungen werden markiert; Fehler werden erneut versucht. Die Resend-Keys
bleiben pro Nachricht identisch. Nach acht Versuchen bzw. nach 23 Stunden seit
dem ersten Versuch wandert der Auftrag in den Fehlerzustand. So überschreiten
unklare Zustellungen nicht das 24-Stunden-Idempotenzfenster des Providers.
`failed_at` prüfen und die Ursache beheben; unklare Zustellungen nicht pauschal
zurücksetzen. Fehlerantworten des Workers enthalten keine Empfänger oder Keys.

Buchungen und In-App-Hinweise bleiben bei Versandproblemen erhalten. Vor dem
Versand werden Kontostatus, aktuelle Elternverknüpfung und E-Mail-Einstellung
nochmals geprüft. Nachrichtentexte enthalten keine Treffpunktadressen; Details
liegen hinter dem geschützten Link.

## Reproduzierbare Prüfungen

Im Ordner `trainer-webapp`:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Die Datenbanktests nutzen eine isolierte PostgreSQL-Instanz über PGlite mit
synthetischen Konten. Sie führen die tatsächliche Fahrgemeinschafts-Migration
und ihre RPCs/RLS-Regeln aus; nur die vorhandenen App-Verträge werden durch eine
kleine Fixture abgebildet.

Die gleiche Suite kann mit getrennten Verbindungen auf einem frischen nativen
PostgreSQL ausgeführt werden. Dazu `CARPOOL_NATIVE_PG_MODULE` auf den absoluten
Pfad des installierten `pg`-Moduls und `CARPOOL_TEST_DATABASE_URL` auf die leere
lokale Testdatenbank setzen. Nur `localhost` und `127.0.0.1` sind zugelassen.
Dann `node --experimental-strip-types --test tests/carpool-database.test.mjs`
ausführen. Keine bestehende oder produktive Datenbank verwenden.

Für die Browser-Abnahme stellt `node tests/support/carpool-fixture-server.mjs`
unter `127.0.0.1:54339` einen lokalen Supabase-Vertrag mit PGlite bereit. Der
Server legt ausschließlich synthetische Fahrer-, Athleten- und Elternkonten
sowie Browser-Sitzungsdateien unter `/tmp/carpool-*-state.json` an.

Den Devserver separat starten:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-only \
NEXT_PUBLIC_APP_URL=http://localhost:3107 \
RESEND_API_KEY='' npm run dev -- --port 3107
```

Die Testseite ist
`http://localhost:3107/fahrgemeinschaften?event=20000000-0000-0000-0000-000000000001`.
Die Fixture bildet nur die für diese Abnahme nötigen Supabase-Endpunkte ab;
sie ersetzt keine Staging-Abnahme der vollständigen Anwendung.

## Release-Status am 03.09.2026

Die Elternfreigabe und die zugehörige Registrierung sind vom Nutzer ausdrücklich
für dieses Release freigegeben. Die Anwendung wurde in einem separaten Worktree
auf Branch `codex/fahrgemeinschaften-release` zusammengestellt. Fremde Änderungen
an Auswertungen und die zuvor lokal geänderten Framework-Versionen sind nicht
enthalten. Zusätzlich zu den Produktionsabhängigkeiten kommen ausschließlich
Resend 6.25.0 und die Testabhängigkeit PGlite 0.5.8 hinzu.

Der Produktionsstart ist noch nicht erfolgt. Tatsächlich fehlende Voraussetzungen:

- Vercel Production: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` und
  `SUPABASE_SERVICE_ROLE_KEY`. Lokal und in Vercel sind derzeit ausschließlich
  die öffentlichen Supabase-Werte vorhanden. Der verbundene Supabase-Connector
  bietet keine Ausgabe des Server-Schlüssels; die Supabase-CLI ist nicht angemeldet.
- `NEXT_PUBLIC_APP_URL`, ein neu generiertes `CARPOOL_CRON_SECRET` sowie passende
  Vault-Werte werden bei der abschließenden Konfiguration eingerichtet.
- Die freigegebenen Rechtstext-Dateien enthalten weiterhin Platzhalter für
  Betreiber, Anschrift und Kontakt. Diese Daten müssen vom Betreiber stammen.
- Tatsächliche Resend-Zustellung und Scheduler-Aufruf sind nach der Konfiguration
  noch zu prüfen. Keine echte Testmail ohne vereinbarten Empfänger versenden.

Die drei neuen Migrationen wurden noch nicht auf Produktion angewandt. Insbesondere
darf der neue Registrierungstrigger nicht vor einem funktionsfähigen Mailversand
aktiviert werden, da neue minderjährige Nutzer sonst zunächst gesperrt blieben.

Das aktuelle erfolgreiche Produktionsdeployment ist
`dpl_DW277V4vpV6FW3HrgayG4beoEZM2`. Beide Produktionsdomains zeigen darauf.
Die Deployment-Metadaten nennen Git-Basis
`561821018585d491767f2c344685e93b648920e3`, zugleich aber `gitDirty=1`.
Der Quellvergleich mit der Vercel-Datei-API ist abgeschlossen: Alle 215
versionierten Quelldateien stimmen bytegenau mit diesem Commit überein. Die
216. Datei ist ausschließlich die ignorierte, automatisch generierte
`trainer-webapp/next-env.d.ts`. Die Basis ist damit als Rollback-Quellstand
bestätigt. Sicherungstag: `production/stable-before-carpools-2026-09-03`.
Die Deployment-ID bleibt zusätzlich das direkte Vercel-Rollbackziel.

Nach Vervollständigung der Konfiguration: Mailversand und Scheduler prüfen,
die drei Migrationen anwenden, ausschließlich den geprüften Release-Branch
pushen, Produktionsdeployment ausführen und
Domains sowie zentrale Fahrtabläufe verifizieren. Bei Fehlern nicht deployen;
bei kritischen Produktionsproblemen auf das vorherige Deployment zurückrollen.
Neue Tabellen und Spalten zunächst erhalten, statt einen Code-Rollback mit
riskanten destruktiven Datenbankänderungen zu verbinden.


## Abnahmeergebnis

- Isoliertes Release: **99 Tests erfolgreich**, Typprüfung, ESLint,
  `git diff --check` und Next.js-Produktionsbuild erfolgreich.
- Neue Elternfreigabe-Tests verhindern fehlende Alters-/Dokumentangaben,
  selbst gewählte Tokens und direkte Tokenausgabe an Minderjährige. Getestet
  sind außerdem genau einmalige Freigabe, Kontosperre und begrenzte Tokenrotation.
- Die aktuelle Produktions-Schemastruktur wurde ohne Nutzerdaten in nativem
  PostgreSQL 17 nachgebildet: 31 Tabellen, 59 Funktionen, 107 Policies sowie
  tatsächliche Tabellen-, Spalten- und Funktionsberechtigungen.
- Auf dieser Kopie wurden Elternfreigabe und Fahrgemeinschaftsmigration in
  Transaktionen erfolgreich angewandt. Alle sechs neuen Registrierungstests
  bestanden auch gegen dieses vollständige Anwendungsschema.
- Zusätzlich gegen das vollständige Schema geprüft: Registrierung, Elternfreigabe
  mit automatischer Elternverknüpfung, Termin und Fahrt anlegen, zwei Anfragen,
  gleichzeitige Bestätigung des letzten Platzes (genau eine Zusage),
  Fahrtinformationen für Eltern ohne Terminzugriff, fremde Nutzer ausgeschlossen
  und Elternbenachrichtigungen gespeichert.
- Lokale Datenbanktests prüfen Hin-/Rückfahrt, Fahrerwechsel, Absagen,
  Terminverschiebung/-löschung, Kenntnisnahme, direkte RLS-Zugriffe und Mail-Retries.
- Browserabnahme des Fahrtenbereichs: Angebot → Anfrage → Bestätigung,
  Eltern-Deep-Link und Elternkommentar erfolgreich. Deutsch/Englisch geprüft;
  390-Pixel-Ansicht ohne horizontalen Überlauf; sichtbarer Tastaturfokus;
  keine JavaScript-Seitenfehler. Screenshots: `output/carpools-2026-09-03/`.
- Worker ohne Geheimnis: HTTP 401 ohne Login-Redirect.
- Keine echten E-Mails versendet und keine Produktionsdaten verändert.
  Der lokale Schematest ersetzt keine Prüfung des gehosteten Supabase-Auth-
  Dienstes oder der tatsächlichen Provider-Zustellung.

### Elternfreigabe gegen das vollständige Testschema

Nach Aufbau der lokalen Schemakopie und Anwendung der beiden Fachmigrationen:

```sh
GUARDIAN_TEST_DATABASE_URL=postgres://<lokale-testzugangsdaten>/postgres \
CARPOOL_NATIVE_PG_MODULE=/absoluter/pfad/zu/pg/lib/index.js \
node --experimental-strip-types --test tests/guardian-database.test.mjs
```

Der Runner akzeptiert ausschließlich Loopback-Adressen. Standardmäßig laufen
alle Tests ohne externe Datenbank in einer frischen PGlite-Instanz.
