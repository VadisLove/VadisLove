# Schritt 11: Familienübersicht und Teilnahmeorganisation

Stand: 24.09.2026. Teilumfang lokal implementiert und geprüft; noch nicht veröffentlicht. Fachliche Praxisabnahme offen.
Basis: veröffentlichter Schritt 6 (`8aa88a3`), isolierter Branch
`codex/step-11-family`. Schritte 7–10 werden parallel bearbeitet.

## Bestätigte Entscheidungen

- Eltern können mehrere Kinder ohne eigenen Login anlegen. Sie bestätigen ihre
  Sorgeberechtigung selbst; eine Vereinsverwaltung muss dies nicht freigeben.
- Vorhandene aktive Elternbeziehungen aus dem Bestätigungslink werden verwendet.
  Eine selbst eingetragene E-Mail oder Benachrichtigungseinstellung ersetzt keine
  Verknüpfung zu einem bereits bestehenden Kinderprofil.
- Eltern dürfen für jedes verknüpfte Kind Termine zu- und absagen. Handelnde Person
  und betroffenes Kind werden getrennt gespeichert; die eigene Teilnahme der
  Eltern bleibt unverändert.
- Erster Umfang: Kinderübersicht, offene Terminaufgaben und Rückmeldungen.
  Abwesenheitszeiträume, Wartelisten und Fahrtenbuchungen im Namen des Kindes folgen
  separat. Vereinsseitige Kinderanlage gehört nicht zum ersten Teilpaket.

## Ziel und Qualitätsrahmen

Zielentität: dauerhafte Athletenidentität, Elternbeziehung und Terminrückmeldung.
Nutzungskontext: aktive angemeldete Eltern im Browser, mobil und Desktop; mehrere
Kinder und gegebenenfalls mehrere Sorgeberechtigte. Trainer sehen die korrekten
Teilnehmer im vorhandenen Kalender.

Qualitätsmerkmale nach ISO/IEC 25002: funktionale Richtigkeit, Vertraulichkeit,
Datenintegrität, Nachvollziehbarkeit, Verständlichkeit und Wartbarkeit.
Prüfverfahren: isolierte SQL-Tests der echten Migration mit Positiv-/Negativfällen,
gezielte Fachtests, Typprüfung, Lint und Build; anschließende mobile Browserprüfung.
Abnahmekriterien: zwei Kinder getrennt anlegen/anzeigen; bestehende Verknüpfungen
verwenden; Rückmeldungen persistieren und beeinflussen ausschließlich das gewählte
Kind; keine fremden Kinder-/Gruppendaten; entzogene Beziehungen entziehen Zugriff;
Elternkontolöschung löscht keine Athletenhistorie. Eindeutige Erfolgs-/Fehleranzeige.
Keine neuen Leistungsgrenzwerte vereinbart.

Die Terminberechtigung neu angelegter Kinder ist zur Klärung vorgelegt. Bis zur
Antwort werden die davon abhängigen Mutationen nicht umgesetzt.

## Praxisprüfliste (Nutzer, nach technischer Prüfung)

- Zwei Kinder anlegen, neu laden, Namen und getrennte Karten prüfen.
- Ein bereits über den Bestätigungslink verknüpftes Kind erscheint ebenfalls.
- Für Kind A zusagen und für Kind B absagen; neu laden und die Teilnehmerliste
  als Terminersteller prüfen. Eigene Elternteilnahme bleibt unverändert.
- Offene Rückmeldungen/Terminänderungen bearbeiten; abgesagte Termine erkennen.
- Zweites Elternkonto und fremdes Konto prüfen; eine entzogene Beziehung darf
  keinen weiteren Zugriff ermöglichen.
- Auf dem Mobilgerät Formulare, Schaltflächen und lange Namen prüfen.

## Lokaler Nachweis · 24.09.2026

Version: Branch `codex/step-11-family`, Basis `8aa88a3`, lokale Migration
`20260924210421_step_11_family.sql`; noch kein Releasecommit.

