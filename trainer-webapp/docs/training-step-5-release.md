# Schritt 5 – Technischer Release-Nachweis

Datum: 23.09.2026. Branch: `codex/step-5-training`, Basis `a549ad7`.
Produktionscode der Basis: `add7cee`; die folgenden Basiscommits ändern nur Dokumentation.
Zielentität, Rollen, Ausschlüsse und ISO/IEC-25002-Abnahmekriterien stehen in
[Schritt 5](training-step-5.md). Die v2 mit Fahrerslider wurde vom Nutzer freigegeben.

## Implementierter Umfang

Eigene persönliche Pläne ohne Verein und unveränderliche Versionen; Sessions mit
festem Snapshot, eigenständiger Athletenidentität und separater handelnder Person.
Athleten erfassen Selbsttraining; Trainer wählen Einzelne oder eine Gruppe aus
aktiv zugeordneten Athleten. Die Gruppenkarten wechseln durch Wischen, Namen und
Pfeile. Versuche, Landungen, Rückgängig, tatsächliche Anwesenheit, Notizen und
Timer werden serverseitig gespeichert. Abschluss stoppt Timer und sperrt Änderungen.

Nur der verantwortliche Erfasser verwaltet seine Sessions; bei betreutem Training
müssen weiterhin alle Zuordnungen aktiv sein. Eine Vereinsrolle gewährt keine
zusätzlichen Rechte. Gruppenfremddaten werden nicht an Athleten ausgeliefert;
der persönliche Recap ist Schritt 6. Bestehende Freigaben und Videofunktionen
bleiben über die separate bisherige Ansicht erreichbar. Dortige lokale Entwürfe
werden ausdrücklich als solche bezeichnet; neue eigene Pläne entstehen im Hauptbereich.

Request-IDs verhindern Doppelzählung bei Wiederholung. Revision und Zeilensperre
verhindern stilles Überschreiben. Fehler behalten die Eingabe und bieten Wiederholen
oder Vergleich mit dem aktuellen Stand. Keine Offline-Synchronisierung.
Profilumbenennung bzw. vorhandene Kontoanonymisierung aktualisieren auch den Athletennamen.

## Technische Prüfung

Prüfversion: freigegebener Schritt-5-Code mit Migration
`20260923141926_step_5_training_sessions.sql`, Node 24, Next 16.2.12.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`: bestanden.
  Gesamtsuite: 150 Tests, keine Fehler und keine übersprungenen Tests.
- Elf Trainings-Datenbanktests in PGlite und nochmals in nativem PostgreSQL:
  Versionen/Snapshots, Berechtigungen/RLS, idempotente Wiederholung, echte parallele
  Transaktionen mit getrennten Verbindungen, Konflikte, Anwesenheit, Timer,
  Abschluss, ungültige Eingaben, Namensänderung, bestehende Organisationsfreigaben und vollständige Aggregation bei
  1500 Versuchen bestanden. Native Fixture läuft ausschließlich auf Loopback;
  `TRAINING_TEST_DATABASE_URL` und `TRAINING_NATIVE_PG_MODULE` aktivieren diesen Modus.
- Die vollständige neue Migration wurde gegen das aktuelle Supabase-Schema in
  `BEGIN … ROLLBACK` erfolgreich kompiliert. Ein zusätzlicher transaktionaler
  Funktionstest mit den echten RLS-Regeln prüfte persönlichen Plan samt Version,
  Sessionstart, Lesen und Abschluss erfolgreich; sämtliche Teständerungen wurden
  zurückgerollt. Dabei wurde eine bestehende rekursive Plan-/Freigabepolicy
  entdeckt und durch einen privaten, autorisierten Lookup ersetzt. Bestehende
  Organisations- und Sozialfreigaben bleiben berücksichtigt.
- Bestehende Kalender-, Fahrgemeinschafts-, Profil- und Freigabeprüfungen sind
  Teil der Gesamtsuite. Keine vollständige erneute fachliche Browserabnahme dieser Altbereiche.
- React-Review: unabhängige Datenabrufe parallel, serverseitige Autorisierung,
  abgeleiteter Notizstatus, bereinigtes Timerintervall und Eingabesicherungen geprüft.

Lokaler Browserprüfstand: tatsächliche Next-Anwendung und Trainings-SQL über
`tests/support/training-fixture-server.mjs`, synthetische Konten, simulierte
Supabase-Auth-/Directory-Antworten. Keine echten Nutzerdaten im Prüfstand.

- Selbsttraining: Plan speichern/starten, Landung und Fehlversuch (1/2, 50 %),
  Übungsnotiz, Timerstart, Neuladen mit weiterlaufendem Timer, Abschluss mit
  gestopptem Timer und gesperrten Aktionen bestanden.
- Trainergruppe bei 397 × 772: zwei tatsächlich anwesende Fahrer auswählen;
  Kim 1/1 (100 %), Alex 0/1 (0 %); Pfeile, Namen und horizontales Scrollen geprüft.
  Neuladen erhält beide Werte. Ohne Versuche erscheint keine Prozentquote.
  Notizentwurf sperrt Abschluss; bestätigtes Speichern gibt ihn wieder frei.
  Gruppentraining abgeschlossen und nach Reload mit gesperrten Aktionen geöffnet.
- Grenzen: kein reales Mobilgerät, kein Offlinebetrieb, kein Lasttest. Keine
  separate Staging-Abnahme und noch keine Nutzer-Praxisabnahme.

## Produktionsrelease

Vorheriger stabiler Stand: Deployment `dpl_EkWjWdv2ysYNF7Vh3D9JNXjTrw34`,
`trainer-webapp-em7ze0ote-vladi-sntlove.vercel.app`, Code `add7cee`.
Sicherungstag: `production/stable-before-step-5-training-20260923` auf `add7cee`,
vor Migration und Deployment zu origin gepusht. Neuer Deploymentnachweis folgt
nach Veröffentlichung. Bei kritischen Fehlern den vorherigen Vercel-Stand wieder
zuweisen; die additive Datenbankerweiterung bleibt erhalten, damit neu erfasste
Sessions bei einem App-Rollback nicht verloren gehen.

Supabase-Advisor vor Änderung: vorhandene Hinweise zu freigegebenen alten
Security-Definer-RPCs und deaktiviertem Passwort-Leak-Schutz; keine Änderung
an diesen Altbereichen in Schritt 5. Neue öffentliche RPCs sind Security Invoker,
privilegierte Schreibfunktionen liegen im privaten Schema mit expliziter Rechteprüfung.
[Advisor-Erläuterung](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Fachliche Praxisabnahme – offen

Der Nutzer prüft die [Praxisprüfliste](training-step-5.md#praxisprüfliste-für-den-nutzer)
mit seinem Athleten- und Trainerkonto, insbesondere reales Training, Wischen,
Zuordnungen, Fortsetzen und Abschluss. Technische Prüfung und erfolgreicher
Deploymentstatus ersetzen diese fachliche Bestätigung nicht.
