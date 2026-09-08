# Release 1: Preflight und Abnahme am 08.09.2026

## Umfang und Qualitätsauftrag vor der Umsetzung

Zielentität: Trainer Hub, Release-Artefakt auf `codex/fahrgemeinschaften-release`,
seine drei Migrationen und Transaktionsmails. Ausgangsversion: `0f318ff`.
Nutzungskontext: mobile und Desktop-Webnutzung durch erwachsene Fahrer, Athleten,
registrierende Minderjährige ab 13 Jahren und aktiv verknüpfte Eltern.

Ziel: reproduzierbare Installation unter Node 24, sichere Registrierung und
Elternfreigabe sowie verlässliche unabhängige Hin- und Rückfahrten.
Fachlicher Umfang: Registrierung/Elternfreigabe, Fahrgemeinschaften, Mails,
zugehörige Rechtstexte und Release-Infrastruktur. Ausgeschlossen: spätere
Roadmap-Pakete, fremde Änderungen, neue Marken, zusätzliche Vercel-Projekte
und dauerhaft verwendete Vorschauadressen.

Verbindliche öffentliche Adresse: https://trainer-webapp-ruby.vercel.app.
Der lokale Worktree ist ausschließlich eine technische Isolation.

| Qualitätsmerkmal | Verfahren und Abnahmekriterium |
| --- | --- |
| Funktionale Eignung | Registrierung, Elternfreigabe, unabhängige Fahrtrichtungen, Fahrerwechsel, Absagen und Terminänderungen bestehen die zugehörigen Tests. |
| Sicherheit | RLS und RPC verweigern unberechtigten Zugriff; ungültiger Cron-Nachweis wird abgewiesen; keine Servergeheimnisse in Browser-Artefakten. |
| Zuverlässigkeit / Datenintegrität | Native getrennte PostgreSQL-Verbindungen bestätigen beim letzten Platz genau eine Anfrage; Wiederholungen bleiben idempotent. |
| Wartbarkeit / Reproduzierbarkeit | Lockfile-Installation, Typprüfung, ESLint, vollständige Tests, Build und Diff-Prüfung erfolgreich; neue Prüfwerkzeuge kommentiert. |
| Dienstqualität | Tatsächliche Mailzustellung und produktive Alias-Zuordnung nachgewiesen, bevor der produktive Ablauf als bestätigt gilt. |
| Nutzungsqualität | Nutzer führt die vorbereitete fachliche Praxisabnahme aus; technische Tests ersetzen sie nicht. |

Die Kriterien sind der konkrete Prüfauftrag, keine zusätzlichen ISO-Grenzwerte
und keine ISO-Zertifizierung. Lokale Fixture, isolierte native Datenbank,
gehostetes Staging und bestätigter Produktionsbetrieb werden getrennt bewertet.

## Ergebnis und geprüfter Stand

Prüfdatum: **08.09.2026**, Node **24.20.0**, npm **11.19.0**,
Next.js **16.2.12**, natives PostgreSQL **17.6**.
Release-Basis: `0f318ffd401f58dfe9b9a65fa7699ada447df9e4`.
Die Ergänzungen dieses Preflights werden ausschließlich lokal auf
`codex/fahrgemeinschaften-release` gesichert; **kein Push, kein Deployment**.
Der zugehörige Commit ist über diesen Bericht in der Git-Historie identifizierbar.

Worktree:
`/Users/vladislavhirschfeld/Documents/Trainer App.worktrees/release-1-2026-09-08`.
Der veraltete Git-Worktree-Eintrag `/private/tmp/trainer-hub-carpools-release`
verwies auf eine fehlende `.git`-Datei. `git worktree prune --dry-run` zeigte
nur diesen veralteten Eintrag; anschließend wurde nur die Git-Verwaltung bereinigt.
Die dort verbliebenen Dateien und das unsaubere ursprüngliche Arbeitsverzeichnis
wurden nicht verändert. Der vorhandene Release-Branch wurde frisch ausgecheckt.