Implementiert: mehrere Kinder ohne Login, aktive bestehende Elternbeziehungen,
zusätzliche Sorgeberechtigte über einen einmaligen, an die bestätigte Konto-E-Mail
gebundenen Einladungslink (zum Weitergeben, kein neuer Mailversand), Familienansicht
in DE/EN, offene Aufgaben, stellvertretende Antworten und Kenntnisnahmen für
bestehende Einladungen von Kindern mit Konto. Athleten-ID aus Schritt 5 wird
weiterverwendet. Eigene Elternteilnahme bleibt unverändert. SQL-Audit trennt Kind,
handelndes Elternkonto, Antwort und Zeitpunkt. Ältere Ansichten müssen nach
zwischenzeitlicher Antwort oder Terminänderung erneut geladen werden.

- Typprüfung und Lint bestanden.
- Gesamtsuite: **164 Tests bestanden**, darunter **12 neue SQL-Integrationstests**.
  Echte Familien- und Kalender-Migrationen in isoliertem PGlite ausgeführt;
  ältere Anwendungsverträge sind Fixtures, pgcrypto wird durch ein lokales
  SHA256-/Zufalls-Double ersetzt. Kein vollständiger produktiver Schemaklon.
- Produktionsbuild mit Next.js 16.2.12 / Webpack bestanden.
- Lokaler Chromium-Browser: vorhandenes Kind Alex, neues Kind Robin gespeichert;
  Zusage für Alex gespeichert; nach Neuladen sind Kind und Zusage vorhanden.
  Desktop und 390×844 geprüft. Screenshot: `/private/tmp/family-step11-mobile.png`.
  Browser gegen isolierten SQL-Fixture-Server, keine Produktionsdaten oder Mails.
- Kein Produktions- oder Stagingdeployment, keine produktive Migration, kein
  Git-Push. Supabase-Advisor und Produktionsschemaabgleich folgen vor Release.
- Neue Kinder ohne Login haben noch keine Terminzuordnung. Die offene Frage
  lautet: sichtbare Termine des Elternkontos zulassen oder explizite Einladung
  für das Kind verlangen? Dieser Teil wurde nicht auf Verdacht implementiert.
- Trainingsstart für Kinder ohne Login, nachträgliche Login-Verknüpfung,
  Vereinsanlage, Wartelisten, Abwesenheiten und Fahrtenstellvertretung wurden
  nicht umgesetzt. Die stabile Athleten-ID bereitet spätere Anbindung vor.

Separate Staging-Abnahme: keine. Produktionsveröffentlichung: offen.
Fachliche Praxisabnahme: offen. Das Gesamtpaket ist **nicht abgeschlossen**.

Technische Referenz: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).


## Bestätigte Erweiterung · 28.09.2026

Eltern dürfen alle eigenen verknüpften Kinder zu den für sie sichtbaren Terminen
anmelden, auch ohne Login des Kindes. Kinder mit eigenem Konto dürfen selbst zu-
und absagen; aktive verknüpfte Eltern erhalten darüber eine In-App-Benachrichtigung.
Bestehende Einladungen der Kinder bleiben für deren Eltern bearbeitbar. Neue
Organisations- oder globale Terminrechte werden dadurch nicht geschaffen.

Vor Veröffentlichung zeigt Codex lokale Ansichten für Eltern und minderjährige
Athleten mit synthetischen Daten. Diese Vorgabe wurde erfüllt; der Nutzer hat
das Deployment am 28.09.2026 anschließend ausdrücklich freigegeben.
Zusätzliche Abnahmekriterien: zwei Kinder unabhängig zu demselben Termin anmelden;
Kinder ohne Login erscheinen namentlich in der bestehenden Teilnehmerliste; eigene
Kinderrückmeldung erzeugt genau eine Benachrichtigung pro aktivem Elternkonto;
Wiederholung derselben Antwort erzeugt keinen Hinweis, entzogene Beziehungen
bekommen keinen Hinweis; Antworten von Eltern erscheinen nicht als Selbstanmeldung.

