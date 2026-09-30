# Trainer Hub – Prozessstatus und Roadmap-Review

Stand: 08.09.2026. **Vorschlag zur Entscheidung, keine freigegebene Umsetzungs-Roadmap.**

Geprüft wurden `trainer-webapp`, die Roadmap, der lokale ISO-Leitfaden, Code,
automatisierte Tests und technische Metadaten der verknüpften Produktion. Nach
dem Review wurden die vom Nutzer bestätigten Entscheidungen am 8. September in
`roadmap.md` übernommen. Keine Produktivdaten wurden geschrieben und keine
E-Mails versendet.

## 1. Ergebnis und Statusregeln

Die Richtung der Roadmap ist sinnvoll: erst verlässliche Organisation, dann
Training und Fortschritt, später aufwendige Park-, Contest- und Native-Funktionen.
Die Prioritätenliste benötigt jedoch technische Voraussetzungen und messbare
Abnahmekriterien. Besonders fehlen dauerhafte eigene Trainingspläne, ein
OAuth-kompatibler Registrierungszustand und eine früh verfügbare Mailzustellung.

| Markierung | Aussage | Erforderlicher Nachweis |
| --- | --- | --- |
| ✓ Geprüft | Der ausdrücklich genannte Teil funktioniert im angegebenen Prüfkontext. | Konkreter aktueller Test oder beobachtetes Ergebnis. |
| ◐ Vorhanden | Implementierung beziehungsweise produktive Struktur vorhanden; vollständiger Ablauf aktuell nicht abgenommen. | Code und/oder Produktionsmetadaten. |
| ! Lücke / Freigabe offen | Fehlende Voraussetzung, unvollständiger Ablauf oder widersprüchliches Ergebnis. | Benannter Befund mit Quelle. |
| ○ Geplant | Zukünftiger Funktionsumfang oder vorgeschlagene Änderung. | Roadmap beziehungsweise dieser Review. |

**Ein grüner lokaler Datenbanktest ist keine Bestätigung des gesamten produktiven
Nutzerablaufs.** Jede Markierung nennt deshalb ihren Geltungsbereich. Es gibt in
dieser Prüfung keinen pauschalen grünen Haken für die ganze Anwendung.

## 2. Prüfgrundlage und aktuelle Ergebnisse

| Prüfung | Ergebnis am 08.09.2026 | Grenze |
| --- | --- | --- |
| Produktion, beide Vercel-Aliase | Deployment `dpl_DW277V4vpV6FW3HrgayG4beoEZM2`, Zustand READY, Ziel production. | Build-/Aliasstatus belegt keine vollständigen Fachabläufe. |
| Quellbasis der Produktion | Metadaten: `561821018585d491767f2c344685e93b648920e3`, `gitDirty=1`. | Bytevergleich mit dem Commit ist im Release-Bericht vom 03.09. dokumentiert; heute nicht wiederholt. |
| Öffentliche Loginseite | ✓ HTTP 200. | Kein Passwort-Login mit Testkonto durchgeführt. |
| Kalender und Organisation ohne Sitzung | ✓ Beide HTTP 307 zur Loginseite mit passendem Rücksprungziel. | Kein vollständiger Berechtigungstest mit allen Rollen. |
| Produktives Datenbankschema | 31 öffentliche Tabellen. Keine `carpool_rides`, `guardian_approval_requests` oder `account_invitations`; `get_account_invitation(text)` fehlt ebenfalls. | Ausschließlich Strukturabfragen, keine Einsicht in fachliche Nutzerdaten. |
| Produktive Migrationen | Elternfreigabe und beide Fahrgemeinschaftsmigrationen fehlen. | Nachgewiesener Istzustand, nicht nur veraltete Dokumentation. |
| Kontobereinigung | Edge Function ACTIVE, täglicher Cron aktiv; letzte drei Cron-Ausführungen `succeeded`. | Belegt Scheduler-Ausführung, nicht den Erfolg einer realen Kontolöschung oder der HTTP-Antwort der Function. |
| ESLint im Arbeitsverzeichnis | ✓ Erfolgreich. | Statische Prüfung. |
| Tests im Arbeitsverzeichnis | ! 98 von 99 bestanden; Fehler im Test zur unabhängigen Hin-/Rückfahrt. | Ursache nicht abschließend bestimmt. |
| Typprüfung im Arbeitsverzeichnis | ! TS2688 durch zusätzliche Typverzeichnisse wie `react 2` und `node 2`. | Lokale Abhängigkeiten sind nicht sauber reproduziert. |
| Isolierte Kopie mit `npm ci --ignore-scripts` | ✓ Installation, Typprüfung, 99/99 Tests und Produktionsbuild erfolgreich. | Ohne Produktionsgeheimnisse; lokale Node-Version 26.7.0, Vercel konfiguriert Node 24.x. |
| Nachprüfung des zunächst fehlgeschlagenen Einzeltests | ✓ Fünf weitere Läufe in der frischen Kopie erfolgreich. | Entkräftet keinen intermittierenden Fehler. Teststabilität bleibt offen. |

Die Tests nutzen standardmäßig PGlite und synthetische Konten. Der aktuelle Lauf
belegt keine Konkurrenz mit getrennten nativen PostgreSQL-Verbindungen. Solche
Prüfungen sowie eine lokale Browserabnahme sind im Bericht vom 03.09. dokumentiert,
wurden heute aber nicht erneut durchgeführt. Ein Testhelfer wählt die zuletzt
angelegte Fahrt über `created_at DESC, id DESC`; bei gleichen Zeitstempeln ist die
UUID-Reihenfolge keine zeitliche Reihenfolge. Das ist eine zu untersuchende
Testschwäche, noch keine bewiesene Ursache des beobachteten Fehlers.

Prüflogs: `docs/review-evidence-2026-09-08/`. Die Arbeitskopie und ihre vorhandenen
Änderungen wurden für diese Prüfung nicht repariert oder veröffentlicht.

