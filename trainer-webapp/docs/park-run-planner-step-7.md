# Schritt 7 – Minimalistischer 3D-Park- und Run-Planer

Stand: 24. September 2026. Implementierung im Branch
`claude/skateparks-tricks-system-1c780a`, Ausgangspunkt `codex/step-5-training`
(`0d7975c`). Schritt 6 wird vom Nutzer parallel fertiggestellt; beide Pakete
haben keine fachlichen Abhängigkeiten zueinander (vom Nutzer am 24.09.2026 bestätigt).

## Ziel

Athleten und Trainer bauen echte Skateparks als ruhige Low-Poly-Modelle nach und
planen darin Runs: nummerierte Tricks an Obstacles, sichtbare Fahrtrichtung,
Start- und Endpunkt. Ein Run gehört genau einem Athleten und kann einem
Trainings- oder Contest-Termin im Kalender zugeordnet werden.

Zielentität: Parkmodelle mit Versionen, Trick-Katalog und Runs.
Nutzungskontext: Smartphone am Park (Run ansehen und anlegen) sowie Tablet/Desktop
für das Nachbauen eines Parks. Wechselnde Verbindung; keine Offline-Synchronisierung.

## Bestätigte Produktentscheidungen (24.09.2026)

- **Parks sind öffentlich.** Jeder angemeldete, aktive Nutzer sieht alle Parks,
  kann neue Parks anlegen und in jedem Park Runs bauen.
- **Park ändern** dürfen der Ersteller sowie Trainer und Funktionäre
  (Kontotyp Trainer oder Organisationsmitarbeiter bzw. Trainer-, Vorstands-,
  Vorsitz- oder Fachreferentenrolle in einer Organisation). Jede Änderung
  erzeugt eine neue, unveränderliche Version. Runs bleiben an ihre Version gebunden.
- **Darstellung:** 3D mit dem Luftbild als Boden, darauf Low-Poly-Obstacles aus
  der Bibliothek; zusätzlich eine Draufsicht.
- **Luftbild:** eigener Upload (Screenshot, Parkplan, Drohnenfoto). Der Nutzer
  bestätigt die Nutzungsrechte und legt die reale Bildbreite in Metern fest.
  Kein externer Kartendienst.
- **Trick-Katalog:** gemeinsam, mit gängigen Tricks vorbefüllt. Fehlende Tricks
  kann jeder vorschlagen und sofort selbst verwenden; für alle sichtbar werden
  sie erst nach Freigabe durch Trainer bzw. Funktionäre.
- **Pins:** Tricks werden an ein ganzes Obstacle angepinnt. Ein Obstacle kann
  mehrere Pins tragen. Nummerierung und eine Linie mit Pfeilen zeigen Reihenfolge
  und Fahrtrichtung. Jeder Run hat einen Start- und einen Endpunkt.
- **Zuordnung:** Run gehört genau einem Athleten; optional ein Kalendertermin
  vom Typ Training oder Contest.
- **Rechte an Runs:** Athlet selbst und aktiv zugeordnete Trainer lesen und
  bearbeiten. Aktiv verknüpfte Eltern lesen mit.
- **Scores:** Ziel-Score und tatsächlich erhaltener Gesamtscore sind optionale
  Felder am Run, vor allem um Contest-Ergebnisse festzuhalten. Vergleich,
  Varianten und Verlauf folgen in Schritt 8.

## Rollen

| Rolle | Parks | Runs | Trick-Katalog |
| --- | --- | --- | --- |
| Angemeldeter Nutzer | ansehen, anlegen, eigene ändern | – | freigegebene nutzen, vorschlagen |
| Athlet | wie oben | eigene anlegen, ändern, löschen | wie oben |
| Aktiv zugeordneter Trainer | wie oben, alle Parks ändern | für zugeordnete Athleten anlegen, ändern, löschen | Vorschläge freigeben/ablehnen |
| Funktionär (Vorstand, Vorsitz, Fachreferent, Organisationsmitarbeiter) | alle Parks ändern | – | Vorschläge freigeben/ablehnen |
| Aktiv verknüpfte Eltern | ansehen | Runs ihres Kindes lesen | – |