## Lokaler Nachweis · 28.09.2026

Ergänzungsmigration `20260928114803_step_11_family_attendance.sql`, weiterhin
Branch `codex/step-11-family` auf Basis `8aa88a3`; kein Produktionsrelease.

- Kinder ohne Login werden über `event_participants.family_athlete_id` in der
  vorhandenen Teilnehmerliste geführt, mit Namensstand und ohne erfundene E-Mail.
  Bestehende Kinderkonten verwenden weiterhin ihre vorhandene Teilnehmerzeile.
- Familienansicht berücksichtigt eigene sichtbare Termine der Eltern und bestehende
  Kindereinladungen. Keine globale Terminsuche/zusätzlichen Organisationsrechte.
- Eigene Zu-/Absagen lösen atomar In-App-Hinweise an aktive verknüpfte Eltern aus,
  auch bei direkten API-Aufrufen. Gleiche Antwort erneut speichern löst nichts aus.
  Dieses Teilpaket versendet hierfür keine neuen E-Mails und keine Push-Nachrichten.
- Kalender erklärt verknüpften Athleten, dass sie selbst antworten dürfen und ihre
  Eltern informiert werden. Ein statischer Trainerkontext wird dort ausgeblendet.
- 170 Tests bestanden, darunter 18 Familien-SQL-Integrationstests; Typprüfung und
  Lint bestanden. Die oben dokumentierten PGlite-/Fixture-Grenzen gelten weiter.
- Lokaler Browser mit echter Familien-SQL und synthetischen Identitäten: Alex sagt
  selbst zu; Elternkonto sieht die Benachrichtigung und Alex' Zusage. Eltern melden
  Kim ohne Login zum selben Termin an; Neuladen erhält beide Zusagen.
- Gezeigte Screenshots: `output/family-step11/eltern-desktop.png` und
  `output/family-step11/athlet-desktop.png`, je 1440×1000. Elternaufnahme zeigt den
  Zustand vor Kims anschließender getesteter Zusage. Mobile Aufnahme 390×844:
  `output/family-step11/eltern-mobil.png`. Keine Produktionsdaten.
- Nutzerwunsch: erst lokale Eltern-/Athletenansicht zeigen. Deshalb kein
  Produktionsdeployment, keine produktive Migration und kein Push. Neuer Build,
  aktueller Produktionsschema-/Integrationsabgleich und Advisor vor Release offen.

Die am 24.09. offene Terminberechtigung ist damit entschieden und implementiert.
Fachliche Praxisabnahme sowie Veröffentlichung bleiben offen.

## Releaseprüfung und Freigabe · 28.09.2026

Die gezeigten lokalen Rollenansichten wurden vom Nutzer zur Veröffentlichung
freigegeben. Integration von `e89513c` mit `ae97bf2` (Produktionscode `bd4deed`
plus neuere Roadmap-Notiz zum Rollenmodell) in `9fb0718`. Runbuilder, neue
Trainingsplanansicht und Einzelauswertung bleiben erhalten.

- Node 24.21.0: 227 Tests erfolgreich, einschließlich 18 Familien-SQL-Tests.
- Typprüfung erfolgreich. Produktionsbuild und lokale HTTP-Releaseprüfungen
  erfolgreich; keine Server-Secrets in 74 Browser-Artefakten.
- Generierte Design-Runtime `docs/design/auswertung/support.js` gezielt vom
  Anwendungs-Lint ausgenommen; der Designentwurf selbst bleibt unverändert.
- Produktionsschema und erforderliche Kalender-/Kontofunktionen abgeglichen.
  Es werden ausschließlich die beiden Familienmigrationen veröffentlicht.
- Fachliche Praxisabnahme mit echten Konten bleibt separat offen.
