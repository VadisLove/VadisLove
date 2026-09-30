# Handoff: Trainingspläne, Freigaben & Session-Rückblick (Trainer Hub)

## Overview
Redesign des Bereichs **Trainingspläne** der Web-App „Trainer Hub“ (SKSB, Skateboard-Training) für Trainer, Vorstand/Verband und Skater – mobil (Skatepark) und Desktop. Ziel: klare Führung („was als Nächstes?“), ein einziger Plan-Erstellen-Flow, übersichtliche Freigaben mit Video, rollenbasierte Rechte, gendergerechte Anrede und ein nützlicher Session-Rückblick.

## About the Design Files
Die Dateien in diesem Paket sind **Design-Referenzen in HTML** – klickbare Prototypen, die Aussehen und Verhalten zeigen, **kein Produktionscode**. Aufgabe ist, diese Designs in der bestehenden Codebasis der App (Framework, Komponenten, Routing, API) mit deren Mustern nachzubauen. Gibt es noch keine Umgebung, das passendste Framework wählen.

`Trainingsplaene_v3.dc.html` im Browser öffnen (mit `support.js` im selben Ordner). Links oben die Ansicht wechseln (Trainer / Vorstand / Skater); „Direkt ansehen“ springt zu allen Flows. Handy (390 px) und Desktop (1440 px) teilen denselben Zustand.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände, Texte und Interaktionen sind final gemeint. Bestehende Komponenten der Codebasis (Sidebar, Buttons, Inputs, Icons) wiederverwenden, Werte unten übernehmen. Icons im Prototyp sind Platzhalter (Sidebar-Quadrate, Unicode ▶ ↑ ✓) → durch das Icon-Set der App ersetzen.

---

## Rollen & Rechte (Kernlogik)
| Rolle | Pläne erstellen | Zuweisen an | Freigaben bestätigen | Sieht Fortschritt |
|---|---|---|---|---|
| Trainer | immer | eigene Gruppen + einzelne Athleten | ja | ganze Gruppe (Matrix) |
| Vorstand / Verband | immer | alle Gruppen inkl. „Alle Gruppen im Verein“; optional **Vereinsvorlage** für alle Trainer | ja | ganze Gruppe |
| Skater | **nur wenn Recht übertragen** (`canCreatePlans`) | „Nur für mich“ oder „Mit meinem Trainer teilen“ | nein | **nur eigenen** |

- Recht wird pro Athlet von Trainer/Vorstand gesetzt: Profil → *Berechtigungen* (mobil) bzw. Button „Wer darf erstellen?“ (Desktop, rechte Seitenleiste). Toggle je Athlet.
- Von Athleten erstellte Pläne tragen Badge „Athlet“ / Text „Von <Name> erstellt“ und bleiben für Trainer bearbeitbar.
- Skater ohne Recht: kein „+ Neuer Plan“, stattdessen Hinweis „Neue Pläne erstellt dein Trainer oder der Verein.“ Mittlerer Tab-Bar-Button wird **„↑ Melden“** (öffnet Melden-Sheet für den nächsten geübten Trick). Desktop-Header: „↑ Trick melden“ statt „+ Plan erstellen“.

## Anrede (m/w/d) & Endungen
- Einmalige Abfrage als Bottom-Sheet beim ersten Öffnen („Wie sollen wir dich ansprechen?“), Optionen: *Skaterin (weiblich) / Skater (männlich) / Skater*in (divers / keine Angabe)*; für Trainer analog. „Später“ möglich → neutral (d). Änderbar im Profil (Segmented Control „Anrede“).
- Wort-Tabelle (Genderstern für d):

| Key | m | w | d |
|---|---|---|---|
| sk | Skater | Skaterin | Skater*in |
| tr | Trainer | Trainerin | Trainer*in |
| acc | deinen Trainer | deine Trainerin | dein*e Trainer*in |
| nom | dein Trainer | deine Trainerin | dein*e Trainer*in |
| dat | deinem Trainer | deiner Trainerin | deine*m Trainer*in |
| rank | Street-Starter | Street-Starterin | Street-Starter*in |

- Eigene Anrede steuert Rollen-Chip, Profil, Level-Titel. **Anrede des Trainers** steuert Texte beim Skater („Wartet auf deine Trainerin“). Gruppen immer neutral („4 Athleten“), nie aus dem Geschlecht einer Einzelperson ableiten.