Vergleich zur stabilen Produktionsbasis `5618210`: Der bestehende Release-Commit
enthält 59 Dateien für Elternfreigabe, Fahrgemeinschaften, Mails, Rechtstexte und
Release-Dokumentation. Fremde Auswertungsänderungen und lokal abweichende
Framework-Versionen wurden nicht übernommen. Ausschließlich die im Auftrag
verbindliche Roadmap und der ISO-Leitfaden wurden aus dem Hauptverzeichnis als
bestätigte Planungsgrundlage übernommen; spätere Produktpakete wurden nicht geändert.

Änderungen dieses Preflights:

- Node-Laufzeit über `.nvmrc` und `engines.node=24.x` festgelegt; Lockfile konsistent.
- `server-only` schützt nun auch den Fahrten-Mailworker vor Client-Importen.
- Neue Tests wenden alle drei Migrationen einzeln in Transaktionen an und prüfen
  Scheduler, Vault-Zugriffe und den gemeinsamen Ablauf von Registrierung,
  Elternverknüpfung, Fahrt, konkurrierender Zusage und Elternsicht.
- `npm run test:release:native` startet zwei frische lokale PostgreSQL-Cluster;
  `npm run test:release:build` baut mit synthetischen Testgeheimnissen und prüft
  ausgelieferte Browserdateien, Login-Weiterleitungen und den Worker per HTTP.
- Schemafixture vom aktuellen Produktionsschema ohne Nutzerdaten versioniert;
  generierte Prüfausgaben bleiben unter `output/` und sind von Git ausgeschlossen.

## Getrennte Nachweisstufen

| Stufe | Status und aktueller Nachweis |
| --- | --- |
| Im Code vorhanden | Elternfreigabe, Registrierung ab 13, Fahrgemeinschaften, Mailworker, Rechtstextentwürfe und drei Migrationen vorhanden. |
| Technisch lokal geprüft | Saubere Lockfile-Installation, Typprüfung, ESLint, 104/104 Tests, Produktionsbuild, HTTP-Prüfungen und `git diff --check` erfolgreich. |
| Auf isolierter Datenbank geprüft | 16/16 native Fahrgemeinschaftstests; 5/5 Migrations-/Scheduler-/Integrationsprüfungen auf der Schemakopie; danach 6/6 Registrierungstests auf derselben Kopie. |
| Gehostetes Staging geprüft | **Nicht bestätigt.** Keine neue gehostete App/Preview und keine neue Supabase-Instanz angelegt. |
| Auf bestehender Produktions-URL bestätigt | Bestehende Login-/Registrierungsseite HTTP 200; geschützte Seiten leiten mit 307 zum Login; Alias zeigt auf das bisherige READY-Deployment. Keine neue Registrierung abgeschickt und keine Fahrt angelegt. |
| Noch durch den Nutzer bereitzustellen | Betreiber/Rechtsform, Anschrift, Kontakt und anwendbare Rechtstextangaben; verifizierter Resend-Absender, Resend-Key und Supabase-Service-Role-Key über sichere Dienstkonfiguration. |
| Für Produktion blockiert | Fehlende Mail-/Serverkonfiguration, nicht nachgewiesene reale Zustellung, unvollständige Rechtstexte sowie noch offene fachliche und gehostete Abnahme. |

### Pflichtprüfungen