## 3. Vorhandene Prozesse

| ID | Ablauf | Markierung und belegter Stand | Noch offen |
| --- | --- | --- | --- |
| P01 | Registrierung → Konto/Organisation → Login → geschützter Bereich | ◐ E-Mail-/Passwort-Code und produktive Profile/Organisationen vorhanden. ✓ Öffentliche Loginseite und anonyme Weiterleitung geprüft. | Vollständige aktuelle Registrierung und Rollenabnahme im gehosteten Auth-Dienst. |
| P02 | Altersprüfung → Elternmail → einmalige Freigabe → aktives Minderjährigenkonto | ✓ Alterslogik und sechs dynamische DB-Tests in isolierter Umgebung bestanden. ! Noch nicht produktiv. | Versand, gehostetes Auth, Betreiberangaben, Dokumentversionen und gestaffelter Release. |
| P03 | Personensuche → Kontakt-/Trainer-/Elternanfrage → Zustimmung → Beziehung | ◐ Server-Actions, `relationship_requests`, `relationships` und RLS-Struktur vorhanden. | Aktuelle End-to-End-Abnahme für Zustimmung, Widerruf und daraus folgende Sichtbarkeit. |
| P04 | Gruppe anlegen → Mitglieder einladen → akzeptieren → gemeinsame Terminrechte | ◐ Gruppen-, Einladungs- und Mitgliedschaftstabellen sowie Actions vorhanden. | Rollenübergreifende Abnahme einschließlich Austritt und Entzug von Zugriff. |
| P05 | Organisationsbeitritt → Rollenprüfung/Freigabe → Hierarchie und Zuständigkeit | ◐ Mitgliedschaftsanfragen, Rollenverwaltung und Bundes-/Landes-/Vereinsstruktur vorhanden. | Durchgängige Abnahme je Rolle; letzte verantwortliche Person und Rollenwechsel. |
| P06 | Termin anlegen → Teilnehmende einladen → Zu-/Absage → Änderung/Löschung | ◐ Persistente Kalender-Repositories und Actions vorhanden. ✓ Fünf Datums-/Kalender-Helfertests bestanden. | Rückmeldefristen, Erinnerungen, Änderungskonsens und Kalender-Abo. Eine Zusage ist noch keine tatsächliche Anwesenheit. |
| P07 | Externes Konto einladen → Link öffnen → Registrierung und Rolle übernehmen | ! UI/Code vorhanden, aber produktive Einladungstabelle und Lookup-RPC fehlen. | Migration, Einlösung/Zuweisung und Versand gemeinsam abschließen; kein Haken „funktioniert“. |
| P08 | Plan erstellen/duplizieren → Übungen/Ziele → speichern → teilen | ! Eigene Pläne ohne Empfänger und Duplikate werden nur über `setPlans` gehalten. ◐ Geteilte Snapshots werden persistiert. | Eigene Entwürfe, Änderungen und Ziele dauerhaft speichern; Beispielpläne von echten Daten trennen. |
| P09 | Geteilten Trick bearbeiten → Fortschritt melden → Trainer bestätigt → XP | ◐ Actions und Tabellen für Snapshots und Trickfortschritt vorhanden. | Vollständige Rollen-/Reload-Abnahme. Planbestätigung nicht als gemessene Session-Erfolgsquote ausgeben. |
| P10 | YouTube-Nachweis/Demovideo → Versuchsangabe → Trainerfeedback/Freigabe | ◐ Bereits implementierter Link-Workflow mit produktiven Tabellen. ✓ URL-Helfertests bestanden. | Eigene Aufnahme/Dateiupload, Medienbetrieb, verknüpfte Session und aktueller kompletter Review-Test. |
| P11 | Zeitraum wählen → Athletenbewertung/Ziele → Vergleich/Export | ◐ Produktive Auswertungstabellen und Actions vorhanden; zusätzliche lokale Änderungen. ! Anwesenheitswert zählt aktuell Zusagen. | Erfasste Anwesenheit, belastbare Versuchs-/Landungsdaten und versionierte Bewertungsgrundlage. |
| P12 | Fachereignis → Postfach/In-App-Hinweis → lesen und Einstellungen ändern | ◐ Benachrichtigungen, Einstellungen und Postfach vorhanden. | Allgemeine externe Zustellung, Fristen, Eskalation und später moderierte Nachrichten. |
| P13 | Profil/Foto → Vereins-/Verbandswechsel → Löschvormerkung → Wiederherstellung/Bereinigung | ◐ Implementierung und produktive Tabellen/Function vorhanden. ✓ Domain- und statische Migrationstests; Scheduler-Metadaten geprüft. | Gesamten Löschzyklus samt Dateien/Auth und Wiederholung mit synthetischem Konto abnehmen. |
| P14 | Termin → Fahrt/Gesuch → Anfrage → Fahrerbestätigung → Elterninformation | ✓ 16 Fahrgemeinschafts-DB-Tests im frischen Gesamtlauf bestanden. ! Produktionsgrundlage fehlt. | Native Konkurrenzabnahme und produktive Versand-/Nutzerabnahme; Testabweichung erklären. |
| P15 | Termin-/Fahrtänderung → Fahrerprüfung → Kenntnisnahme oder Absage → Platzfreigabe | ✓ Lokale Fahrgemeinschaftstests decken Revisionen, Absagen und Zugriff nach Widerruf ab. | Produktivbetrieb und reale Zustellung noch offen. |

## 4. Empfohlene Änderungen

### R01 – Release 1 durch eine überprüfbare Freigabeschranke abschließen

**Priorität: sofort.** Fahrgemeinschaften bleiben das erste Produktrelease.
Vorher sind Installationszustand, Testabweichung, Konfiguration und tatsächlicher
Versand zusammenzuführen. Den bestehenden Versandworker nicht allein für eine
verallgemeinerte Architektur vor Release 1 neu schreiben.