---

## Screens / Views

### Mobil (390 × 844, Tab-Bar)
App-Bar 52 px weiß: Menü · „Trainer Hub“ · Rollen-Chip (`#eef1f4`, 12/600) · Glocke mit rotem Badge (`#e5484d`, Anzahl offener Meldungen).
Tab-Bar 74 px: Start · Kalender · **zentraler Button 50 px rund `#148cf2`** (+ bzw. ↑) · **Pläne** · Profil. (Neu: Pläne sind in der Tab-Bar.)

1. **Pläne (Start)** – Padding 18/16, Gap 14.
   - H: Kicker „TRAINING“ 11/600 uppercase `#68778a` + Titel „TRAININGSPLÄNE“ Barlow Condensed 32/700 uppercase `#07182d`.
   - Skater: dunkle Karte „Dein nächster Schritt“ (`#0a1a2f`, Radius 16, Shadow `0 12px 28px rgba(10,26,47,.25)`), Titel Condensed 30, CTA-Pill 44 px `#148cf2`. Logik: erster Trick mit Status < Gemeldet → „<Trick> melden“ (wenn geübt) oder „<Trick> üben“.
   - Fortschritts-Eintrag: Trainer → „N Meldungen warten“ (amber `#fdf1e1`/Border `#f5d3a3`), Skater → „Mein Fortschritt · x/6“.
   - Karte „Session-Rückblick“.
   - Plan-Karten: Name 16/600, Gruppe 13 `#68778a`, Trick-Punkte 18 px (Statusfarben), rechts Prozent Condensed 34 (`white-space:nowrap`). Badges 11/700: „N offen“, „Entwurf“, „Vorlage“ (`#efe9fb`/`#5b3fa3`), „Athlet“ (`#e8f3fe`/`#0b5aa0`).
   - „+ Neuer Plan“ (gestrichelt, 52 px) nur mit Recht.
2. **Plan-Detail (Trick-Pfad)** – Zurück-Link, „Bearbeiten“ (nur Trainer/Vorstand), Titel Condensed 30, Level-Box dunkel mit Fortschrittsbalken (grün `#1f9d6b`). Vertikaler Pfad: Knoten 40 px (aktueller 52 px mit Ring `0 0 0 6px rgba(20,140,242,.18)`), Verbindungslinie 3 px. Aktueller Knoten klappt Karte auf: Skater → 3 Schritte (Geübt / Gemeldet mit Video / Bestätigt) + CTA („Als geübt markieren“ bzw. „<Trick> melden“); Trainer → Liste wartender Athleten (Tap öffnet Freigabe-Sheet).
3. **Fortschritt**
   - Trainer/Vorstand: **Matrix** Athleten × Tricks (Zellen quadratisch, Radius 8, Statusfarbe; ✓ bestätigt, ! gemeldet, ▶ gemeldet mit Video; gemeldete Zellen mit Ring `rgba(240,163,58,.3)`). Tap auf ! / ▶ → Bottom-Sheet mit Video (170 px dunkel), Notiz, „Nochmal üben“ / „✓ Bestätigen“ (grün).
   - Skater: **nur eigene Daten**. 3 Kacheln (Bestätigt / Wartet / Offen), Trickliste mit 3-Segment-Balken, „Meine Meldungen“ (Thumbnail ▶ oder „Notiz“, Status-Pill). Hinweis „Nur du und dein Trainer sehen das.“
4. **Trick melden (Skater, Bottom-Sheet)** – Titel „<Trick> melden“, Buttons „Video aufnehmen“ / „Aus Galerie“ (je 96 px), Hinweis „MP4 oder MOV · max. 60 Sek. · optional“. Upload-Zustand mit Dateiname + Fortschrittsbalken + %, danach Vorschau „✓ Video hochgeladen“ + Entfernen. Notiz optional. Senden aktiv, wenn Video fertig **oder** Notiz vorhanden. Ergebnis: Status → Gemeldet, erscheint sofort beim Trainer (Matrix ▶, Glocke, Warteschlange).
5. **Session-Rückblick** – Athleten-Chips (Trainer), Zeitraum 7 Tage / 30 Tage / Saison, 4 Kennzahlen (2×2), Karte „Aus den Trainingsdaten“ (bereit zum Melden/Bestätigen), Skills horizontal scrollbar (Mini-Balkendiagramm je Session, Quote, Status im Plan), Sessions aufklappbar (Übungen mit Balken, Hinweise, Notiz-Eingabe; Trainer wählt Sichtbarkeit).
6. **Profil** – Avatar, Name, Rolle; „Berechtigungen“ (nur Staff); „Anrede“; „Ton bei neuen Meldungen“ (Toggle – vorher im Header).
7. **Berechtigungen** – „Wer darf Pläne erstellen?“: Trainer*innen & Vorstand „Immer“ (grüne Pill), Athleten mit Toggle (52×32, an `#1f9d6b`).