| Prüfung | Ergebnis | Lokaler Nachweis in `output/release-1-2026-09-08/` |
| --- | --- | --- |
| Exakte Lockfile-Installation, erneut nach den Änderungen | Erfolgreich, 358 Pakete; Lockfile unverändert durch `npm ci` | `final-npm-ci.log` |
| Typprüfung | Erfolgreich | `final-typecheck.log` |
| ESLint | Erfolgreich | `final-lint.log` |
| Vollständige Tests | **104/104**, keine übersprungenen Tests | `final-tests.log` |
| Produktionsbuild | Erfolgreich; im Build-Prüfskript enthalten | `final-build.log` |
| Diff-Prüfung | Erfolgreich | `git-diff-check.log` |
| Alle drei Release-Migrationen | In richtiger Reihenfolge auf PGlite und nativem Schemaexport erfolgreich | `final-tests.log`, `final-native.log` |
| RLS/Berechtigungen | Gesperrte Minderjährige, fremde Konten, Elternsicht und direkte Schreibversuche geprüft | dieselben Logs |
| Letzter freier Fahrtplatz | Zwei getrennte native Verbindungen: genau eine erfolgreiche Zusage; Gegenfall `CARPOOL_FULL` | `final-native.log` |
| Hin-/Rückfahrt | Unabhängige Buchungen bei verschiedenen Fahrern geprüft | `final-native.log` |
| Fahrerwechsel/Absage/Terminänderung/Platzfreigabe | Zugehörige Szenarien und Revisionsprüfung erfolgreich | `final-native.log` |
| Mail-Endpunkt ohne gültiges Geheimnis | HTTP 401 ohne Login-Redirect bei fehlendem Geheimnis/Header, falschem und gleich langem falschem Token sowie bei Login-Cookie | `final-build.log` |
| Gültiges Cron-Geheimnis bei fehlenden Diensten | Kontrolliertes HTTP 503 ohne interne Fehlerdetails | `final-build.log` |
| Geheimnisse im Browser | Keine der drei Server-Key-Bezeichnungen oder synthetischen Testwerte in **51** Browserdateien und geprüften HTTP-Antworten | `final-build.log` |

Die Suite testet das tatsächliche Next.js-Produktionsbuild lokal. Ihre öffentlichen
Supabase-Werte zeigen bewusst auf eine lokale Fixture-Adresse. **Dieses `.next`-
Verzeichnis darf nicht produktiv hochgeladen werden.** Nach Einrichtung aller
Voraussetzungen ist aus demselben freigegebenen Quellstand mit den echten
öffentlichen Produktionswerten ein neues Artefakt zu bauen und erneut zu prüfen.

### Datenbankschema und Grenzen

Die Schemakopie wurde am 08.09.2026 über read-only Katalogabfragen aus
`lglmlktrngmrimvhwxab` erstellt: **31 Anwendungstabellen, 59 Funktionen,
107 Policies**, Indizes, Tabellen-/Spalten-/Funktions- und Schema-Grants.
Quelle: gehostetes PostgreSQL `17.6.1.127`.
Fixture: `tests/fixtures/release-production-base.sql`.
SHA-256: `77dd3215261125ea065e01290be74683760442390457cad593d4fb22238ff422`.

Es wurden keine Nutzer-, Fahrt-, Mail- oder sonstigen Geschäftsdaten exportiert.
`auth.users`/`auth.uid()` sind lokale Verträge; der gehostete Auth-Dienst wird damit
nicht nachgebildet. Natives PostgreSQL verwendet echtes `pgcrypto`; PGlite nutzt
nur hierfür dokumentierte Testfunktionen. Supabase Vault, `pg_net` und `pg_cron`
werden lokal durch ausdrücklich markierte Verträge ersetzt. Der echte Scheduler-
Funktionskörper wird ausgeführt und URL/Header/Timeout geprüft; es gibt dabei
keinen Netzwerkversand. Reale Vault-Verschlüsselung, Cron-Zeitsteuerung und
`pg_net`-HTTP-Zustellung sind deshalb **noch nicht abgenommen**.

Die Browser-Artefaktprüfung ist ein aktueller Nachweis für diesen Build und
ersetzt keine erneute Prüfung nach Änderungen. Eine neue visuelle Browserabnahme
wurde nicht bestätigt: Die Browsersteuerung scheiterte beim Öffnen der
Produktionsanmeldung mit einem Steuerungs-Timeout. HTTP- und SQL-Prüfungen
sind davon unabhängig erfolgreich. Der visuelle Nachweis vom 03.09. ist historisch.

### Aufgeklärte Prüffehler und vorhandene Abhängigkeitsbefunde

- Python-HTTPS schlug wegen des lokalen Zertifikatsspeichers fehl. Downloads
  erfolgten anschließend mit validierender TLS-Verbindung über `curl`; die
  Node-Distribution wurde zusätzlich gegen die offiziellen SHA-256-Werte geprüft.
