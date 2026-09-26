# Schritt 7b – Park-Untergrund aus amtlichen Daten und 3D-Modellen

Stand: 26. September 2026. Branch `claude/step-7b-park-ground`, Basis
`claude/trainingsplaene-redesign-8eec45` (`5088654`, aktueller Produktionsstand).
Vom Nutzer am 26.09.2026 beauftragt („ja kannst du gerne ausführen, außerdem pack
mal die Möglichkeit rein OBJ und glTF Dateien upzuloaden“). Ergänzt
[Schritt 7](park-run-planner-step-7.md).

## Ziel

Parks entstehen schneller und maßstabsgetreu: Für Bayern und Sachsen holt die App
amtliches Luftbild und Höhenmodell für einen gewählten Ort automatisch als Untergrund.
Zusätzlich können eigene 3D-Modelle (OBJ, glTF/GLB) hochgeladen werden – als ganzer
Park oder als einzelnes Obstacle. Runs und Pins funktionieren weiter wie in Schritt 7.

Zielentität: Park-Untergrund (Höhenraster, Luftbild, 3D-Modell) und Obstacles vom Typ
„Bereich“ und „Eigenes Modell“. Nutzungskontext: Nachbauen am Desktop/Tablet, Ansehen
und Runs am Smartphone.

## Machbarkeitsprüfung (26.09.2026)

- Sachsen, Skatepark am Heizhaus Leipzig: DOM1 (Stand 09.01.2023) zeigt Bowl
  (ca. 2,9 m Höhenunterschied) und Flow-Wälle; DOP 20 cm per WMS zeigt den Park scharf.
- Bayern: DOM20 (20 cm) und DGM1 als direkte GeoTIFF-Kacheln mit HTTP-Range-Unterstützung;
  DOP 20 cm per WMS. Beide Dienste antworten lizenzfrei.

## Festlegungen (Vorschlag des Entwicklungsagenten, vom Nutzer zu bestätigen)

- **Amtliche Quellen:** Bayern (DOM20 + DGM1, DOP20; CC BY 4.0, „Datenquelle:
  Bayerische Vermessungsverwaltung – www.geodaten.bayern.de“) und Sachsen (DOM1 + DGM1,
  DOP20; dl-de/by-2-0, „Quelle: GeoSN, dl-de/by-2-0“). Weitere Länder später über dieselbe
  Schnittstelle. Quellenangabe wird in der 3D-Ansicht dauerhaft angezeigt.
- **Ablauf:** Adresse suchen (OpenStreetMap-Nominatim) → Luftbild-Vorschau mit
  Ausschnittgröße und Verschieben in 5-m-Schritten → „Übernehmen“. Der Server liest nur
  den Ausschnitt, entfernt Bäume/Gebäude (DOM − DGM > 3 m → Gelände) und speichert
  Höhenraster und Luftbild im eigenen Speicherordner. Übernahme erfolgt erst mit
  „Neue Version speichern“.
- **Obstacles auf dem Gelände:** Unterkante = niedrigster Geländepunkt unter der
  Grundfläche, plus optionaler Höhenversatz. Neuer Typ **Bereich** markiert
  Gelände-Elemente (z. B. Bowl), damit Tricks daran angepinnt werden können.
- **3D-Modelle:** OBJ (ohne Materialien, Darstellung im ruhigen App-Stil) sowie GLB
  und eigenständige glTF (eingebettete Daten). Prüfung vor dem Hochladen im Browser:
  lesbar, Dreiecksanzahl (Park ≤ 500 000, Obstacle ≤ 100 000), Größe (Park ≤ 25 MB,
  Obstacle ≤ 8 MB). Einheit (m/cm/mm/Zoll) und Hochachse (Y/Z) wählbar, da OBJ/CAD
  keine Einheit festlegt. Eigenes Modell als Obstacle wird auf seine Maße skaliert und
  ist direkt anpinnbar. Ein Park-Modell ersetzt das Höhenraster als Untergrund.
- Rechte wie Schritt 7: Ersteller, Trainer und Funktionäre ändern Parks; jede Änderung
  ist eine neue Version. Dateien anderer Bearbeiter dürfen nur unverändert übernommen werden.