### Plan erstellen / bearbeiten (ein Flow für alle)
Einstieg: Tab-Bar „+“, „+ Neuer Plan“, Desktop „+ Plan erstellen“, **„Bearbeiten“** (öffnet direkt Schritt 4 mit vorbefüllten Daten und speichert als „Version 2“ – Hinweis: „Speichern erzeugt Version 2. Laufende Trainings behalten ihren Planstand.“).
Mobil: Vollbild; Desktop: Modal 720 px, max 800 px hoch, Radius 16.
Kopf: ✕, Titel („Neuer Plan“ / „Neuer Plan · Verein“ / „Plan bearbeiten“), „n / 4“, Stepper 4 Segmente (4 px Balken, klickbar sobald Name gesetzt).
1. **Grundlagen** – „Womit starten?“: Leer / Street Basics / Ramp Einstieg (Vereinsvorlage) / Flip-Tricks (Vorlage füllt Kategorie, Niveau, Tricks). Name* (Pflicht, einziges Pflichtfeld), Kategorie-Chips (Street, Park, Bowl, Ramp, Freestyle), Niveau Segmented (Einsteiger / Fortgeschritten / Profi), Ziel (optional).
2. **Tricks** – Liste nummeriert; Tap klappt auf: Ziel, Hinweis, „↑ Nach oben“, „Entfernen“. Hinzufügen per Suche + Vorschlags-Chips aus Bibliothek; unbekannter Suchbegriff → „+ „X“ als eigenen Trick“.
3. **Zuweisen** (einziger rollenabhängiger Schritt) – Trainer: Gruppen (Checkbox-Zeilen 52 px) + einzelne Athleten (Chips). Vorstand: zusätzlich „Alle Gruppen im Verein“ + Toggle „Als Vereinsvorlage freigeben“ (lila `#7c5cd6`). Skater: Radio „Nur für mich“ / „Mit deinem Trainer teilen“. Frist-Chips: 2 / 4 / 8 Wochen / Ohne Frist.
4. **Prüfen** – Zusammenfassungs-Karten mit „Ändern“ (springt zum Schritt). Footer: „Entwurf“ + Primär („Plan erstellen“ / „Erstellen & freigeben“ / „Plan starten“ / „Version 2 speichern“). Ohne Zuweisung → als Entwurf.
Footer Schritt 1–3: „Zurück“ + „Weiter: <nächster Schritt>“ (deaktiviert `#e6ebf0`/`#9aa6b4` ohne Name).

