# Release 1: Preflight und Produktionsnachweis am 08.–09.09.2026

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

Prüfdatum: **08.–09.09.2026**, Node **24.20.0**, npm **11.19.0**,
Next.js **16.2.12**, natives PostgreSQL **17.6**.
Release-Basis: `0f318ffd401f58dfe9b9a65fa7699ada447df9e4`.
Der geprüfte Release-Stand `d737654db1bc900ccf45f3986cef53ba4675370c`
wurde auf `codex/fahrgemeinschaften-release` gesichert und am 09.09.2026 in das
bestehende Produktionsprojekt ausgerollt. Dieser Bericht dokumentiert die danach
erneut ausgeführten technischen Prüfungen und die weiterhin offenen Grenzen.

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
| Auf bestehender Produktions-URL bestätigt | Deployment `dpl_ebWN1FYCjqjEHqXV19nr1QmjSmvS` ist `READY`; der Alias zeigt darauf. Öffentliche Seiten antworten mit HTTP 200, geschützte Seiten mit 307 zum Login und der Mailworker ohne Nachweis mit 401. Der Supabase-Cron erreicht den Worker mit HTTP 200. |
| Noch durch den Nutzer bereitzustellen | Betreiber/Rechtsform, vollständige Anschrift, Kontakt und anwendbare Rechtstextangaben; anschließend fachliche Praxisabnahme mit Testkonten. |
| Kontrollierter Produktionsbetrieb | Technisch aktiviert für den vom Nutzer bestätigten kleinen Testpersonenkreis. Rechtstexte, allgemeiner Produktionsabsender, reguläre Posteingangszustellung und vollständige fachliche Praxisabnahme bleiben offen. |

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
`pg_net`-HTTP-Zustellung wurden am 09.09.2026 zusätzlich in Produktion geprüft;
die lokalen Verträge bleiben weiterhin unabhängig reproduzierbar.

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
- Der abschließende Lauf von `npm ci` meldet **8 Befunde: 1 moderat, 6 hoch,
  1 kritisch**. Der frühere Audit-Export nannte sieben hoch eingestufte Pakete:
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
| `NEXT_PUBLIC_APP_URL` | In Vercel Production vorhanden und exakt `https://trainer-webapp-ruby.vercel.app` |
| `RESEND_API_KEY` | In Vercel Production als nicht auslesbares Secret vorhanden; am 09.09.2026 mit dem erfolgreich geprüften Resend-Key aktualisiert |
| `RESEND_FROM_EMAIL` | In Vercel Production vorhanden; `onboarding@resend.dev` ist für den bestätigten Testempfänger zulässig, aber kein allgemeiner Produktionsabsender |
| `SUPABASE_SERVICE_ROLE_KEY` | In Vercel Production als nicht auslesbares Secret vorhanden; Quellprüfung bestätigt ausschließlich serverseitige Verwendung hinter `server-only` |
| `CARPOOL_CRON_SECRET` | In Vercel Production als nicht auslesbares Secret vorhanden; am 09.09.2026 aus dem sicher verglichenen Vault-Referenzwert aktualisiert |
| Vault `carpool_worker_url` | Ein Eintrag vorhanden; entschlüsselter Vergleich bestätigt exakt `https://trainer-webapp-ruby.vercel.app/api/carpools/mail` |
| Vault `carpool_cron_secret` | Ein Eintrag vorhanden; SHA-256-Vergleich gegen den sicher bereitgestellten Referenzwert erfolgreich, anschließend derselbe Wert ohne Ausgabe nach Vercel übertragen |
| Vault-Schreibmöglichkeit | Vault-Abfrage und entschlüsselte Vergleiche für die verbundene Rolle erfolgreich; keine geheimen Werte ausgegeben oder gespeichert |
| Supabase-Erweiterungen | Vault, `pg_cron` und `pg_net` am 09.09.2026 weiterhin verfügbar |
| Testempfänger | Nutzer hat am 08.09.2026 ausdrücklich einen Empfänger für je eine Elternfreigabe- und Fahrten-Testmail freigegeben; Adresse bleibt im privaten Auftrag |
| Tatsächliche Mailzustellung | Zwei ausdrücklich markierte synthetische Testmails am 09.09.2026 gesendet; beide von Resend angenommen, mit Status `delivered` gemeldet und vom Nutzer im Spamordner mit korrekten Verweisen bestätigt |
| Rechtstexte | Betreiber-/Anschrift-/Kontaktplatzhalter vorhanden; keine Angaben erfunden, Testempfänger nicht als Betreiber/Kontakt übernommen |
| Fachmigrationen | Am 09.09.2026 einzeln in der freigegebenen Reihenfolge angewandt und anschließend über Migrationshistorie und Katalogabfragen bestätigt |

