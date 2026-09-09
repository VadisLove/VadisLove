# Trainer Hub: Roadmap

Stand: 9. September 2026. Fahrgemeinschaften bleiben der erste Release. Die am
8. September bestätigten Entscheidungen aus dem Roadmap-Review sind eingearbeitet.
Die folgenden Pakete sind nach Abhängigkeiten und Produktnutzen priorisiert,
besitzen aber noch keine verbindlichen Kalendertermine. Vor jeder Umsetzung
werden Umfang, Datenschutz und Auswirkungen auf bestehende Rollen fachlich
konkretisiert.

## Produkt- und UX-Grundsätze

- Die Oberfläche bleibt mobil, minimalistisch und auf die nächste sinnvolle
  Aktion fokussiert. Pro Ansicht gibt es möglichst nur eine hervorgehobene
  Hauptaktion.
- Häufig benötigte Angaben sind sofort erreichbar. Seltene Konfigurationen,
  Bewertungsdetails und administrative Werkzeuge liegen unter eindeutig
  benannten Bereichen wie „Weitere Einstellungen“ oder in einem separaten
  Bearbeitungsmodus.
- Sinnvolle Standardwerte, Vorlagen und kontextabhängige Vorauswahl reduzieren
  Eingaben. Neue Nutzer sollen Kernabläufe ohne Erklärung abschließen können.
- Dashboards zeigen zuerst Zusammenfassungen und offene Aufgaben. Detaildaten,
  historische Vergleiche und Expertenoptionen werden erst auf Wunsch geöffnet.
- 3D-Ansichten bleiben visuell ruhig: wenige Farben, klare Formen, reduzierte
  Beschriftungen und keine dauerhaft eingeblendeten Bearbeitungswerkzeuge.
- Neue Funktionen müssen in den bestehenden Kalender-, Trainingsplan-,
  Auswertungs- und Organisationsablauf passen. Parallele Insellösungen werden
  vermieden.

## Aktueller Arbeitsschritt A: verlässliche Basis und Release 1

Ziel ist, Elternfreigabe und Fahrgemeinschaften kontrolliert produktiv zu
betreiben. Der fachliche Umfang, der geprüfte Release-Stand und die Rollbackpunkte
sind dokumentiert. Der technische Produktionsstart für den kleinen bestätigten
Testpersonenkreis ist am 09.09.2026 erfolgt.

| Voraussetzung | Stand | Nächste Aktion |
| --- | --- | --- |
| Umfang und Rollen für Release 1 | Entschieden | Bei der Abnahme gegen die Festlegungen am Ende dieses Dokuments prüfen. |
| Betreiber- und Kontaktdaten für Rechtstexte | Offen | Betreiber, Rechtsform, vollständige Anschrift und Kontakt festlegen; Texte vor Veröffentlichung prüfen lassen. |
| Produktadresse und Mail-Absender | Adresse bestätigt; Testabsender eingeschränkt | `https://trainer-webapp-ruby.vercel.app` beibehalten; allgemeinen verifizierten Resend-Absender vor breiter Freigabe bereitstellen. |
| Produktionsgeheimnisse | Erledigt und geprüft | Werte weiter ausschließlich in Vercel/Vault verwalten und bei Rotation sicher synchronisieren. |
| Echter Versandtest | Bestätigt, mit Spam-Befund | Zwei Testmails `delivered`, Empfang und Links bestätigt; Zustellbarkeit mit allgemeinem Produktionsabsender erneut prüfen. |
| Aktueller Release-Nachweis | Lokal, isoliert und technisch produktiv bestätigt | Ergebnisse und Grenzen im [aktuellen Preflight-Bericht](release-1-preflight-2026-09-08.md); fachliche Praxisabnahme nachführen. |
| Produktive Datenbank und Anwendung | Für kontrollierten Testpersonenkreis aktiviert | Release stabil beobachten, fachliche Kernabläufe mit Testkonten abnehmen und Befunde dokumentieren. |

Der technische Produktionsschritt ist abgeschlossen. Die nächsten Arbeiten in
diesem Roadmap-Schritt sind die fachliche Praxisabnahme, die Beobachtung des
kontrollierten Betriebs, ein allgemeiner verifizierter Mailabsender sowie die
Vervollständigung der Rechtstexte. Details und Rollback:
[Fahrgemeinschaften – Release](carpools-release.md).

Bestätigte Bezeichnung vom 09.09.2026: Fahrten zeigen im Formular „Zielort“
beziehungsweise „Destination“. Das bestehende interne Datenbankfeld bleibt zur
Abwärtskompatibilität unverändert; Datenmodell und Berechtigungen ändern sich nicht.

