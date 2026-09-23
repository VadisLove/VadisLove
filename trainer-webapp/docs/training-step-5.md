# Schritt 5 – Persistente Trainingsgrundlage und Trainingsmodus

Stand: 23. September 2026. Implementierung im isolierten Branch
`codex/step-5-training`, Ausgangspunkt `a549ad7` (Produktionscode `add7cee`
zuzüglich Dokumentation). Entwurf und Umsetzung wurden vom Nutzer freigegeben.
Aktuelle technische Ergebnisse und Releasezustand: [Release-Nachweis](training-step-5-release.md).

## Ziel und Umfang

Athleten können ohne Vereinsmitgliedschaft eigene Pläne dauerhaft verwalten und
ein Training zuverlässig starten, fortsetzen und abschließen. Aktiv zugeordnete
Trainer betreuen Einzelne oder Gruppen. Bestehende Planfreigaben bleiben erhalten.

Zielentität sind Planversionen, Trainingssessions und deren Erfassungsablauf.
Nutzungskontext: Smartphone am Trainingsort, wechselnde Verbindung, versehentliches
Schließen, mehrere berechtigte Geräte. Offline-Synchronisierung ist ausgeschlossen.

Enthalten: Plan erstellen/bearbeiten/versionieren, unveränderlicher Planstand pro
Session, stabile IDs, tatsächliche Anwesenheit, Übungen/Tricks, Timer, Trainings-
und Übungsnotizen, Versuche und Landungen pro Athlet, Korrektur offener Sessions,
expliziter Abschluss, verständlicher Speicherstatus.

Ausgeschlossen: Familienverwaltung, Videos/Uploads, Offline-Synchronisierung,
3D-Planung, Contest-Wertung, Chat/Push, ausführlicher Recap, langfristiger Verlauf
und bestätigte Skill-Fortschritte. Bestehende Videofunktionen werden nicht entfernt.

## Bestätigte Produktentscheidungen

Am 23. September 2026 vom Nutzer bestätigt:

- Athleten erfassen ihr Einzeltraining selbst.
- Separate Ansichten für Athleten beim Selbsttraining und Trainer beim betreuten
  Training. Im Selbsttraining entfallen Fahrerwahl und Teilnehmerverwaltung.
- Trainer wählen „Einzelner Fahrer“ oder „Gruppe“.
- In der Gruppe erhält jeder Fahrer eigene Buttons für „Gestanden“, „Nicht
  gestanden“ und Rückgängig (am 23.09.2026 ausdrücklich bestätigt). „Gestanden“
  erfasst einen Versuch und eine Landung; „Nicht gestanden“ nur einen Versuch.
  Das Skateboard-Piktogramm ergänzt die sichtbare Beschriftung „Gestanden“.
- Aktiv zugeordnete Trainer erfassen und korrigieren betreute Trainings.
  Vereinsmitgliedschaft allein erzeugt keine Erfassungsrechte.
- Abgeschlossene Sessions bleiben zunächst unveränderlich.
- Timer je Übung: Start, Pause, Fortsetzen. Ein gestarteter Timer läuft zeitlich
  bei geschlossenem Fenster weiter, bis er pausiert oder die Session beendet wird.
- Athletenidentität und Login werden getrennt. Kinderprofile ohne Login müssen
  später anschließbar sein; handelnde Person und betroffener Athlet sind getrennt.

## Historische Bestandsaufnahme vor der Umsetzung