## Enthalten

- Parkliste mit Suche, Park anlegen (Name, Ort).
- Parkansicht in 3D: Orbit-Steuerung, Draufsicht, Luftbild als Boden, Raster in Metern.
- Park-Bearbeitungsmodus (nur dort Werkzeuge): Obstacle-Bibliothek mit Quarter,
  Bank, Bowl, Ledge, Hubba, Treppe, Rail, Manual Pad und Wall; platzieren,
  verschieben (Ziehen oder Werte), drehen, Maße ändern, löschen; Luftbild hochladen,
  Breite, Drehung und Deckkraft festlegen. Speichern erzeugt eine neue Version.
  Obstacles behalten über Versionen hinweg ihre stabile ID.
- Run-Editor: Athlet, Titel, optionaler Termin, Ziel- und Ist-Score, Notiz,
  Start- und Endpunkt, geordnete Schritte (Obstacle + Trick + optional Stance und
  Frontside/Backside + Notiz), Reihenfolge ändern, Schritte entfernen.
- Anzeige: nummerierte Pins je Obstacle (mehrere gestapelt), Linie Start →
  Obstacles → Ende mit Richtungspfeilen, Schrittliste.
- Runs eines Parks und „Meine Runs“ bzw. Runs der betreuten Athleten.
- Trick-Katalog mit Vorschlag und Freigabe.
- Serverseitige Prüfung aller Eingaben, Idempotenz über Request-IDs,
  Revisionen gegen stilles Überschreiben (Muster aus Schritt 5).

## Ausdrücklich ausgeschlossen

GLB/glTF- und Heightmap-Import (späteres Teilpaket 7b), externe Karten- oder
Satellitendienste, automatische Parkrekonstruktion, Pins an Teilbereichen eines
Obstacles, Run-Varianten/Verlauf und Score-Vergleich (Schritt 8), Contest-Formate
und Judge-Modus (Schritt 10), Videos an Obstacles (Schritt 13), Anzeige der Runs
im Kalendertermin selbst, Löschen von Parks, Offline-Nutzung.

## Qualitätsmerkmale nach ISO/IEC 25002 und Prüfverfahren

| Merkmal | Prüfung | Abnahmekriterium |
| --- | --- | --- |
| Funktionale Eignung | PGlite-Datenbanktests, Domain-Tests, Browserablauf | Park anlegen → Obstacles setzen → speichern → Run mit ≥ 3 Schritten, Start/Ende → speichern → nach Neuladen identisch. |
| Sicherheit | RLS- und Command-Tests je Rolle | Fremde lesen keine Runs; Eltern nur lesen; nur Ersteller/Trainer/Funktionäre ändern Parks; nicht freigegebene Tricks nur für Vorschlagende und Prüfer sichtbar. |
| Zuverlässigkeit | Tests zu Request-Wiederholung und Revision | Gleiche Request-ID erzeugt keine Dopplung; veralteter Stand liefert Konflikt statt Überschreiben. |
| Wartbarkeit | Typprüfung, Lint, Build | Fehlerfrei. |
| Benutzbarkeit | lokale Browserprüfung schmal/breit | Run-Ansicht und -Anlage auf 375 px Breite ohne horizontales Scrollen bedienbar; Bearbeitungswerkzeuge nur im Bearbeitungsmodus sichtbar. |
| Kompatibilität | Runs nach Parkänderung | Run zeigt weiterhin die Version, an die er gebunden ist. |

Technische Prüfung durch den Entwicklungsagenten, fachliche Praxisabnahme durch
den Nutzer anhand der Prüfliste im Release-Nachweis; beide getrennt dokumentiert.