Bestätigte Entscheidung vom 08.09.2026: Es bleibt bei genau einer maßgeblichen
öffentlichen Adresse `https://trainer-webapp-ruby.vercel.app`. Keine neue Marke,
kein neues Vercel-Projekt und keine dauerhaft verwendete Vorschauadresse.
Lokale Worktrees und Vercels interne Rollback-Historie bleiben zulässig.

## Priorisierte Funktionspakete

| Prio | Funktionspaket | Kernumfang und Nutzen |
| ---: | --- | --- |
| 1 | Fahrgemeinschaften abschließen und stabilisieren | Hin-/Rückfahrt, Fahrerbestätigung, Elterninformationen und sichere Änderungsabläufe zuverlässig produktiv betreiben. |
| 2 | Einfache Anmeldung und Profilerstellung | Anmeldung mit Google und Apple zusätzlich zu E-Mail/Passwort. Eine neue Auth-Identität erhält bis zum abgeschlossenen Profil, der Organisationsauswahl, der Dokumentannahme und gegebenenfalls der Elternfreigabe nur einen gesperrten Onboarding-Zustand. Provider-Konfiguration und öffentliche Freischaltung erfolgen, sobald Produktname und Domain feststehen. |
| 3 | Passwort sicher ändern | Angemeldete Nutzer können in den Einstellungen ein neues Passwort eingeben, bestätigen und dauerhaft speichern. Passwortregeln, erneute Authentifizierung bei Bedarf, verständliche Fehlermeldungen und eine eindeutige Erfolgsmeldung schützen den Ablauf. Konten, die ausschließlich Google oder Apple verwenden, erhalten eine passende Erklärung statt eines unklaren Passwortformulars. |
| 4 | Verbindliche Kalenderkommunikation | Rückmeldefristen, gezielte Erinnerungen, bestätigungspflichtige wichtige Terminänderungen und persönliches Kalender-Abo reduzieren offene Rückfragen. |
| 5 | Familienübersicht und Teilnahmeorganisation | Dauerhafte Kinderprofile zunächst ohne eigenen Login. Eltern können eigene Kinder anlegen; ausdrücklich berechtigte Vereinsrollen können minimale Kinderprofile für ihren Verein erfassen. Geprüfte Beziehungen steuern den Zugriff. Mehrere Kinder und offene Aufgaben bilden den ersten Teil; Abwesenheiten und Trainingswarteliste folgen als getrennte Abläufe. |
| 6 | Persistente Trainingsgrundlage und Trainingsmodus | Eigene Pläne und Versionen dauerhaft speichern. Danach tatsächliche Anwesenheit getrennt von Zusagen, Übungen, Timer, Notizen sowie Versuche und Landungen je Trick in einer eindeutig referenzierten Session erfassen. Erfolgsquoten entstehen aus realen Sessions statt nur aus Planstatus. |
| 7 | Session-Abschluss und Fortschrittsverlauf | Aus den Trainingsdaten einen prüfbaren Session-Recap mit bearbeiteten Skills, Versuchen, Landungen, Trainerhinweisen, nächsten Zielen und bestätigten Fortschritten erzeugen. Athleten und verknüpfte Eltern sehen eine kompakte Zusammenfassung. |
| 8 | Offline-Unterstützung für den Trainingsort | Trainingsplan, Teilnehmerliste und laufende Session ohne stabile Verbindung nutzbar machen; Anwesenheit, Versuche, Landungen und Notizen anschließend konfliktarm synchronisieren. Stabile IDs, Revisionen und Konfliktregeln werden bereits mit dem Sessionmodell festgelegt. |
| 9 | Eigener Video-Workflow | Nach dem Offline-Trainingsablauf Videos direkt aufnehmen oder hochladen, Training, Athlet, Trick und später einem Park-Obstacle zuordnen; Trainerprüfung, Textfeedback und sichere Zugriffsregeln. Zeitmarken, Zeichnungen, Sprachfeedback und optionale KI-Vorschläge folgen als vertiefte Werkzeuge. |
| 10 | Minimalistischer 3D-Park- und Run-Planer | Skateparks als einfache Low-Poly-Modelle aus einer Obstacle-Bibliothek aufbauen; optional GLB/glTF oder Heightmaps importieren. Tricks an stabile Obstacles anpinnen, Richtung und Reihenfolge festlegen sowie Runs Athleten, Trainings oder Contests zuweisen. |
| 11 | Strategische Run-Auswertung und Scores | Erwarteten beziehungsweise angestrebten Score und den tatsächlich erhaltenen Score pro Run speichern. Run-Varianten, Trickfolge, Obstacles und historische Ergebnisse vergleichbar machen, damit Athleten Risiko und Punktepotenzial strategisch abwägen können. Vertiefte Wertungskriterien bleiben standardmäßig eingeklappt. |
| 12 | Strukturiertes Curriculum | Skill-Pakete, Voraussetzungen, Progressionslevel, Session-Vorlagen und Versionierung auf Vereins-, Landes- und Bundesebene aufbauen. Lokale Anpassungen bleiben möglich, ohne den freigegebenen Standard zu überschreiben. |
| 13 | Contest Hub und Live-Wertung | Startlisten, Run-Zuordnung, Judge-Modus, mehrere Wertungsrichter, Korrekturen, Gleichstand, Ausfälle, Live-Ergebnisse und Übernahme in Athletenprofile. Street unterstützt Run, 2/5/3 sowie Run-Qualifikation mit 2/5/3-Finale; Park unterstützt Run. Run-Runden besitzen standardmäßig zwei Runs, von denen der bessere zählt; mehr Runs liegen in erweiterten Einstellungen. |
| 14 | Verbands-Cockpit | Vergleichbare Bewertungsstandards, datenschutzgerechte aggregierte Statistiken, Kader- und Talententwicklung sowie Freigaben entlang der bestehenden Bundes-/Landes-/Vereinsstruktur. |
| 15 | Chat und Push | Transaktionsmails für Elternfreigabe, Fahrten, Fristen, Erinnerungen und wichtige Änderungen werden bereits mit den zugehörigen frühen Paketen umgesetzt. Trainer–Athlet-, Trainer–Eltern- und Gruppennachrichten sowie Push bleiben ein späteres, getrennt bewertetes Paket mit Moderationskonzept. |
| 16 | Native Apps | iOS- und später Android-App erst nach stabilen Web-Kernabläufen, finalem Produktnamen und geklärter Domain umsetzen. Kamera, Push, Offline-Training und native Anmeldung bilden dann den Hauptnutzen gegenüber einer bloßen Web-App-Hülle. |