| Bereich | Nachweis | Befund |
| --- | --- | --- |
| Eigene Pläne | `src/data/trainer-repository.ts`, `src/app/trainingsplaene/page.tsx` | `MockTrainerRepository` liefert Beispielpläne; diese werden neben echten Freigaben angezeigt. |
| Erstellen, Duplizieren, lokale Änderungen | `src/features/plans/plans-view.tsx`, `handleCreatePlan`, `duplicateSelectedPlan`, `updateSelectedPlan` | React-Zustand; kein dauerhafter Speicherpfad für den eigenen Plan. Teilen speichert gesonderte Snapshots. |
| Freigaben | `src/app/trainingsplaene/actions.ts`, `src/data/shared-training-plan-repository.ts` | Serverseitiges Schreiben/Lesen von `training_plan_snapshot_shares`; vorhandene Empfänger- und RLS-Regeln berücksichtigen. |
| Fortschritt / XP | dieselben Dateien; Migration `20260714113649_trick_progress_permissions_xp.sql` | Persistenter Trickstatus und XP-Pfad vorhanden. Status bzw. Bestätigung ist keine Session-Versuchsquote. |
| Planversionen | `supabase/schema.sql`, `training_plans`, `training_plan_versions` | Tabellen definiert, aber vom aktuellen eigenen Planeditor nicht genutzt. `organization_id` ist verpflichtend; persönliche Pläne erfordern Anpassung einschließlich Rechteprüfung. |
| Athletenidentität | `supabase/schema.sql`, `profiles`; Fortschrittsmigration | Profile sind an `auth.users` gekoppelt. Sessionmodell braucht eine eigenständige Athleten-ID mit optionaler Login-Verknüpfung. |
| Trainerrechte | `private.has_active_trainer_athlete_relationship`, `relationships` | Aktive Trainer-Athlet-Beziehung existiert; nicht allein Organisationsrollen verwenden. |
| Training als Session | Suche in `src` und `supabase` nach Sessiontabellen/-referenzen | Kein eigener persistenter Trainingssession-Ablauf gefunden. |
| Anwesenheit in Auswertung | `src/features/evaluations/evaluation-view.tsx` | `confirmed` aus Kalenderteilnahme wird für Anwesenheitswerte verwendet; neue tatsächliche Anwesenheit getrennt führen. |
| Videos | Repository und Server Actions | Bestehende Datenbankpfade vorhanden. Kein Ausbau in diesem Paket. |

Das Vorhandensein von SQL und Repository-Code ist kein Nachweis angewendeter
Migrationen, wirksamer Produktions-RLS oder erfolgreich getesteter Nutzerabläufe.
Viele vorhandene Dateien sind verändert oder unversioniert; keine pauschale
Übernahme dieser Änderungen in einen späteren Release.

## Bedienungsentwurf v2 – getrennte Rollen

[Lokale interaktive Entwurfstafel](design/training-v2.html)

Vier Ansichten: Athlet/Selbsttraining, Trainer/Auswahl, Trainer/einzelner Fahrer,
Trainer/Gruppe. Die Gruppenerfassung zeigt den ausgewählten Fahrer in einem horizontalen Slider.
Als Entwurfsvorschlag kann der Trainer aus derselben Gruppensession die
Einzelansicht öffnen; dies erzeugt keine neue Session. „Bewerten“ meint hier
Versuchserfassung, keine Contest-Wertung oder automatische Skill-Bestätigung.

Figma meldete beim Anlegen der v2-Seite das MCP-Aufruflimit des Starter-Plans.
Der Kontostatus wurde mit `whoami` bestätigt. Der bisherige Figma-Stand bleibt
unverändert; v2 liegt deshalb ausschließlich als lokale HTML-Entwurfstafel vor.
Farben folgen der App, Schrift in dieser lokalen Vorschau ist Arial als explizite
Annäherung; für die Anwendung bleiben Geist/Oswald vorgesehen.

Browserprüfung am 23.09.2026: Gestanden für Alex ändert 3/5 auf 4/6 (67 %) in
Einzel- und Gruppenansicht; Rückgängig stellt 3/5 (60 %) wieder her. Andere Fahrer
bleiben unverändert. Gruppenansicht im schmalen Browser visuell geprüft. Dies ist
nur eine Prüfung der Vorschau. Timer, Speichern und weitere Sessionabläufe sind
hier nicht implementiert. Alle Zähler gehen beim Neuladen auf Beispieldaten zurück.
Die neue Rollenaufteilung ersetzt den gemischten Ablauf von v1. Entwurfsabnahme
für v2 einschließlich Fahrerslider ist erfolgt; die Anwendung ist inzwischen implementiert.

### Ergänzung v2: Fahrerslider

Auf Nutzerwunsch ersetzt eine horizontale Fahrerauswahl die untereinander
stehenden Fahrerkarten. Namen und Vor-/Zurück-Pfeile wählen den Fahrer direkt;
horizontales Wischen durch die Karten aktualisiert die aktive Auswahl. Darunter
bleiben die Buttons „Gestanden“, „Nicht gestanden“ und Rückgängig personengebunden.
Ein Ansichtswechsel verändert keine Ergebnisse. Erster und letzter Fahrer haben
jeweils nur eine verfügbare Pfeilrichtung; Tastaturpfeile funktionieren im
Namensbereich. Verdeckte Karten sind für Tastatur und Screenreader inaktiv.

