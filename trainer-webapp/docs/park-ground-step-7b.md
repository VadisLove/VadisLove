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
  lesbar, Dreiecksanzahl (Park ≤ 1 500 000, Obstacle ≤ 300 000), Größe (je ≤ 50 MB;
  am 26.09.2026 vom Nutzer angehoben, 50 MB = Maximum des Supabase-Free-Plans). Einheit (m/cm/mm/Zoll) und Hochachse (Y/Z) wählbar, da OBJ/CAD
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

**Status: technisch produktiv veröffentlicht am 26.09.2026** (Festlegungen und
Veröffentlichung vom Nutzer bestätigt; Obergrenzen bleiben vorerst wie festgelegt und
werden bei ausreichendem Budget angehoben). Praxisabnahme offen.

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

## Produktionsrelease (26.09.2026)

- Vorheriger Stand: `dpl_2mzTnc6voEx9EbVf75ob47hcoT8S` (Trainingspläne-Redesign mit
  Video-Uploads, Code `5088654`; per Dateivergleich des Deployments bestätigt).
  Sicherungstag `production/stable-before-step-7b-park-ground-20260926`, vorab gepusht.
- Migration als Version `20260926002019` auf `lglmlktrngmrimvhwxab` angewandt, lokaler
  Dateiname angeglichen. Transaktionaler Funktionstest (Park mit Höhenraster,
  Georeferenz, Bereich und eigenem Modell gespeichert; fremder Rasterpfad abgelehnt)
  bestanden und zurückgerollt; danach unverändert 2 Parks, 3 Versionen.
  Security-Advisor: keine neuen Findings.
- Befund am Rande: Die Migration `20260926090000_training_video_uploads.sql` ist
  wirksam (Bucket und Policies vorhanden), aber nicht in der Supabase-Migrationshistorie
  registriert. Nicht Teil von 7b; beim nächsten Paket der Videos nachziehen.
- Vercel: `dpl_FQYH2tDwPRM3LuykzZKmx84SLnzU`, `READY`; `https://trainer-webapp-ruby.vercel.app`
  zeigt laut `vercel inspect` darauf. HTTP: `/login` 200; `/skateparks`, `/api/parks`,
  `/api/parks/geocode`, `/api/parks/official` ohne Anmeldung 307 zum Login.
  `vercel logs` (error, 15 min): keine Einträge.
- Nicht geprüft: angemeldeter Produktionsablauf inkl. Abruf der Landesdienste aus der
  Vercel-Funktion und Upload in den echten Speicher – erster Punkt der Praxisprüfung.

Rollback: `vercel promote dpl_2mzTnc6voEx9EbVf75ob47hcoT8S`. Die additive
Datenbankerweiterung bleibt bestehen; bestehende Parks sind davon unberührt.

## Korrektur nach erster Praxisrückmeldung (26.09.2026)

Befund des Nutzers (Park „Southbank“): Gelände mit Spitzen und pixelig, kein Run planbar.
Ursachen: einzelne Ausreißer im Oberflächenmodell (Laternen/Masten), 1-m-Raster ohne
Glättung, Park ohne Obstacles/Bereiche (Pins brauchen ein Obstacle), Grundfläche wich
vom Gelände ab (110 × 80 statt 80 × 90 m).
Behoben: Ausreißerfilter (Server und beim Laden bestehender Parks), Catmull-Rom-
Verfeinerung grober Raster für die Darstellung, Grundfläche folgt dem Gelände, Hinweis
mit „Bereiche anlegen“ sowie Hinweis beim Tippen neben ein Obstacle im Run-Modus.
Prüfung: 189/189 Tests, Typprüfung, Lint, Build; Browser-Prüfstand mit echten
Heizhaus-Daten (Spitzen entfernt, Bereich angelegt, „Run planen“ aktiv).
Veröffentlicht: `dpl_3ftYawEzhhpxwZoJw3TzUZVKMBNS`, Alias geprüft, `/login` 200,
keine Fehlerlogs. Sicherungstag `production/stable-before-park-terrain-fix-20260926`;
Rollback: `vercel promote dpl_FQYH2tDwPRM3LuykzZKmx84SLnzU`.

## Praxisprüfliste für den Nutzer

- [ ] Einen bayerischen und einen sächsischen Park über „Amtliche Daten“ anlegen.
- [ ] Prüfen, ob Luftbild und Gelände zusammenpassen und Bowl/Banks erkennbar sind.
- [ ] Bereich über eine Bowl legen und Tricks daran pinnen.
- [ ] Ein echtes 3D-Modell (vom Parkbauer oder Handy-Scan) als GLB/OBJ hochladen –
      als ganzer Park und als einzelnes Obstacle; Einheit und Hochachse prüfen.
- [ ] Verständlichkeit von Suche, Verschieben und Quellenangabe bewerten.

## Anhebung der Dateigrenzen (26.09.2026)

Auf Wunsch des Nutzers: 3D-Modelle (Park und Obstacle) je bis 50 MB, Park-Modelle bis
1 500 000 und Obstacles bis 300 000 Dreiecke. 80 MB waren gewünscht, sind im
Supabase-Free-Plan (globale Grenze 50 MB pro Datei) aber nicht möglich. Nach einem
Wechsel auf Pro: `MODEL_LIMITS` in `src/features/parks/model-assets.ts` und das Limit
des Buckets `skatepark-models` (neue Migration, z. B. 83886080) anheben.
Bucket-Grenze per Migration `20260926005815` in Produktion gesetzt und geprüft.