Die Release-Anweisung ist in ihrer Reihenfolge noch ungenau: Mailworker und Cron
können ihre Fachwarteschlange erst nach deren Migration vollständig verarbeiten.
Zuerst deshalb Konfiguration und Providerzugang prüfen; danach den gesamten Ablauf
auf Staging erproben. In Produktion kompatible Anwendung, Schema und Aktivierung
gezielt aufeinander abstimmen, gegebenenfalls mit kurz pausierter Registrierung
oder einem Funktionsschalter. Minderjährigenregistrierung erst öffnen, wenn
Freigabelink und Mailweg funktionieren. Danach Migrationen/Worker, Testablauf und
Domains prüfen. Die genaue Aktivierungsstrategie ist vor Umsetzung zu entscheiden.

Abnahme: sauberer Checkout mit festgelegten Node-/npm-Versionen, alle vereinbarten
Checks grün, echte Konkurrenz um den letzten Platz, Mailtest mit ausdrücklich
vereinbartem Empfänger, beobachteter Scheduler/Worker, erfolgreiche Kernabläufe,
frisch geprüfter Rollbackpunkt. Der vorhandene Sicherungstag ist dokumentiert;
vor einem späteren Deployment muss erneut der dann stabile Stand bestimmt werden.

### R02 – Transaktionsmails aus Paket 14 herauslösen und früh bereitstellen

**Priorität: Release-1-Grundlage, danach Ausbau mit Paket 3.** Paket 14 bündelt
Chat, Push und Mail, obwohl Elternfreigabe und Fahrgemeinschaften bereits Mail
benötigen. Kalendererinnerungen können ebenfalls nicht bis zum späten Chat-Paket
warten. Produktname/Absender/Domain sind damit eine früh zu klärende Betriebsfrage.

Nach dem ersten Release den vorhandenen Outbox-/Retry-Ansatz für weitere
Fachereignisse nutzbar machen: stabile Ereignis-ID, pro Empfänger/Kanal genau ein
Auftrag, Zustellversuche, aussteuerbare Fehler und erneute Berechtigungsprüfung.
Zustimmung zu Änderungen ist ein eigener gespeicherter Fachzustand; eine
zugestellte oder geöffnete Mail ersetzt sie nicht. Chat, Moderation und Push
können weiter später folgen.

Abnahme: wiederholte Verarbeitung erzeugt im Test keine doppelte Buchung oder
Benachrichtigungsaufgabe; Versandfehler sind sichtbar und wiederholbar; nach
Widerruf einer Elternverknüpfung wird kein vertraulicher Inhalt mehr zugestellt.

### R03 – OAuth vorab mit einem expliziten Onboarding-Zustand entkoppeln

**Priorität: Voraussetzung für Paket 2.** Der neue `handle_new_user`-Trigger verlangt
bereits beim Einfügen des Auth-Kontos Geburtsdatum und bestätigte Dokumentversionen.
Die Roadmap plant diese Angaben dagegen nach dem ersten Google-/Apple-Login.
Diese Reihenfolge ist ohne Umbau widersprüchlich.

Vorschlag: technische Auth-Identität zunächst mit gesperrtem Fachzugriff anlegen;
danach Profil, Organisation, Altersstatus und Dokumentannahme in einem serverseitig
geprüften, transaktionalen Abschluss vervollständigen. Zustände beispielsweise
`onboarding_required → guardian_pending → active`; Erwachsene überspringen nur
den Freigabeschritt. Auch bestehende E-Mail-Konten und abgebrochene Registrierungen
brauchen definierte Übergänge. Autorisierung bleibt in vertrauenswürdigen
DB-Zuständen, nicht in vom Nutzer änderbaren Auth-Metadaten.