### Desktop (1440 × 900)
- Sidebar 232 px `#0a1a2f`: Logo + „TRAINER HUB“ (Condensed 20), Nav-Items 40 px (aktiv `#148cf2`, sonst `#c4d0dd`), unten „+ Event erstellen“ und User-Block (Name, Rolle).
- Header: Kicker + „TRAININGSPLÄNE“ Condensed 40; rechts „Wer darf erstellen?“ (Staff), „+ Plan erstellen“ (mit Recht) bzw. „↑ Trick melden“.
- **Tabs** (ersetzen die beiden Header-Links): „Pläne“ · „Freigaben & Fortschritte“ (amber Zähler) / Skater: „Mein Fortschritt“ · „Session-Rückblick“. Aktiv: 3 px Unterstrich `#148cf2`.
- **Pläne-Tab**: Grid `330px | 1fr`, Gap 24. Links: nächster Schritt (Skater), Fortschritts-Eintrag, Plan-Karten (ausgewählt `#eef6fe` + Border `#148cf2`). Rechts Detailkarte (Padding 24, Radius 14): Status-Pills, Titel Condensed 34, Buttons Bearbeiten / Freigaben öffnen; Level-Leiste; **horizontaler Trick-Pfad** (6 Spalten, Linie hinter den Knoten); darunter 2 Spalten: „Jetzt dran / Wartet“ + Plan-Infos (Kategorie, Frist, Zugewiesen, Ziel, Version).
- **Freigaben-Tab (Staff)**: Grid `1fr | 380px`. Matrix mit 44 px Zellen + Spalte „Bestätigt“; rechts Warteschlange „Wartet auf dich · N“ mit Video-Thumbnail (64×48), Notiz, Inline „Nochmal üben“ / „✓ Bestätigen“. Klick auf ▶ öffnet rechte Seitenleiste 420 px mit Video 230 px.
- **Mein Fortschritt (Skater)**: 2 Spalten – Kacheln + Trickliste | Meine Meldungen.
- **Session-Rückblick**: Athleten-Chips + Zeitraum; 4 Kennzahlen; Grid `1fr | 380px`: links Session-Zeilen (Grid `96px | 1fr | auto | auto | 20px`: Datum/Uhrzeit, Titel + Park · Dauer · aktive Zeit, „x / y gelandet“, Quote-Pill, Chevron), aufgeklappt 2 Spalten (Übungen mit Balken | Hinweise & Ziele + Eingabe + Sichtbarkeit). Rechts: „Aus den Trainingsdaten“ (dunkel) + „Skills im Zeitraum“ (Sparkline, Quote, Trend ▲/▼, Plan-Status).

## Interactions & Behavior
- Status pro Athlet × Trick: `0 Offen → 1 Geübt → 2 Gemeldet → 3 Bestätigt`. Skater: 0→1 „Als geübt markieren“, 1→2 „Melden“ (optional Video). Trainer: 2→3 „Bestätigen“ oder 2→1 „Nochmal üben“. Trainer darf aus dem Session-Rückblick direkt 0/1→3 bestätigen, wenn Quote ≥ 80 %.
- Aktueller Trick im Pfad: Skater = erster Trick mit Status < 2; Trainer = erster Trick mit mindestens einer offenen Meldung.
- Session-Rückblick: Skills werden pro Trick über den Zeitraum zusammengefasst (Summe Landungen/Versuche, Quote gerundet). „Bereit“ = Quote ≥ 80 % und Plan-Status < 2 (Skater) bzw. < 3 (Trainer). „Schwachstelle“ = Quote < 50 %. Trend = letzte minus erste Session-Quote.
- Quote-Farben: ≥ 80 % grün (`#e3f4ec`/`#157a52`, Balken `#1f9d6b`), 50–79 % blau (`#e8f3fe`/`#0b5aa0`, `#148cf2`), < 50 % amber (`#fdf1e1`/`#9a5600`, `#f0a33a`).
- Notizen im Rückblick: Sichtbarkeit `ath` („Für <Vorname> sichtbar“, Hintergrund `#f5f7f9`) oder `tr` („Nur Trainer“, `#f6f2fe`). Skater sehen nur `ath` und schreiben nur eigene.
- Toasts (2,4 s, dunkel `#0a1a2f`, 14/600) nach Aktionen: „<Trick> für <Name> bestätigt“, „Gemeldet – dein Trainer wurde benachrichtigt“, „Version 2 von „…“ gespeichert“ usw. Beim Rollenwechsel ausblenden.
- Deutsche Zahlenformate (Komma: „Ø 1,8“), Uhrzeiten ohne Sekunden, Datum „Do. 24.09.“.
- Mobile Trefferflächen ≥ 44 px.

## State Management (Vorschlag)
- `currentUser { id, role: 'trainer'|'board'|'athlete', salutation: 'm'|'w'|'d'|null, canCreatePlans: boolean }`
- `plans[] { id, name, category, level, goal, tricks[{ name, goal, hint, order }], assignment { groups[], athletes[], shareWithTrainer?, isClubTemplate? }, deadline, version, status: 'draft'|'active'|'done', createdBy }`
- `progress[athleteId][planId][trickId] = 0..3`
- `reports[] { athleteId, planId, trickId, createdAt, note?, video? { url, duration } }` – Upload mit Fortschritt; Benachrichtigung an Trainer
- `sessions[] { id, athleteId, planId?, title, park, start, end, activeSeconds, items[{ trick, landed, attempts }] }`
- `sessionNotes[] { sessionId, text, visibility: 'athlete'|'trainer', authorId }`
- `permissions { athleteId: { canCreatePlans } }` (setzbar von Trainer/Vorstand)
- `notificationSoundEnabled` (Profil)