## Ausdrücklich ausgeschlossen

Übrige Bundesländer, Laserpunktwolken (LAZ), Draco-komprimierte glTF, glTF mit externen
Dateien, OBJ-Materialien/Texturen, CAD-Formate (DWG, IFC, SKP, STEP), automatische
Obstacle-Erkennung, Offline-Nutzung.

## Qualitätsmerkmale und Abnahmekriterien

| Merkmal | Prüfung | Kriterium |
| --- | --- | --- |
| Funktionale Eignung | Domain-Tests (UTM, Kacheln, Raster, Baumfilter), Browser | Heizhaus Leipzig: Bowl im 3D-Untergrund erkennbar, Luftbild deckungsgleich. |
| Sicherheit | PGlite-Tests | Neue Asset-Pfade nur aus eigenem Ordner; ungültige Untergrund-/Modelldaten abgelehnt. |
| Kompatibilität | Tests Schritt 7 | Bestehende Parks und Runs unverändert nutzbar. |
| Leistung | Browser | Untergrund bis 200 × 200 m, höchstens 400 × 400 Rasterpunkte. |
| Rechtliche Konformität | Sichtprüfung | Quellenangabe sichtbar, sobald amtliche Daten genutzt werden. |

## Technischer Nachweis (26.09.2026, lokal)

**Status: implementiert und lokal geprüft. Nicht veröffentlicht.** Migration
`20260926120000_step_7b_park_ground.sql` auf keine Supabase-Datenbank angewandt.

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | 187/187 (neu: 6 Geodaten-Domain, 4 Datenbank 7b; alle 9 Park-Tests aus Schritt 7 laufen mit der neuen Migration) |
| Typprüfung, Lint, Produktionsbuild | fehlerfrei; neue Routen `/api/parks/geocode`, `/api/parks/official` |
| Echter Abruf Landesdienste | Leipzig/Heizhaus (SN, DOM1 + DGM1 + DOP20): 110 × 80 Punkte, 4–12 s; München (BY, DOM20 + DGM1 + DOP20): 400 × 300 Punkte bei 20 cm, 2–18 s |

Lokaler Browserprüfstand (echte Migrationen in PGlite, synthetische Konten, echte
Landesdienste): Adresssuche „Alte Salzstraße 63 Leipzig“ → Treffer Sachsen →
Luftbild-Vorschau, Ausschnitt verschoben und auf 110 × 80 m vergrößert → Übernahme;
3D-Gelände mit aufprojiziertem Luftbild, Quellenangabe sichtbar; Bereich „Bowl“
über der Bowl; eigenes OBJ (Zentimeter, Z oben) geprüft, als Obstacle hinzugefügt
und als Version 3 gespeichert; Run mit zwei Pins am Bereich und einem am Modell.

Gefundene und behobene Fehler: Material ohne Neuaufbau beim Eintreffen der Textur
(schwarzes Gelände), Bereich im Bowl-Boden versunken, Pins/Linie in großen Parks zu
klein, Baumreste am Rand lichter Kronen (Nachbarschaftsfilter ergänzt).

Grenzen: Kein Test gegen echtes Supabase Storage und keine Produktion; GLB/glTF nur
über den gemeinsamen Loader, nicht mit einer echten Scan-Datei geprüft; Park-Modell
als Untergrund nicht im Browser geprüft; keine Prüfung auf echten Mobilgeräten.
Nominatim hat eine strenge Nutzungsrichtlinie (geringe Last) – bei breiter Nutzung
ggf. eigenen Geocoder vorsehen.

## Praxisprüfliste für den Nutzer

- [ ] Einen bayerischen und einen sächsischen Park über „Amtliche Daten“ anlegen.
- [ ] Prüfen, ob Luftbild und Gelände zusammenpassen und Bowl/Banks erkennbar sind.
- [ ] Bereich über eine Bowl legen und Tricks daran pinnen.
- [ ] Ein echtes 3D-Modell (vom Parkbauer oder Handy-Scan) als GLB/OBJ hochladen –
      als ganzer Park und als einzelnes Obstacle; Einheit und Hochachse prüfen.
- [ ] Verständlichkeit von Suche, Verschieben und Quellenangabe bewerten.