## Festlegungen für Google- und Apple-Anmeldung

- Google und Apple erscheinen auf der Anmeldung als gleichwertige, einfache
  Alternativen zu E-Mail und Passwort. Zusätzliche Provider oder technische
  OAuth-Einstellungen werden Nutzern nicht angezeigt.
- Ein erfolgreicher Provider-Login überspringt keine fachliche Registrierung.
  Fehlende Profildaten, Kontotyp, Geburtsdatum, Organisation und gegebenenfalls
  Elternfreigabe werden anschließend in einem kurzen Onboarding ergänzt.
- Bestehende Konten dürfen durch gleiche oder verifizierte E-Mail-Adressen nicht
  unbemerkt dupliziert werden. Kontoverknüpfung und Konfliktfälle werden vor der
  produktiven Aktivierung festgelegt und getestet.
- Die öffentliche Provider-Konfiguration benötigt einen finalen Produktnamen,
  verlässliche Callback-URLs, Datenschutz- und Nutzungsseiten sowie eine
  produktive Domain. Apple-Schlüsselrotation und Provider-Geheimnisse werden als
  dokumentierte Betriebsaufgaben eingeplant.

## Festlegungen für Kinderprofile und Elternzugriff

- Ein Kind kann ein dauerhaftes Athletenprofil ohne eigene E-Mail und ohne
  eigenen Login besitzen. Eltern und Vereinsmitarbeitende verwenden immer ihr
  eigenes Konto; handelnde Person und betroffenes Kind bleiben getrennt.
- Eltern dürfen ein Kinderprofil anlegen und nach geprüfter Verknüpfung für das
  Kind handeln. Weitere Sorgeberechtigte benötigen eine eigene Verknüpfung.
- Nur ausdrücklich berechtigte Vereinsrollen dürfen ein minimales Kinderprofil
  innerhalb ihrer Organisation anlegen. Die Anlage macht sie nicht zu
  Sorgeberechtigten und erlaubt keine beliebigen Erklärungen für das Kind.
- Vereinsunterlagen müssen Zweck, Verantwortlichkeit und die tatsächlich
  benötigte Verarbeitung abdecken. Optionale Mediennutzung und Veröffentlichung
  werden getrennt behandelt. Dokumentversion, Datum, prüfende Stelle und eine
  interne Nachweisreferenz bleiben nachvollziehbar.