## Design Tokens
**Farben**
- Ink `#07182d`, Text `#102238`, Sekundär `#46576b`, Muted `#68778a`, Disabled `#9aa6b4`
- Border `#dfe5eb`, Divider `#eef1f4`, Fläche `#f5f7f9`, Canvas `#e6ebf0`, Weiß `#ffffff`
- Navy (Sidebar, dunkle Karten) `#0a1a2f`, Text auf Navy `#c4d0dd`, Akzent auf Navy `#7fb8f2`
- Primär `#148cf2`, Link `#0874d1`, Primär-soft `#eef6fe` / `#e8f3fe`, Primär-Text-soft `#0b5aa0`
- Status: Offen `#e3e8ee`, Geübt `#7fb8f2`, Gemeldet `#f0a33a` (soft `#fdf1e1`, Text `#9a5600`), Bestätigt `#1f9d6b` (soft `#e3f4ec`, Text `#157a52`)
- Fehler/Badge `#e5484d`, Entfernen `#c2383d` (Border `#f3c7c8`), Vorlage lila `#7c5cd6` (soft `#efe9fb`, Text `#5b3fa3`)

**Typografie**
- Text: **Figtree** 400/500/600/700
- Display/Headlines: **Barlow Condensed** 600/700, uppercase (Seitentitel 32 mobil / 40 Desktop, Plan-Titel 30/34, Kennzahlen 28–36)
- Größen: 10 (Tab-Bar-Label), 11 (Kicker, Badges; letter-spacing .08–.1em), 12, 13, 14, 15, 16, 17, 19/20 (Sheet-Titel)

**Radius**: 5–7 (Badges/Pills), 8–10 (Inputs, Buttons, Matrix-Zellen), 12 (Karten), 14 (große Karten), 16 (Modals, dunkle Karten), 18–20 (Chips), 22 (Bottom-Sheet oben)
**Shadows**: Karte `0 8px 25px rgba(16,34,56,.05)`, dunkle Karte `0 12px 28px rgba(10,26,47,.25)`, Sheet `0 -10px 30px rgba(7,24,45,.2)`, Modal `0 30px 60px rgba(7,24,45,.3)`, FAB `0 6px 14px rgba(20,140,242,.4)`
**Abstände**: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 24 / 36 (Seitenrand Desktop 36, mobil 16)
**Höhen**: Buttons 38–52, Chips 36–40, Inputs 44–48, Toggle 52×32

## Assets
Keine Bilder. Logo „SKSB“ und alle Icons sind Platzhalter → vorhandenes Logo und Icon-Set der App verwenden. Video-Thumbnails sind Platzhalter (dunkle Fläche mit ▶ + Dauer).

## Files
- `Trainingsplaene_v3.dc.html` – vollständiger Prototyp (Mobil + Desktop, alle Rollen und Flows). Markup im `<x-dc>`-Block, Logik und Beispieldaten in der Klasse `Component` (Konstanten `TR`, `SK`, `W`, `TPL`, `SES`, `ST`).
- `support.js` – Laufzeit nur für die Vorschau; nicht übernehmen.
- `screenshots/` – Referenzbilder der wichtigsten Zustände:
  - Mobil (2×, 390 px breit): `01` Trainer Pläne · `02` Plan-Pfad Trainer · `03` Matrix · `04` Freigabe mit Video · `05` Berechtigungen · `06–09` Plan erstellen (Grundlagen, Tricks, Zuweisen, Prüfen) · `10` Anrede-Abfrage · `11` Skater Pläne · `12` Skater Trick-Pfad · `13–14` Trick melden (Auswahl, Video fertig) · `15` Mein Fortschritt · `16` Session-Rückblick
  - Desktop (1440 × 900): `20` Trainer Pläne · `21` Freigaben & Fortschritte · `22` Session-Rückblick · `23` Berechtigungen · `24` Plan erstellen (Modal) · `26` Skater Pläne · `27` Skater Mein Fortschritt