- Der zunächst direkt verwendete Vercel-CLI-Zugang lieferte HTTP 403. Die reguläre
  CLI erneuerte die bestehende Anmeldung; die Produktionsvariablen konnten danach
  erfolgreich gelesen werden. Keine Zugangserweiterung erforderlich.
- Der neue PGlite-Migrationstest verwendete anfangs die Prepared-Statement-API
  für mehrere SQL-Anweisungen. Korrigiert auf `transaction(...exec(sql))`;
  sämtliche betroffenen Tests danach erfolgreich wiederholt.
- Die neue Vollschema-Fixture versuchte zuerst eine Athletenmitgliedschaft auf
  Bundesebene. Die bestehende Rollenprüfung wies sie korrekt ab. Die Fixture
  bildet jetzt Bund → Land → Verein ab; das Datenmodell blieb unverändert.
- `npm ci`/`npm audit` melden **7 Pakete mit hoher Einstufung**:
  brace-expansion, browserslist, js-yaml, nanoid, next (transitiv), postcss und sharp.
  Jeder betroffene installierte Versionsstand ist bereits bytegleich im Lockfile
  der stabilen Basis `5618210` vorhanden. Das sind keine neuen Release-1-Fehler.
  Details/Advisory-Links stehen in `npm-audit.json`. Kein pauschales `npm audit fix`
  und kein Framework-Upgrade durchgeführt, weil nur eindeutig zu Release 1
  gehörende Fehler freigegeben sind. Diese Befunde benötigen eine gesonderte
  Bewertung/Upgrade-Freigabe vor der abschließenden Produktionsentscheidung.

## Produktions-Preflight

Vercel-Projekt: `prj_gbtl2HFkydU6aNoJj3Av3IwaDR96`, Team
`team_JWyj3mh4MytKe5MmvsFAPbvB`, Laufzeit **24.x**.
Die vorhandene Projektverknüpfung wurde nur in den lokalen Worktree übernommen.
Es wurde kein neues Projekt verknüpft oder erzeugt.

| Voraussetzung | Aktueller Stand |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | In Vercel Production vorhanden |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | In Vercel Production vorhanden |
| `NEXT_PUBLIC_APP_URL` | Fehlt; freigegebener Wert ist `https://trainer-webapp-ruby.vercel.app` |
| `RESEND_API_KEY` | Fehlt in Vercel; lokal kein Versand-Key verfügbar |
| `RESEND_FROM_EMAIL` | Fehlt; kein verifizierter Absender nachgewiesen |
| `SUPABASE_SERVICE_ROLE_KEY` | Fehlt; der verfügbare Connector liefert nur öffentliche Schlüssel |
| `CARPOOL_CRON_SECRET` | Fehlt; vor Freigabe neu generieren und sicher konfigurieren |
| Vault `carpool_worker_url` | Fehlt; Sollwert `https://trainer-webapp-ruby.vercel.app/api/carpools/mail` |
| Vault `carpool_cron_secret` | Fehlt; muss identisch zum Vercel-Wert sein |
| Vault-Schreibmöglichkeit | `vault.create_secret(text,text,text,uuid)` vorhanden und für die verbundene Rolle ausführbar; noch keine Gleichheit realer Werte prüfbar |
| Supabase-Erweiterungen | `supabase_vault 0.3.1`, `pg_cron 1.6.4`, `pg_net 0.20.3` vorhanden |
| Testempfänger | Nutzer hat am 08.09.2026 ausdrücklich einen Empfänger für je eine Elternfreigabe- und Fahrten-Testmail freigegeben; Adresse bleibt im privaten Auftrag |
| Tatsächliche Mailzustellung | **Nicht ausgeführt**, weil Key und verifizierter Absender fehlen; keine echte E-Mail gesendet |
| Rechtstexte | Betreiber-/Anschrift-/Kontaktplatzhalter vorhanden; keine Angaben erfunden, Testempfänger nicht als Betreiber/Kontakt übernommen |
| Fachmigrationen | Alle drei neuen Migrationen fehlen noch in der Produktionshistorie; unverändert gelassen |