Geprüfte Vercel-Production-Namen am 09.09.2026: `NEXT_PUBLIC_APP_URL`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` und
`CARPOOL_CRON_SECRET`. Zusätzlich vorhanden bleiben die beiden öffentlichen
Supabase-Variablen. Kein als geheim eingestufter Name beginnt mit
`NEXT_PUBLIC_`; Quell- und Konfigurationsprüfung ergaben keine Übergabe der
Server-Schlüssel an Clientcode. Vercels Secret-Werte sind absichtlich nicht
auslesbar. Für den Cron-Nachweis wurde deshalb der sicher bereitgestellte
Vault-Referenzwert kryptografisch verglichen und anschließend ohne Klartextausgabe
als Vercel-Production-Secret gesetzt.

### Resend-Versandnachweis vom 09.09.2026

Vor dem Versand wurde bestätigt, dass der Testempfänger der E-Mail-Adresse des
Resend-Kontos entspricht. Damit ist `onboarding@resend.dev` für diesen
eingeschränkten Test zulässig. Ein zunächst falsch im lokalen Schlüsselbund
hinterlegter Wert führte zu zwei abgewiesenen HTTP-401-Anfragen; Resend erzeugte
dabei keine Nachrichten. Nach Korrektur wurde der gültige Schlüssel ohne Ausgabe
nach Vercel übertragen und genau zwei synthetische Nachrichten erzeugt:

| Testnachricht | Resend-Nachrichten-ID | Providerzeitpunkt | Statusprüfung |
| --- | --- | --- | --- |
| `[TEST] Trainer Hub – synthetische Elternfreigabe` | `a3b0f423-611a-4eff-a264-402893ba3ca5` | 09.09.2026, 08:25:05 UTC / 10:25:05 Berlin | `delivered`, zuletzt geprüft um 08:27:34 UTC |
| `[TEST] Trainer Hub – synthetische Fahrgemeinschaft` | `340caabd-81a7-4870-9e87-4d22d02aeb74` | 09.09.2026, 08:25:06 UTC / 10:25:06 Berlin | `delivered`, zuletzt geprüft um 08:27:34 UTC |

Beide Nachrichten verwenden ausschließlich kontrollierte Testnamen und
tokenlose Testlinks. Es wurde keine Registrierung erzeugt, keine Fahrt angelegt
und kein produktiver Datensatz verwendet. Der Nutzer bestätigte am 09.09.2026
um 08:32 UTC / 10:32 Berlin den Empfang beider Nachrichten im Spamordner sowie
die korrekten Verweise. Die technische Empfangsprüfung ist damit abgeschlossen;
die Spam-Einstufung bleibt ein Befund für die spätere Produktionsfreigabe.

Bekannte Grenzen: Resends Status `delivered` belegt die Annahme durch den
Empfangsserver; der Nutzer hat die sichtbare Zustellung in diesem Prüfkontext
zusätzlich bestätigt. Beide Nachrichten landeten jedoch im Spamordner, sodass
dieser Test keine reguläre Posteingangszustellung oder allgemeine Zustellbarkeit
belegt.
Der Direktversand prüft Resend-Zugang, Absender und Empfänger. Mailworker,
Scheduler und `pg_net` wurden danach technisch über einen authentifizierten
Produktionsaufruf mit HTTP 200 bestätigt; mangels wartender Fachnachricht wurde
dabei keine weitere E-Mail erzeugt. `onboarding@resend.dev` ist außerhalb des
bestätigten Kontoinhabers kein allgemeiner Produktionsabsender. Die fehlenden
Betreiber-, Anschrift- und Kontaktdaten blockieren die Rechtstexte weiterhin.

### Produktiver Rollout und sichtbarer Stand am 09.09.2026

Rollout und Read-only-Prüfung am 09.09.2026 um **08:48–08:52 UTC /
10:48–10:52 Berlin**:

- `/login` und `/login?mode=register`: HTTP 200.
- `/kalender`, `/fahrgemeinschaften`, `/einstellungen`: HTTP 307 zum Login.
- `/elternfreigabe`, `/impressum`, `/datenschutz` und `/nutzungsbedingungen`:
  HTTP 200; `/api/carpools/mail` ohne Cron-Nachweis: HTTP 401.
- Vercel löst `trainer-webapp-ruby.vercel.app` zu
  **`dpl_ebWN1FYCjqjEHqXV19nr1QmjSmvS`**, Status **READY**, Target
  **production** auf.
- Der frische Sicherungstag
  **`production/stable-before-release-1-2026-09-09`** zeigt lokal und auf
  `origin` auf den vorherigen Produktionsquellstand `5618210`.
- Die Migrationen wurden einzeln und ohne pauschales `db push` angewandt:
  `20260901113922_add_guardian_registration_approval.sql`,
  `20260903080920_carpool_release.sql`, danach
  `20260903082255_carpool_mail_schedule.sql`. Supabase protokolliert sie als
  `20260909084726_add_guardian_registration_approval`,
  `20260909084745_carpool_release` und
  `20260909084804_carpool_mail_schedule`.
- Tabellen, RPCs und RLS wurden nach jeder Fachmigration geprüft. Genau ein
  aktiver Job `carpool-mail-every-minute` läuft jede Minute. Die ersten drei
  geprüften `pg_net`-Antworten um 08:49, 08:50 und 08:51 UTC hatten HTTP 200,
  keinen Timeout und keinen Transportfehler.

Es wurden keine realen Registrierungen abgeschickt und keine Fahrt angelegt.
Der technische Produktionsnachweis verwendet keine Minderjährigen-, Nutzer-
oder Fahrtdaten.

Die Supabase-Sicherheitsprüfung meldet für die beiden privaten Tabellen RLS ohne
Policy; das ist beabsichtigt, weil Browserrollen sämtliche Rechte entzogen sind
und ausschließlich `service_role` die Mailwarteschlange verarbeitet. Die beiden
tokengebundenen Elternfreigabe-RPCs werden absichtlich anonym angeboten und geben
nur den kontrollierten Minimalumfang aus. Weitere Security-Definer- und
Passwortschutz-Hinweise sowie Performance-Hinweise werden als gesonderte
Härtungsarbeit bewertet. Der Produktionsstart fügt keine nicht dokumentierte
Policy-Ausnahme hinzu.

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

Stand der Freigabeschritte am 09.09.2026:

1. **Offen:** Betreiberangaben und Rechtstexte vervollständigen und
   fachlich/rechtlich prüfen.
2. **Erledigt:** Mail-, Service- und Cron-Konfiguration in Vercel sowie URL und
   Cron-Wert im Supabase Vault ohne Ausgabe geheimer Werte geprüft.
3. **Erledigt:** Genau zwei synthetische Testmails gesendet; Providerstatus und
   Empfang samt Links bestätigt. Die Spam-Einstufung bleibt dokumentiert.
4. **Technisch erledigt:** Auf dem endgültigen Release-Stand Lockfile-Installation,
   Typprüfung, Lint, 104 Tests, Build, Release-Buildprüfung und 27 native
   PostgreSQL-Prüfungen bestanden. Abhängigkeitsbefunde und die fachliche
   Praxisabnahme bleiben offen.
5. **Erledigt:** Vorherigen Produktionsquellstand mit
   `production/stable-before-release-1-2026-09-09` gesichert und Tag gepusht.
6. **Erledigt:** Die drei freigegebenen Migrationen einzeln in der dokumentierten
   Reihenfolge angewandt; kein pauschales `db push` ausgeführt.
7. **Erledigt:** Direkt in das bestehende Vercel-Produktionsprojekt deployt;
   `READY` und Alias `trainer-webapp-ruby.vercel.app` bestätigt.

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

Aktueller Quell-Rollback: frischer Tag
**`production/stable-before-release-1-2026-09-09`** →
`561821018585d491767f2c344685e93b648920e3`.
Direktes Vercel-Rollbackziel für den vorherigen Stand:
**`dpl_DW277V4vpV6FW3HrgayG4beoEZM2`**.
Der Tag wurde lokal und auf `origin` bestätigt. Das aktuelle produktive Deployment
ist `dpl_ebWN1FYCjqjEHqXV19nr1QmjSmvS`; vor einem späteren Deployment ist dieser
dann stabile Stand erneut zu sichern.

Ein Code-Rollback entfernt keine bereits erzeugten Registrierungs-/Fahrtdaten.
Neue Tabellen und Spalten nicht destruktiv zurückbauen. Falls die bereits
angewandte Registrierungsmigration selbst fehlerhaft wäre, reicht ein reiner
Vercel-Rollback nicht aus: geänderte Trigger und die Rückwärtskompatibilität der
Registrierung müssen vor produktiver Aktivierung einen geprüften Rückfallplan
besitzen. Dieser gehostete Rückfallnachweis ist noch offen.

Technische lokale und produktive Abnahme: **bestanden für den oben beschriebenen
kontrollierten Kontext**. Echter Mailweg: **bestätigt, mit Spam-Befund**.
Fachliche Nutzerabnahme und vollständige Rechtstexte: **offen**.