Lokale Browserprüfung im schmalen Viewport: Vor/Zurück und Namenswahl geprüft;
Kim 2/4 → 3/5, Wechsel zu Alex und zurück erhält Kims 3/5 und lässt Alex bei 3/5.
Horizontales Scrollen schaltet von Kim zu Sam; Sam zeigt weiterhin keine Quote.
Nur Entwurf geprüft, keine dauerhafte Speicherung oder Produktionsänderung.

## Bedienungsentwurf v1 – bisheriger Figma-Stand

[Figma – sieben mobile Ansichten](https://www.figma.com/design/5d2PBsM36rcYJH758UAPBh)

Die neuen Ansichten verwenden die vorhandenen Farben und Schriften Geist/Oswald.
Beispielnamen und Zählwerte sind ausschließlich Entwurfsdaten.

1. **Plan erstellen/bearbeiten:** Name, Ziel, geordnete Übungen; weitere Angaben
   zurückhaltend. Speichern erzeugt beim Bearbeiten eine neue Version.
2. **Start und Teilnehmer:** fester Planstand; Anwesenheit ausdrücklich bestätigen.
   Kalender-Zusage ist nur ein Hinweis. Einzeltraining benötigt keinen Verein.
3. **Laufende Übung:** Athlet auswählen; „Gelandet“ und „Nicht gelandet“ erfassen
   jeweils einen Versuch. Rückgängig, Timer und Notizen direkt erreichbar.
4. **Abschluss:** Trainingsnotiz, explizite Bestätigung und anschließend bestätigter
   Speicherstatus. Die Figma-Karte unten stellt den nachfolgenden Zustand dar.
5. **Fortsetzen:** letzte gespeicherte Übung und Timerstatus; ohne Versuche keine
   Prozentangabe. Nur serverbestätigte Daten sind wiederherstellbar.
6. **Leer/Laden/Ladefehler:** getrennte alternative Zustände; Ladefehler darf keine
   scheinbar erfolgreich geladene leere Liste erzeugen.
7. **Speichern/Fehler/Konflikt:** klare Rückmeldung, Wiederholung derselben Aktion,
   neueren Stand vergleichen statt unbemerkt überschreiben. Abschluss bleibt bei
   Fehler offen. Offene Eingabe vor Nachladen sichtbar behalten.

Entwurfsziel: große, mindestens 44 px hohe Aktionsflächen, lesbare Eingaben,
eine hervorgehobene Hauptaktion. Das ist ein Gestaltungsziel, noch kein Nachweis
der mobilen Bedienbarkeit in der Anwendung. Figma zeigt statische Ablaufansichten,
keinen vollständig verdrahteten Prototyp. Die spätere v2 ersetzt diesen Entwurf.

## Technische Leitplanken für Phase 2 und 3

- Vor Migrationen produktives Schema und Migrationshistorie read-only abgleichen.
  Bestehende Pläne und Freigaben weder überschreiben noch aus Beispieldaten ableiten.
- Eigene Plan-ID, unveränderliche Versions-ID und stabile Übungs-IDs; Session
  referenziert genau einen Planstand, auch beim Start aus einer vorhandenen Freigabe.
- Eigenständige Athleten-ID, stabile Session-Teilnehmer-ID, getrenntes `recorded_by`.
  Berechtigungen aus bestätigten Beziehungen serverseitig und per RLS prüfen.
- Sessionstart und jede Erfassungsaktion besitzen eine wiederverwendbare
  Idempotenz-ID. Eine Wiederholung erzeugt keine zweite Session oder Zählung.
- Revisionen und atomare Schreiboperationen verhindern verlorene Änderungen.
  Veraltete Revisionen erzeugen einen sichtbaren Konflikt.
- Versuche/Landungen konsistent speichern; keine negativen Werte, keine Landungen
  über der Versuchszahl. Quote = Landungen / Versuche nur bei Versuchen > 0.
- Korrekturen offener Sessions nachvollziehbar speichern. Abschluss sperrt weitere
  Änderungen und stoppt Timer atomar; Wiederholung des Abschlusses ist unschädlich.
- Timer aus gespeicherter Laufzeit und Startzeit ableiten, nicht aus flüchtigen
  Browserintervallen. Kein Offline-Erfassungsversprechen.

## Qualität und Abnahmekriterien

Qualitätsrahmen: `ISO_IEC_25002_Zusammenfassung.md`. Keine technischen Prüfungen
oder Praxisabnahmen werden allein aus dem Entwurf als bestanden bewertet.

| Merkmal | Verfahren | Abnahmekriterium |
| --- | --- | --- |
| Funktionale Eignung | vollständiger Browserablauf | Plan speichern → starten → Anwesenheit/Ergebnisse → neu laden → fortsetzen → abschließen → erneut öffnen; Werte stimmen überein. |
| Datenintegrität | Datenbank-/Integrationstests | Planänderung verändert alte Session nicht; IDs bleiben stabil; Quote nur aus erfassten Versuchen. |
| Zuverlässigkeit | Wiederholungen, Verbindungsfehler, zwei Clients | Keine Duplikate, keine still überschriebenen Änderungen, kein falscher Speichererfolg. |
| Zugriffsschutz | fremde Konten, direkte API-/RLS-Aufrufe | Zugriff ohne gültige Rechte verweigert, auch mit bekannter ID und Vereinsmitgliedschaft. Abschluss serverseitig gesperrt. |
| Bedienbarkeit | mobile Browserprüfung und Nutzer-Praxisabnahme | Kernaktionen und Fehlerbehebung verständlich, keine abgeschnittenen Aktionen; ohne Versuche keine irreführende Quote. |
| Kompatibilität | Kalender-/Fahrgemeinschaftsregression | Zusagen, Fahrten und bestehende Planfreigaben bleiben nutzbar. |
| Wartbarkeit | Review, Typprüfung, Lint, Tests, Build | dokumentierte Datenverträge und verständliche Kommentare; passende Prüfungen erfolgreich. |

## Praxisprüfliste für den Nutzer

- [ ] Ohne Verein eigenen Plan speichern und nach Neuladen bearbeiten.
- [ ] Einzeltraining starten; Landung, Fehlversuch und Rückgängig nachvollziehen.
- [ ] Als zugeordneter Trainer Gruppe betreuen und tatsächliche Anwesenheit ändern.
- [ ] Übungs- und Trainingsnotizen speichern und nach Neuladen wiederfinden.
- [ ] Fenster schließen, Sitzung fortsetzen und vereinbartes Timerverhalten prüfen.
- [ ] Fehler/Konflikt erkennen und ohne Doppelzählung auflösen.
- [ ] Plan ändern; bereits gestartete Session behält ihren Planstand.
- [ ] Training ausdrücklich abschließen und unveränderliche Ergebnisse wieder öffnen.

## Nachweis und Freigaben

| Gegenstand | Stand am 23.09.2026 |
| --- | --- |
| Lokale Bestandsaufnahme | Quellcode, Schema und relevante Migrationen gelesen; kein Live-Datenbanktest. |
| Lokale v2 | Getrennte Rollenansichten und fahrerbezogene Zählung erstellt; Browserprüfung wie oben. Figma-Übernahme durch Aufruflimit blockiert. |
| Figma v1 | Sieben Ansichten erstellt, Screenshots und Text/Layout geprüft. |
| Fachliche Regeln | Erfassungsrechte, Abschluss-Sperre und Timerverhalten durch Nutzer bestätigt. |
| Entwurfsbesprechung | v2 einschließlich horizontalem Fahrerslider vom Nutzer freigegeben. |
| Implementierung / automatisierte Tests | Implementiert, lokale technische Nachweise im Release-Dokument. |
| Staging / Produktionsrelease / Praxisabnahme | Kein separates Staging; Releasezustand im Release-Dokument. Fachliche Praxisabnahme durch Nutzer noch offen. |

Vor einem freigegebenen Produktionsrelease passende technische Prüfungen,
eindeutiges Sicherungstag des letzten stabilen Produktionsstands, selektiver
Commit/Push und Prüfung der Produktions-URL gemäß `AGENTS.md`.