Die funktionierende Vault-API belegt, dass derselbe Cron-Wert technisch abgelegt
werden kann. Ohne reale Konfiguration und Versandtest ist damit weder
Wertgleichheit noch funktionierender Mailbetrieb behauptet.

### Was auf der einzigen maßgeblichen Adresse sichtbar ist

Read-only-Prüfung am 08.09.2026 um **18:29 UTC / 20:29 Berlin**:

- `/login` und `/login?mode=register`: HTTP 200.
- `/kalender`, `/fahrgemeinschaften`, `/einstellungen`: HTTP 307 zum Login.
- `/elternfreigabe`, `/impressum`, `/api/carpools/mail`: ebenfalls Login-Redirect
  im bisherigen Produktionsstand. Dies bestätigt **keine** aktive Release-1-Funktion.
- Vercel löst `trainer-webapp-ruby.vercel.app` weiterhin zu
  **`dpl_DW277V4vpV6FW3HrgayG4beoEZM2`**, Status **READY**, Target **production** auf.

Es wurden keine realen Registrierungen abgeschickt, keine Fahrten angelegt,
keine Produktivmigrationen angewandt und kein Deployment ausgelöst.

## Wiederholbare technische Prüfung

Im Release-Worktree unter `trainer-webapp`:

```sh
nvm use
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:release:build
git diff --check
```

`test:release:build` führt einen weiteren Produktionsbuild mit synthetischen
Testwerten aus. Nicht auf Vercel deployen; öffentliche Buildwerte sind lokale
Fixture-Werte. Die Ports 3108, 55439 und 55440 müssen frei sein.

Native Testwerkzeuge separat installieren; sie sind keine App-Laufzeitabhängigkeit:

```sh
RELEASE_TOOLS_DIR="$(mktemp -d /tmp/trainer-release-tools.XXXXXX)"
npm install --prefix "$RELEASE_TOOLS_DIR" --save-exact embedded-postgres@17.6.0-beta.15 pg@8.16.3
RELEASE_NATIVE_POSTGRES_MODULE="$RELEASE_TOOLS_DIR/node_modules/embedded-postgres/dist/index.js" \
CARPOOL_NATIVE_PG_MODULE="$RELEASE_TOOLS_DIR/node_modules/pg/lib/index.js" \
npm run test:release:native
```

Der Runner erstellt frische Cluster auf Loopback, stoppt sie auch bei Fehlern
und lässt synthetische Daten nur für die lokale Diagnose zurück. Er berührt
keine bereits vorhandene lokale oder produktive Datenbank.

## Produktionsfreigabe und fachliche Praxisabnahme

Vor der Veröffentlichung noch erforderlich, in dieser Reihenfolge:

1. Betreiberangaben und Rechtstexte vervollständigen und fachlich/rechtlich prüfen.
2. Resend-Key, verifizierten Absender, Service-Role-Key, festgelegte App-URL und
   neuen Cron-Wert sicher in **diesem** Vercel-Projekt konfigurieren; denselben
   Cron-Wert und die Worker-URL in Vault hinterlegen, Gleichheit ohne Ausgabe prüfen.
3. An den im Auftrag freigegebenen Empfänger je eine echte Elternfreigabe- und
   Fahrten-Testmail senden; Provider-Zustellung und Empfang/Links bestätigen.
   Keine produktive Minderjährigenmigration, solange dieser Nachweis fehlt.
4. Vorhandene Abhängigkeitsbefunde gesondert bewerten; offene Release-Blocker
   schließen. Auf dem endgültigen Quell-/Buildstand alle Pflichtprüfungen erneut
   ausführen. Eine Prüfung mit gehostetem Auth/PostgREST ist noch vorzubereiten,
   ohne eine zusätzliche dauerhaft verwendete App-Adresse einzuführen.
5. Den dann aktuellen stabilen Produktionsstand frisch mit eindeutigem Tag
   sichern; nur freigegebene Release-Dateien committen/pushen. Vor einem Push
   beachten, dass die Git-Verknüpfung automatisch Preview-Deployments auslösen
   kann; keine zusätzliche dauerhaft verwendete Vorschauadresse etablieren.