- `guardian_app` und `guardian_email` sind Benachrichtigungseinstellungen und
  begründen keine Elternrechte. Zugriff folgt ausschließlich aus aktiven,
  geprüften Beziehungen.
- Ein später zulässiger eigener Login wird mit demselben Athletenprofil
  verbunden. Die Löschung eines Elternkontos darf die Kinderhistorie nicht
  unbeabsichtigt löschen.

## Festlegungen für den 3D-Park- und Run-Planer

- Der erste Park-Editor verwendet wiederverwendbare, bewusst einfache
  Low-Poly-Elemente wie Quarter, Bank, Bowl, Ledge, Hubba, Treppen, Rail,
  Manual Pad und Wall. Fotorealismus ist kein Ziel.
- Ein Luftbild oder Parkplan kann als Positionierungshilfe im Hintergrund
  liegen. Automatische Rekonstruktion aus öffentlichen Geländedaten ist keine
  Voraussetzung, weil diese Skatepark-Obstacles meist nicht genau genug erfasst.
- GLB/glTF-Modelle und echte Heightmaps bleiben optionale Importwege. Importierte
  Geometrie wird vor Veröffentlichung geprüft und mit stabilen Obstacle-IDs
  versehen.
- Trainer und Athleten sehen standardmäßig nur Park, Run-Reihenfolge, Tricks und
  Scores. Verschieben, Skalieren, technische Modellwerte und Obstacle-Verwaltung
  erscheinen ausschließlich im Park-Bearbeitungsmodus.
- Ein Run besteht mindestens aus Park, Athlet, geordneter Trickfolge und den
  referenzierten Obstacles. Richtung, Stance, Notizen und Ziel-Score sind
  optionale Angaben.
- Nach Training oder Contest kann der tatsächlich erhaltene Gesamtscore erfasst
  werden. Falls fachlich erforderlich, können Teilwertungen oder Scores je
  Run-Schritt unter „Weitere Einstellungen“ ergänzt werden.
- Geplanter und tatsächlicher Score, erfolgreiche beziehungsweise ausgelassene
  Run-Schritte sowie frühere Varianten werden vergleichbar dargestellt. Die
  Oberfläche gibt keine automatische Wettkampfentscheidung vor, sondern liefert
  eine nachvollziehbare strategische Grundlage.
- Modellversionen werden gespeichert, damit bestehende Runs auch nach einer
  Überarbeitung des Parkmodells verständlich und auswertbar bleiben.

## Festlegungen für Wettbewerbsformate

- Jede Qualifikation und jedes Finale ist eine eigene, versionierte Runde mit
  Disziplin, Format, Run- beziehungsweise Trickanzahl und Wertungsregeln.
- Street unterstützt reine Run-Runden, 2/5/3 und die Kombination aus
  Run-Qualifikation und 2/5/3-Finale. Park unterstützt Run-Runden.
- Eine Run-Runde enthält standardmäßig zwei Runs; die bessere Wertung zählt.
  Unter „Weitere Einstellungen“ kann die Anzahl je Runde erhöht werden.
- Das Standardprofil 2/5/3 besteht aus zwei Runs und fünf einzelnen
  Trickversuchen. Der beste Run und die zwei besten Trickwertungen bilden das
  Rundenergebnis. Abweichungen werden als eigenes Regelprofil gespeichert.
- Score-Skala, Dauer, Gleichstand, Korrektur und Re-Runs werden vor Umsetzung des
  Contest Hubs fachlich abgenommen und nicht aus unterschiedlichen Regelwerken
  vermischt.

## Qualitäts- und Abnahmeregeln

Für jedes Paket wird der lokale Leitfaden zu ISO/IEC 25002 angewendet:
Zielentität und Nutzungskontext festlegen, relevante Qualitätsmerkmale auswählen,
Mess- oder Prüfverfahren und Grenzwerte vereinbaren, Ergebnis und bekannte
Grenzen dokumentieren und nach relevanten Änderungen erneut bewerten.

Der Nutzer übernimmt die fachliche Praxisabnahme anhand einer vorbereiteten
Prüfliste. Codex übernimmt bei der Umsetzung die technischen Prüfungen, darunter
Berechtigungs- und Datenbanktests, Konkurrenzfälle, Typprüfung, Lint und Build.
Ein Ablauf gilt nur für den jeweils dokumentierten Prüfkontext als fertig.

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