Supabase verknüpft bestimmte Identitäten mit gleicher verifizierter E-Mail bereits
automatisch; zusätzlich gibt es explizites Identity Linking. Vor eigener
Duplikaterkennung dieses Verhalten und die gewünschte Kontoverknüpfung festlegen.
Apple-Relay-Adressen, bestehende Konten, Abbruch und erneute Anmeldung gehören zur
Abnahme. Quelle: [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Abnahme: Kein Fachdatenzugriff vor vollständig geprüftem Onboarding; keine
ungewollten Zweitprofile oder Rollenänderungen; beide Provider mit bestehenden
und neuen Konten im gehosteten Auth-Dienst getestet.

### R04 – Trainingsdaten dauerhaft und fachlich korrekt machen

**Priorität: vor Paketen 5–8 und vor weiterem Ausbau der Auswertung.**
`PlansView.handleCreatePlan` meldet bei einem Plan ohne Empfänger erfolgreiches
Erstellen, schreibt aber nur in den React-Zustand. Auch Duplikate und bestimmte
Zieländerungen sind lokal. Die Route mischt persistente Freigaben mit Mockplänen.

Vorschlag: persistente eigene Pläne und explizite Versionen; Teilen referenziert
eine unveränderliche freigegebene Version. Eine Session referenziert Termin,
Athlet und Planversion. Erfasste Anwesenheit, Versuche, Landungen, Kommentare und
Trainerbestätigung bleiben getrennte Daten. Bestehende `attempt_count`-Angaben
bei Videonachweisen sind kein vollständiges Sessionprotokoll.

Die Auswertung berechnet derzeit „Anwesenheit“ aus `event_participants.status =
confirmed`. Bis echte Anwesenheit erfasst wird, den Wert als Zusagequote benennen.
Alte Zusagen nicht automatisch in Trainingsbesuche umdeuten; unbekannte Anwesenheit
explizit als unbekannt erhalten. Erfolgsquote nur aus Landungen/Versuchen einer
definierten Session berechnen; bei null Versuchen „keine Messung“ anzeigen.

Abnahme: Eigener Plan und Änderungen bleiben nach Reload und Gerätewechsel
erhalten; Zusage ohne Besuch erhöht keine Anwesenheit; Landungen überschreiten
keine Versuche; bestätigte Sessionstände sind korrigierbar und nachvollziehbar.

### R05 – Offline-Verträge und einen kleinen Skill-Kern früher festlegen

**Priorität: gemeinsam mit Session-Design, vollständige Offline-UI kann Paket 8
bleiben.** Stabile IDs, Änderungsrevisionen, wiederholbare Befehle und Konfliktregeln
werden teuer, wenn sie erst nach Session, Recap und Video nachgerüstet werden.
Keine aufwendige Synchronisationsplattform vorab bauen: zunächst wenige
repräsentative Konflikte und einen kleinen Prototyp prüfen.

Ebenso braucht es vor Session/Recap einen kleinen, versionierten Skill-/Übungskern.
Paket 11 kann weiterhin die spätere Vereins-/Verbandsfreigabe und umfangreiche
Curricula liefern. Das vermeidet, dass gleiche Tricks in Session, Video und Run
verschiedene Identitäten erhalten.

Abnahme: Verbindungsabbruch und Wiederholung verlieren keine bestätigte Eingabe;
konkurrierende Bearbeitung überschreibt nicht stillschweigend fremde Daten;
Logout, Gerätewechsel und entzogene Berechtigungen behandeln lokale Daten nach
festgelegten Regeln. Konfliktlösung und zulässige Offline-Dauer sind
Produktentscheidungen, keine bereits feststehenden Anforderungen.

### R06 – Familien- und Teilnahmeorganisation kleiner schneiden

**Priorität: nach Kalenderbasis; Kinderprofilmodell vorher entscheiden.**
Mehrere verknüpfte Kinder und offene Aufgaben bilden einen sinnvollen ersten
Umfang. Abwesenheit und Trainingswarteliste sind eigene Zustandsprozesse:
Wartelisten benötigen Terminkapazität, faire Reihenfolge, befristetes Platzangebot,
Ab-/Zusagen und atomaren Übergang beim Nachrücken. Fahrtplätze und Trainingsplätze
sind unterschiedliche Kapazitäten.

Der Nutzer favorisiert inzwischen Kinderprofile durch Eltern und berechtigte
Vereinsmitarbeitende. Dafür muss das fachliche Kinder-/Athletenprofil von einer
Auth-Identität trennbar sein. Die Konkretisierung und noch offenen Details stehen
in Abschnitt 7. Eine Elternverknüpfung darf nicht unbeabsichtigt allgemeinen
Zugriff auf andere Teilnehmende eröffnen.

### R07 – Run-/Wertungsmodell vor 3D validieren, Darstellung optional halten

**Priorität: vor Paket 9, nach belastbaren Trainingsdaten.** Zuerst einen einfachen
Run als geordnete Liste beziehungsweise 2D-Ansicht mit stabilen Obstacle-IDs testen.
Parkversion, Runversion und Wertungsregelwerk getrennt versionieren. Die
3D-Darstellung kann danach denselben Run verwenden und bei schwachem Gerät
ausfallen, ohne den Kernablauf zu blockieren.

Ziel-/Erwartungsscore und tatsächlich vergebener Score bleiben getrennt. Vergleiche
benötigen mindestens Disziplin, Format, Regelwerkversion und Skala. Die Roadmap
lässt sonst Vergleichbarkeit erwarten, wo Bewertungen unterschiedliche Grundlagen
haben. „Erwartet“ und „angestrebt“ ebenfalls fachlich definieren. Wettkampfprozesse
brauchen darüber hinaus Bewertungssperre, Korrektur, Gleichstand und Ausfallregeln.

### R08 – Betriebs- und Datenqualität als durchgehende Arbeit einplanen

**Priorität: ab jetzt.** Die README ist in Architektur, Persistenz und Reihenfolge
der Restaufgaben teilweise überholt. `schema.sql`, `apply-*.sql` und Migrationen
sowie abweichende lokale/remote Versionsnummern benötigen eine nachvollziehbare
Installationsbasis. Die fehlenden Kontoeinladungen zeigen eine reale Folge dieser
Abweichung. Nicht blind die alten SQL-Dateien auf Produktion ausführen.

Empfohlen: reproduzierbarer Neuaufbau plus Upgradeprobe auf einer strukturellen
Produktionskopie, feste Laufzeitversion, kleine CI-Prüfkette und fachlicher
Abnahmekatalog. Fehlende Tabellen oder Versandkonfiguration müssen als Betriebs-
zustand erkennbar sein. Für Video vor Implementierung Größen-/Kostenbudget,
private Speicherung, kurzlebige Zugriffe, Dateiprüfung und Löschkette festlegen.
Für Verbandsstatistiken zunächst Zweck, Population, Datenherkunft, Vergleichbarkeit
und Regeln gegen die Erkennbarkeit einzelner Kinder in kleinen Gruppen bestimmen.

## 5. Vorgeschlagene Reihenfolge und Zuordnung aller Roadmap-Pakete

Keine Kalendertermine erfunden. Reihenfolge folgt Abhängigkeiten; einzelne
Vorarbeiten können ohne zusätzliche Produktveröffentlichung stattfinden.

| Etappe | Bisherige Pakete | Vorschlag | Fertig, wenn … |
| --- | --- | --- | --- |
| A – Verlässliche Basis / Release 1 | 1, Mail-Grundlage aus 14 | Reproduzierbare Prüfungen, Versand/Betreiber/Domain, Elternfreigabe, Fahrgemeinschaften, gestaffelte Aktivierung. | R01-Abnahme erfüllt; Produktion und neue Fachabläufe bestätigt. |
| B – Konto und Kommunikation | 2, 3, transaktionaler Teil 14 | Onboarding-Zustand vor OAuth; Kontoeinladung abschließen; Fristen, Erinnerungen, Änderungskonsens, widerrufbares Kalender-Abo. | Neue/bestehende Konten geprüft; eindeutiger Empfängerkreis; keine doppelten Aufgaben. |
| C – Familienorganisation | 4 | Kinderübersicht zuerst; Abwesenheiten und Warteliste anschließend als eigene Teilpakete. | Kinder-/Elternmodell entschieden; Kapazität und Nachrückablauf unter Konkurrenz geprüft. |
| D – Trainingsgrundlage | neu, kleiner Kern aus 11 | Eigene Pläne persistieren; Plan-/Skillversionen; Sessionvertrag und Offline-Konflikte festlegen. | Reload/zweites Gerät erfolgreich; eindeutige IDs und Zugriffsregeln. |
| E – Training und Fortschritt | 5, 6 | Anwesenheit/Versuche/Landungen erfassen; danach prüfbarer Recap und echte Verlaufswerte. | Zusage und Anwesenheit getrennt; Abnahme durch Trainer und Athlet/Elternsicht. |
| F – Offline-Nutzung, danach eigene Videos | 8 → 7 | Zuerst Anwesenheit, Versuche und Notizen offline erfassen und sicher synchronisieren; danach private Aufnahme/Uploads ergänzen. Reihenfolge vom Nutzer bestätigt. | Offline-Eingaben bleiben bei Abbruch/Wiederholung erhalten; Konflikte sind sichtbar. Anschließend Upload-/Löschgrenzen prüfen. |
| G – Runs und Parks | 9, 10 | Run-/Obstacle-/Wertungsmodell zuerst als Liste/2D validieren; danach optionaler minimalistischer 3D-Editor und Scorevergleich. | Historische Runs bleiben trotz Parkänderung nachvollziehbar; Scores vergleichbar gekennzeichnet. |
| H – Standards und Wettbewerb | 11, 12 | Curriculum/Freigaben; Street: Run, 2/5/3 oder Run-Qualifikation mit 2/5/3-Finale. Park: Run. Run-Runden standardmäßig mit zwei Runs und Bestwertung; mehr Runs in erweiterten Einstellungen. | Regeln pro Runde versioniert; lokale Anpassung überschreibt keine Freigabe; Judge-/Korrektur-/Ausfallfälle abgenommen. |
| I – Verband und Austausch | 13, verbleibender Teil 14 | Aggregationen nur mit vergleichbaren Daten; Chat/Moderation und Push nach eigener Nutzenprüfung. | Rechte, Datenminimierung, Moderation und Betrieb überprüfbar. |
| J – Native Apps | 15 | Nach stabilen Web-Verträgen und messbarem Bedarf an Kamera, Push oder Offline-Komfort. | Klarer Zusatznutzen im Feldtest und wiederverwendbare API-Verträge. |

Abhängigkeiten: A → B → C; A → D → E → F; D/E → G → H → I.
Die Klärung von D kann bereits während B/C erfolgen. Native Apps benötigen
stabile Web-/API-Verträge, müssen fachlich aber nicht pauschal auf jedes
Verbands- oder Chatfeature warten. Ebenso braucht der Contest Hub kein fertiges 3D.

## 6. Anwendung des ISO-Leitfadens

Der lokale Leitfaden wird als Arbeitsrahmen verwendet: Zielentität → Merkmal →
Maß → Anforderung → Evaluation → erneute Bewertung. ISO/IEC 25002 liefert einen
Rahmen zur Verwendung von Qualitätsmodellen, keine feste Roadmap und keine
projektspezifischen Grenzwerte. Das bestätigt die
[offizielle ISO-Beschreibung](https://www.iso.org/standard/78175.html).
Dies ist keine Zertifizierung oder vollständige Normkonformitätsprüfung.

Die folgenden Grenzwerte sind **Vorschläge für dieses Produkt** und vor
Implementierung mit den zuständigen Personen abzustimmen. Fach- und Testverantwortung
sowie Nutzungskontext werden pro Paket benannt, noch ohne Personen zu erfinden.

| Qualitätsziel / Zielentität | Maß und vorgeschlagenes Kriterium | Prüfmethode und Bezug |
| --- | --- | --- |
| Funktionale Korrektheit / Buchung | 0 Überbuchungen; höchstens eine aktive Anfrage je Person, Termin und Richtung. | Native konkurrierende Transaktionen, Wiederholung und Abbruch; A/P14/P15. |
| Sicherheit / Minderjährigen- und Organisationsdaten | 0 erfolgreiche unberechtigte Zugriffe in der vereinbarten Rollen-/Objektmatrix. | Anon, fremder Verein, gesperrtes Konto, widerrufene Elternbeziehung; A–J. |
| Datenqualität / Training | 100 % bestätigte Sessions mit Termin, Athlet und referenzierter Version; 0 als Anwesenheit umgedeutete reine Zusagen. | Validierungen, Datenabgleich und fachliche Stichprobe; D/E. |
| Zuverlässigkeit / Session & Zustellung | 0 doppelte Fachmutationen im Wiederholungs-/Abbruchtest; keine stillen Sync-Konflikte; alle endgültigen Versandfehler sichtbar. | Netzabbruch, Gerätewechsel, Retry, Providerfehler; A/B/F. |
| Interaktionsfähigkeit / mobiler Kernablauf | Mindestens 4 von 5 repräsentativen Testpersonen schließen Angebot → Anfrage beziehungsweise Anwesenheitserfassung ohne Erklärung ab; 0 blockierende Tastaturfehler. | Getrennte Rollen und definierte Aufgaben, 390-px-Gerät; A/C/E. Kleine Pilotmessung, kein statistischer Nachweis. |
| Leistungseffizienz / Kernansicht | Vorschlag: p95 bis zur bedienbaren Kernansicht ≤ 2,5 s auf vereinbartem Mobilgerät und Netzprofil. | Kalter/warmer Start sowie erwartete Termin-/Personenzahl dokumentieren; B–G. Noch nicht gemessen. |
| Wartbarkeit / Releaseartefakt | Alle Pflichtprüfungen in frischer Installation erfolgreich; Version, Migrationen und Nachweise pro Release verknüpft. | CI sowie Neuaufbau-/Upgradeprobe; A und jedes folgende Release. |
| Wiederherstellbarkeit / Betrieb | RTO/RPO vor Release vereinbaren; Wiederherstellung von Daten und Dateien einmal in isolierter Umgebung nachweisen. | Restoreprobe plus Code-Rollback mit kompatiblem Schema; A/F. Werte noch offen. |
| Nutzungserfolg / Trainer im Trainingskontext | Zeit und Fehlerrate für Teilnehmererfassung vor/nach Änderung messen; Verbesserung ohne Verlust der Korrektheit. | Feldtest mit schlechtem Netz und realistischem Ablauf; E/F. Ausgangswert noch zu erheben. |

Pro Paket ein kurzer Nachweisdatensatz: Anforderungs-ID, Nutzer/Rolle, Zielentität,
Szenario, Qualitätsmerkmal, Messmethode, Grenzwert, Verantwortliche, Version,
Datum, Ergebnis und Restrisiko. Ein Status wird nach jeder relevanten Änderung
neu bewertet. Abweichungen vom Modell und Zielkonflikte dokumentieren, etwa
Offline-Komfort gegen schnellen Rechteentzug oder Videoqualität gegen Kosten.

Redaktionell sollte im lokalen ISO-Leitfaden die Aussage „fünf Kernbereiche sowie
eine Management- und eine Erweiterungsdivision“ präzisiert werden: Die eigene
Auflistung führt Management bereits innerhalb der fünf 2500n–2504n-Bereiche.
Die jeweils verwendeten Ausgaben der weiteren Normen ergänzen. Als Produktmodell
führt [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) neun Merkmale;
unsere obige Auswahl ist eine projektbezogene Auswahl, keine vollständige Liste.

## 7. Entscheidungen und Präzisierungen aus dem Nutzerfeedback

1. **Miro-Ziel bestätigt:** das bestehende TrainerApp-Board. Umsetzungsvorschläge bleiben von bereits geprüften Funktionen getrennt.

2. **Kinderprofile: favorisierte Richtung ist Parent-First plus Vereinsanlage.** Der Nutzer schlägt vor, dass Eltern ihre Kinder selbst anlegen und berechtigte Trainer Kinder über den Verein hinzufügen können. Diese Richtung wird empfohlen; die folgenden Details sind ein technischer Vorschlag und noch keine implementierte oder rechtlich freigegebene Lösung.

   **Empfohlenes Modell:** Das Kind erhält ein dauerhaftes Athletenprofil, zunächst ohne eigene E-Mail und ohne eigenen Login. Eltern melden sich mit ihrem eigenen Konto an. Ein späterer eigener Login wird nach den dann geltenden Voraussetzungen mit demselben Athletenprofil verbunden; Trainingshistorie und Vereinszugehörigkeit bleiben erhalten.

   **Elternweg:** Elternkonto → Kinderprofil anlegen → Sorgeberechtigung und erforderliche Erklärungen nachvollziehbar bestätigen → eigene Kinder verwalten. Die Verknüpfung erfolgt im geprüften Ablauf; das Eintragen einer fremden Kinder-ID oder ein gleicher Nachname genügt nicht. Weitere Sorgeberechtigte erhalten eine eigene geprüfte Verknüpfung.

   **Vereinsweg:** Nur ausdrücklich dazu berechtigte Personen dürfen innerhalb ihres Vereins ein minimales Kinderprofil anlegen. Die für diese konkrete Nutzung erforderliche Rechtsgrundlage wird dokumentiert. Wenn sie auf einer Erklärung beruht, werden beispielsweise Zweck, Dokumentversion, Datum und verantwortliche prüfende Person sowie eine interne Nachweisreferenz erfasst. Papierunterlagen bleiben vorzugsweise beim Verein. Der Trainer wird durch die Anlage weder Sorgeberechtigter noch erhält er ein Recht, beliebige Einwilligungen für das Kind abzugeben. Eltern können das bestehende Profil nach geprüfter Einladung übernehmen; ein automatisches Zusammenführen allein nach Name/Geburtsdatum ist nicht vorgesehen.

   **Datenschutzbewertung:** Vereinsunterlagen sind nur passend, wenn sie die tatsächlichen Zwecke und Verantwortlichkeiten abdecken. Erforderliche Vereinsverwaltung, optionale Mediennutzung und Veröffentlichung dürfen nicht pauschal gleichbehandelt werden. Die zuständige Datenschutzperson beziehungsweise Rechtsberatung sollte dieses konkrete Modell und die Texte vor Freigabe prüfen. Der Vereinsratgeber unterscheidet ebenfalls erforderliche Verarbeitung und einwilligungsbedürftige Zwecke: [LfDI Baden-Württemberg](https://www.baden-wuerttemberg.datenschutz.de/orientierungshilfe-datenschutz-verein/).

   Ein externer Ausweisprüfdienst ist damit keine automatisch erforderliche technische Grundlage. Soweit Art. 8 DSGVO einschlägig ist, sind angemessene Anstrengungen zur Prüfung der elterlichen Zustimmung erforderlich; der Artikel schreibt keinen bestimmten Drittanbieter vor. Eine bestätigte Mailadresse allein beweist keine Sorgeberechtigung. Die vorhandene 13-Jahre-Grenze ist eine Produktregel, kein allgemeiner DSGVO-Freibrief. Quelle: [Art. 8 DSGVO](https://eur-lex.europa.eu/legal-content/EN-DE/ALL/?from=EN&uri=CELEX%3A32016R0679).

   **Auswirkung auf den Bestand:** `guardian_app` und `guardian_email` sind nur Benachrichtigungseinstellungen. Die Elternrechte kommen aus geprüften Beziehungen. Der heutige Code bindet Athleten und Fahrtanfragen an Benutzerprofile mit Auth-Konto. Handelnde Person, betroffenes Kind, Elternbeziehung und Login müssen für das neue Modell getrennt werden. Eltern brauchen eine ausdrücklich geprüfte Stellvertretung für Teilnahme und Fahrten ihres Kindes; sie melden sich nicht als das Kind an. Auch Löschung eines Elternkontos darf nicht versehentlich die Kinderhistorie löschen. Dieses ist ein Ausbau des bisherigen Selbstbuchungsmodells und wird durch die Diskussion nicht automatisch in Release 1 aufgenommen.

3. **Entschieden: Fristen und Transaktionsmails reichen vorerst.** Früh vorgesehen bleiben Elternfreigabe, Fahrtinformationen, Kalendererinnerungen und wichtige Änderungen. Chat und Push bleiben spätere, getrennt bewertete Funktionen. Zustellung ersetzt keine erforderliche fachliche Bestätigung.

4. **Entschieden: Offline-Training zuerst, eigener Videoupload danach.** Anwesenheit, Versuche und Notizen sollen auch ohne Internet zuverlässig erfasst und später synchronisiert werden können. Der Nutzer hat diese Reihenfolge ausdrücklich gewählt. Das Datenmodell und Konfliktregeln werden bereits mit dem Session-Design festgelegt; die produktive Offline-Erfassung folgt auf einen funktionierenden Trainingsablauf. Eigene Videoaufnahme und Upload bleiben das anschließende Paket.

5. **Disziplinen und gewünschte Formate konkretisiert:** Street und Park. Street soll reine Run-Wettbewerbe mit „Best counts“, das Format 2/5/3 und die Kombination aus Run-Qualifikation mit 2/5/3-Finale unterstützen. Für Park ist das Run-Format gewünscht.

   **Empfohlene technische Abbildung:** Jede Wettbewerbsrunde hat ihr eigenes Format, ihre Anzahl Runs/Trickversuche und ihre Wertungsregeln. So wird die Kombination aus Qualifikation und Finale aus zwei normalen Runden aufgebaut. Ergebnisse bleiben pro Runde getrennt.

   Im veröffentlichten World-Skate-Regelwerk (April 2025, S. 18) bedeutet 2/5/3: zwei Runs, fünf einzelne Trickversuche; bester Run plus die zwei besten Trickwertungen ergeben den Rundenscore. Diese Regel ist die vorgeschlagene Standardvorlage. Quelle: [World Skate – Street & Park Competition Rules](https://www.worldskate.org/skateboarding/about/regulations.html?download=7687%3Askateboarding-street-and-park-competition-rules).

   **Vom Nutzer bestätigt:** Run-Runden haben standardmäßig zwei Runs; die bessere Wertung zählt. Das gilt für Street-Qualifikation, reine Street-Run-Wettbewerbe und Park. In erweiterten Einstellungen soll die Anzahl je Runde über zwei erhöht werden können. Für die Oberfläche wird „Run-Format – bester Run zählt“ empfohlen, damit „Single Run“ nicht mit nur einem Versuch verwechselt wird. Abweichungen vom 2/5/3-Standard werden als eigenes Regelprofil gekennzeichnet; das Standardformat behält zwei Runs und fünf Trickversuche. Score-Skala, Dauer, Gleichstand und gegebenenfalls Re-Runs werden in der späteren Formatabnahme festgelegt; derzeit keine erfundenen Standardwerte übernehmen.

6. **Testaufteilung erläutert:** Der Nutzer übernimmt die fachliche Praxisabnahme anhand einer vorbereiteten Liste: Registrierung, Eltern-/Vereinsablauf, Termine, Fahrten und später Wettbewerbe. Bei der Umsetzung übernimmt Codex die technischen Prüfungen, etwa Datenbank-/Berechtigungstests, Konkurrenzfälle, Typprüfung, Lint und Build, soweit die jeweilige Umgebung verfügbar ist. Beide Ergebnisse werden getrennt dokumentiert. Ein praktikabler Ablauf ist: technische Prüfungen → Testversion und Anleitung → Nutzerabnahme → freigegebene Veröffentlichung.

   Noch vor echten Versandtests wird ein Empfänger ausdrücklich vereinbart. Zusätzlich bedeutet „Zuständigkeit“ die betriebliche Verantwortung für Fehlermeldungen, Wiederherstellung und Konfiguration. Akzeptable Ausfallzeit und möglicher Datenverlust sind spätere Betriebsentscheidungen; der Nutzer muss diese technischen Tests nicht selbst ausführen.

### Nachtrag vom 30.09.2026 (Nutzerfeedback)

7. **Trainingspläne archivieren und löschen.** Ausgeführte Pläne werden archiviert, damit die Planübersicht nicht endlos weiterwächst. Archivierte Pläne bleiben erhalten und können später anderen Trainern zur Verfügung gestellt werden (siehe Punkt 8). Nicht mehr benötigte Pläne können gelöscht werden.

   **Entschieden (30.09.2026):** Ein Plan gilt als ausgeführt und wird archiviert, sobald alle zugeordneten Athleten ihn ausgeführt haben **oder** der Trainer ihn als erledigt markiert. Die manuelle Markierung deckt Fälle ab, in denen Athleten den Plan nicht abschließen (zu schwer, Verletzung, Ausfall). Beim Löschen bleibt die Athletenhistorie (Versuche, Nachweisvideos, Rückblicke) erhalten; gelöscht wird über einen Papierkorb mit Frist wie bei den Parks (Schritt 7c).

8. **Teilen von Trainingsplänen und Vorlagen wiederherstellen.** Früher konnten Trainer Pläne mit anderen Trainern teilen bzw. als Vorlage bereitstellen. Andere Trainer bearbeiten dann ihre eigene Kopie; die Vorlage des Erstellers bleibt unverändert. Diese Möglichkeit ist in der aktuellen Oberfläche nicht mehr auffindbar.

   **Technischer Stand (geprüft am 30.09.2026, nur Code):** Die Teilen-Logik mit Trainer-Empfängern und die Tabelle `training_plan_snapshot_shares` (Snapshot = unabhängige Kopie) sind im Code weiterhin vorhanden (`src/features/plans/plans-view.tsx`, `src/app/trainingsplaene/actions.ts`); die Migration `20260929100000_plan_hub_rights_groups` führt zusätzlich Vereinsvorlagen ein. Vermutlich ist beim Trainingsplan-Redesign nur der Einstieg in der Oberfläche entfallen. Vor der Umsetzung in der laufenden App prüfen.

   **Entschieden (30.09.2026):** Pläne können mit allen Trainern geteilt werden, vereins- und verbandsübergreifend. Bundestrainer dürfen Pläne uneingeschränkt teilen.

   **Noch zu klären:** Sieht der Ersteller, wer seine Vorlage verwendet? Kann er eine überarbeitete Fassung als neue Version nachreichen? Dürfen normale Trainer ebenfalls an alle teilen oder nur gezielt an einzelne Trainer?

9. **Auswertungen: eingeschränkter Zugang für Athleten.** Athleten erhalten einen eigenen, begrenzten Bereich für Selbsteinschätzung und eigene Ziele. **Festgelegt:** Athleten schreiben nie in dieselbe Auswertung wie die Trainer; Selbsteinschätzung und Trainerbewertung werden getrennt gespeichert, damit keine Trainereinträge überschrieben werden. Die Trainerbewertung bleibt für Athleten nur lesbar (sofern sie überhaupt freigegeben wird).

   **Offen, Abstimmung mit anderen Trainern:** Sehen Athleten sich im Vergleich zu anderen (Rangliste)? Argument dagegen: Druck und Vergleich unter Kindern; dafür: möglicher Ansporn. Denkbare Zwischenlösungen: Vergleich standardmäßig aus und vom Trainer pro Gruppe einschaltbar, nur die eigene Platzierung ohne Namen anderer, oder nur Vergleich mit der eigenen früheren Leistung.

   **Entschieden (30.09.2026):** Die bisherige Auswertungsansicht bleibt für Athleten vorerst erhalten, wird aber zu ihrer Selbsteinschätzung. So lassen sich Trainerbewertung und Selbsteinschätzung im Nachhinein vergleichen. Beim PDF-Export wählt der Trainer zwischen zwei Varianten: nur die eigenen Einträge oder die eigenen Einträge zusammen mit der Selbsteinschätzung des Athleten.

   **Noch zu klären:** Sehen Eltern die Auswertung ihrer Kinder? Können Trainer eigene Ziele der Athleten kommentieren oder bestätigen?

### Nachtrag vom 30.09.2026: Registrierung

10. **Hinweiszeile unter „Anrede“ entfernt.** Der Hinweis „Nur für Texte in der App, z. B. „Skaterin“. Jederzeit im Profil änderbar.“ entfällt im Registrierungsformular; das Auswahlfeld selbst bleibt.

## 8. Wichtigste Quellstellen

Die Pfade sind relativ zu `trainer-webapp`; Zeilen entsprechen dem gelesenen Stand.

- Roadmap: `docs/roadmap.md`; Qualitätsrahmen: `docs/ISO_IEC_25002_Zusammenfassung.md`.
- Releasevoraussetzungen, historische Abnahme und Rollback: `docs/carpools-release.md:103`.
- OAuth-Konflikt: `supabase/migrations/20260901113922_add_guardian_registration_approval.sql:197` sowie `src/app/login/actions.ts:62`.
- Eigene Pläne ohne Persistenz: `src/features/plans/plans-view.tsx:542`, Duplikate `:566`, Zieländerungen `:845`.
- Datenquellenmix: `src/app/trainingsplaene/page.tsx:30`; persistierte Freigaben: `src/app/trainingsplaene/actions.ts:415`.
- Zusage als Anwesenheit: `src/features/evaluations/evaluation-view.tsx:327`; Zusage-/Absage-Action: `src/app/kalender/actions.ts:265`.
- Kontoeinladung: `src/app/personen/actions.ts:44`, `src/app/einladung/page.tsx:16`; produktives Fehlen von Tabelle/RPC am 08.09. read-only bestätigt.
- Bereits vorhandener Videonachweis: `src/app/trainingsplaene/actions.ts:176`; `training_video_evidence` und `training_exercise_demo_videos` produktiv vorhanden.
- Testabweichung: `tests/carpool-database.test.mjs:274`; Auswahlhilfe `:126`.
- Rechtstextversionen: `src/lib/legal-documents.ts:6`; dieselben Entwurfsversionen im Registrierungstrigger.
- Kontobereinigung: `supabase/functions/account-cleanup/index.ts` und zugehörige README.

Die bestätigten Planungsänderungen wurden in `roadmap.md` übernommen. Die
Anwendungsumsetzung sowie Commit, Push und Deployment gehören nicht zu diesem
Reviewauftrag.

## 9. Veröffentlichte Visualisierung

Der Reviewbereich wurde am 08.09.2026 auf dem vom Nutzer gewählten bestehenden Miro-Board ergänzt.

- [Review mit Prozessregister, Nachweisen und Empfehlungen](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009998340)
- [00 · TRAINER HUB / Leseschlüssel / Stand 08.09.2026](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836903)
- [01 · Bestehende Organisation und Kalender](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836904)
- [02 · Elternfreigabe und Fahrgemeinschaften](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836905)
- [03 · Training, Nachweise und Auswertung](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836906)
- [04 · Nächste Schritte / Vorschlag A–F](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836907)
- [05 · Danach / Vorschlag G–J](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836908)
- [06 · Qualität, Belege und Entscheidungen](https://miro.com/app/board/uXjVHJmxIQU=/?moveToWidget=3458764683009836909)

Die lokale DSL-Datei beschreibt die sieben Prozess- und Roadmaprahmen. Die tatsächlichen Miro-IDs, Prüfgrenzen und Ergebnisse stehen in `review-evidence-2026-09-08/manifest.json`.