6. Migrationen einzeln in dieser Reihenfolge anwenden:
   `20260901113922_add_guardian_registration_approval.sql`,
   `20260903080920_carpool_release.sql`,
   `20260903082255_carpool_mail_schedule.sql`.
   **Kein pauschales `db push` aller historischen Dateien:** lokale historische
   Versionsnamen weichen zum Teil von der gehosteten Migrationshistorie ab.
7. Direkt auf das bestehende Produktionsprojekt deployen, `READY` und Alias
   `trainer-webapp-ruby.vercel.app` zum neuen Deployment bestätigen; bei kritischem
   Fehler auf den gesicherten Stand zurückrollen.

Der Nutzer übernimmt danach die fachliche Praxisabnahme. Für jede Zeile Datum,
Version/Deployment und Ergebnis separat festhalten; derzeit **alles noch offen**:

- [ ] Erwachsener registriert sich vollständig, bestätigt Dokumente und kann die
  vorgesehenen Funktionen nach Organisationsfreigabe nutzen.
- [ ] Minderjährige ab 13 bleiben bis zur Elternfreigabe gesperrt; unter 13 wird
  die Registrierung abgelehnt; falsche/unvollständige Angaben werden verständlich erklärt.
- [ ] Elternmail kommt an; Link zeigt passende Dokumentversionen; Zustimmung,
  Ablehnung, erneuter/abgelaufener Link und gegebenenfalls erneuter Versand passen.
- [ ] Volljähriger Fahrer legt ein Angebot mit Fahrberechtigungsbestätigung an;
  Athlet fragt an; Anfrage verbraucht noch keinen Platz; Fahrer bestätigt.
- [ ] Hin- und Rückfahrt lassen sich unabhängig und bei verschiedenen Fahrern buchen.
- [ ] Eltern sehen ausschließlich relevante Fahrten ihres verknüpften Kindes;
  fremde Kinder, Termine, Fahrten und Buchungsaktionen bleiben geschützt.
- [ ] Fahrerwechsel, Fahrtdatenänderung, Terminverschiebung und Absage sind
  verständlich; erforderliche Bestätigungen erscheinen und Plätze werden freigegeben.
- [ ] Fahrtenmails, In-App-Hinweise und Benachrichtigungseinstellungen passen;
  keine Treffpunktadresse in E-Mails und geschützte Links führen zur richtigen Fahrt.
- [ ] Mobilansicht, deutsche/englische Texte und Tastaturbedienung sind in der
  tatsächlichen Nutzung nachvollziehbar.

## Rollback und Abschlussgrenze

Aktueller Quell-Rollback: Tag
**`production/stable-before-carpools-2026-09-03`** →
`561821018585d491767f2c344685e93b648920e3`.
Aktuelles direktes Vercel-Rollbackziel:
**`dpl_DW277V4vpV6FW3HrgayG4beoEZM2`**.
Der Tag wurde lokal und auf `origin` gefunden. Sein ursprünglicher Bericht
belegt den bytegenauen Vergleich von 215 versionierten Dateien mit dem Deployment;
die aktuelle Alias-Prüfung bestätigt, dass dieses Deployment weiterhin produktiv ist.
Vor einem späteren Deployment ist der dann aktuelle Stand erneut zu sichern.

Ein Code-Rollback entfernt keine bereits erzeugten Registrierungs-/Fahrtdaten.
Neue Tabellen und Spalten nicht destruktiv zurückbauen. Falls die bereits
angewandte Registrierungsmigration selbst fehlerhaft wäre, reicht ein reiner
Vercel-Rollback nicht aus: geänderte Trigger und die Rückwärtskompatibilität der
Registrierung müssen vor produktiver Aktivierung einen geprüften Rückfallplan
besitzen. Dieser gehostete Rückfallnachweis ist noch offen.

Technische lokale Abnahme: **bestanden für den oben beschriebenen Kontext**.
Fachliche Nutzerabnahme, echter Mailweg und Produktionsfreigabe: **offen/blockiert**.
