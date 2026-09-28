# Handoff: Auswertung (Athleten-Einzelauswertung) – Trainer Hub

## Overview
Redesign der Seite **Auswertung → Einzelauswertung**. Ziel: schneller bewerten, kaum Scrollen.
- **Desktop = Variante 1a** „Kompakt mit Seitenleiste“: alle 12 Kriterien als dichte Tabelle auf einem Bildschirm, rechts eine feste Zusammenfassung.
- **Mobil = Variante 1c** „Kompakt mit Tabs“: ein Tab pro Bereich statt einer langen Seite, Fortschritt + Speichern immer unten sichtbar.

Varianten 1b/1d in der Datei sind **nicht** Teil des Umfangs.

## About the Design Files
`Auswertung - Richtungen.dc.html` ist eine **HTML-Designreferenz** (Prototyp für Aussehen und Verhalten), kein Produktionscode. Aufgabe: das Design in der bestehenden Trainer-Hub-Codebasis mit deren Komponenten, Routing, Datenlayer und Styling-Ansatz nachbauen. Die bestehende Sidebar, der Header und die Bottom-Navigation der App bleiben unverändert – im Mock sind sie nur angedeutet.

## Fidelity
**High-fidelity** für Layout, Abstände, Farben, Typo und Interaktionen. Wo die Codebasis bereits Tokens/Komponenten hat (Buttons, Inputs, Segmented Control, Date-Range-Picker, Athleten-Select), diese verwenden und nur das Layout übernehmen.

## Was sich gegenüber der alten Auswertung ändert
1. Notizfelder sind **standardmäßig zu** – Zeile zeigt „+ Notiz“ oder die gekürzte Notiz („✎ …“); Klick klappt eine Textarea mit Diktier-Button und „Fertig“ auf.
2. **Letzter Wert** (vorherige Auswertung) wird direkt auf der 1–5-Skala **gestrichelt** markiert; daneben eine **Δ-Pille** (↑ n grün / ↓ n orange / = grau / „offen“).
3. Doppelter Donut entfällt → ersetzt durch **Kennzahlen-Streifen** (Anwesenheit, Contests, Trickziele, Score, Status).
4. **Speichern** oben in der Seitenkopfzeile (Desktop) bzw. in einer festen unteren Leiste (Mobil) – keine Leiste mehr am Seitenende.
5. Trickziele: anklickbare Chips (offen ↔ erreicht) mit Filter Alle/Offen/Erreicht.

---

## Screen 1a – Desktop (≥ 1200 px)

### Layout
Hauptbereich (rechts der App-Sidebar): `padding 26px 32px 32px`, vertikaler Stack `gap 16px`.
1. **Seitenkopf** – flex, `space-between`, `align-items:flex-end`, wrap.
   - Links: Kicker „ATHLETEN“ (11px/600, letter-spacing .08em, uppercase, #68778a) + H1 „AUSWERTUNG“ (Barlow Condensed 40px/700, uppercase, #07182d, line-height 1).
   - Rechts (gap 10px): Segmented „Einzelauswertung | Fahrervergleich“ (Track #dfe5eb, r10, p3; aktives Segment weiß, r8, shadow 0 1px 3px rgba(7,24,45,.12), 13px/700) · Zeitraum-Picker (h40, weiß, 1px #dfe5eb, r10, 13px/600) · „CSV“ (Sekundär-Button, gleiche Optik) · **„Auswertung speichern“** (Primär, h40, #148cf2, weiß, r10, 14px/600).
2. **Athleten-Streifen** – #0a1a2f, r14, `padding 14px 18px`, flex gap 20, shadow 0 12px 28px rgba(10,26,47,.2).
   - Avatar 44px (#1d3350, Initialen weiß 15px/700) · Name 17px/700 weiß + „▾“ (öffnet Athletenwahl) · Meta 13px #c4d0dd („Kader B-NK2 · Street · Gespräch am 18.09.2026“).
   - Kennzahlen (gap 28): Wert Barlow Condensed 26px/700 weiß, Label 12px #c4d0dd: Anwesenheit · Contests (mit „›“, klickbar → Contest-Liste/Popover) · Trickziele „x/13“ · Score.
   - Status-Dropdown „Status: Kader halten ▾“ (h36, #1d3350, r8, 13px/600 weiß).
3. **Zweispaltig**: `grid-template-columns: minmax(0,1fr) 380px; gap 20px; align-items:start`.

### Linke Spalte
**Karte „Bewertung · x/12“** (weiß, 1px #dfe5eb, r14, overflow hidden)
- Kopf `padding 14px 18px`: Titel 16px/700 + Zähler #68778a; rechts Legende (18px Quadrat, 1.5px dashed #148cf2, r5) „letzte Auswertung 12.06.2026“ 12px.
- Spaltenkopf: 11px/700 uppercase #68778a, gleiche Grid-Spalten wie Zeilen.
- **Zeilen-Grid**: `minmax(0,1fr) 206px 58px 230px`, gap 14, min-height 50, padding 0 18, Trenner 1px #eef1f4.
  - Kriterium 14px/600 #102238
  - Skala: 5 Buttons 36×34, r8, gap 6, 14px/700
    - normal: weiß, 1px #dfe5eb, #46576b
    - **letzter Wert**: #f5f9fe, **1.5px dashed #148cf2**, #0b5aa0
    - **ausgewählt**: #148cf2, weiß, 1.5px solid #148cf2
    - erneuter Klick auf den gewählten Wert = zurücksetzen
  - Δ-Pille 12px/700, padding 3px 7px, r6: ↑ n → bg #e3f4ec / #157a52 · ↓ n → #fdf1e1 / #9a5600 · „=“ → #eef1f4 / #46576b · „offen“ (unbewertet) → #eef1f4 / #68778a
  - Notiz-Trigger: Text-Button 13px, einzeilig mit Ellipsis; leer „+ Notiz“ (#0874d1), gefüllt „✎ {Notiz}“ (#46576b)
  - Aufgeklappt (unter der Zeile, padding 0 18 14): Textarea (2 Zeilen, r10, 1px #dfe5eb, Placeholder „Beobachtung oder Entwicklung festhalten …“) · Mikro-Button 40×40 (Diktieren, bestehende Funktion) · „Fertig“ (h40, #eef6fe, #0b5aa0, 13px/700). Es ist immer nur **eine** Notiz gleichzeitig offen.
- **Bereichskopf** zwischen den Gruppen: #f5f7f9, padding 9px 18px, „01  Skateboardspezifische Anforderungen“ (Nummer #9aa6b4, Titel 13px/700) · rechts „Ø 3,0 · zuvor 2,5“ 12px/600.

**Karte „Trickziele aus Aufgaben · x/13 erreicht“** (padding 16 18, gap 12)
- Filter-Segmented Alle/Offen/Erreicht (Track #eef1f4, r8, Segmente h28 12px/700; aktiv weiß).
- Chips flex-wrap gap 8: h36, r18, 13px/600, `white-space:nowrap`; offen „○ Name“ weiß/1px #dfe5eb/#102238; erreicht „✓ Name“ #e3f4ec/1px #bfe3d1/#157a52. Klick toggelt.
- Hinweis 12px #68778a.

### Rechte Spalte (380px)
1. **„Entwicklung seit 12.06.“** – je Bereich: Label „Skate 6/6“ + rechts „3,0 ↑ 0,5“ (Farbe wie Δ). Balken h10 r5 #eef1f4, Füllung #148cf2 = aktueller Ø/5; senkrechter Strich 2px #07182d = vorheriger Ø. Legende „Balken = jetzt · Strich = letzte Auswertung“.
2. **Persönliche Bemerkung** + **Maßnahmen** – je Textarea 3 Zeilen.
3. **Persönliche Ziele** – Liste (Kreis-Checkbox, Titel, Frequenz rechts) + Eingabe „Neues persönliches Ziel“ + „+ Hinzufügen“.

Optional: rechte Spalte `position: sticky; top: 24px`, damit sie beim Scrollen der Tabelle sichtbar bleibt.

---

## Screen 1c – Mobil (< 768 px)

Vollhöhen-Layout mit **drei Zonen**: fester Kopf · scrollender Inhalt · feste Fußleiste (über der App-Bottom-Nav).

**Kopf** (padding 14 16 0, gap 12):
- H1 „AUSWERTUNG“ Barlow Condensed 30px + Zeitraum-Chip rechts (12px/600, weiß, r8).
- Athleten-Karte #0a1a2f r14 p12: Avatar 36, Name 15px/700 mit Ellipsis + „▾“, Meta 12px „B-NK2 · Street · Kader halten“; darunter 4-Spalten-Kennzahlen (Barlow 20px weiß, Label 11px #c4d0dd): Anwesend · Contests · Ziele · Score.
- **Tab-Leiste** horizontal scrollbar, gap 6, Pills h40 r20 13px/700 mit Zähler (11px, opacity .8): `Skate 6/6 · Mental 3/3 · Athletik 3/3 · Ziele x/13 · Abschluss`. Aktiv #07182d/weiß, sonst weiß/1px #dfe5eb.

**Inhalt** (scrollt, padding 12 16 16, gap 10):
- Tabs Skate/Mental/Athletik: pro Kriterium eine Karte (weiß, r12, p12, gap 10): Titel 15px/600 + Δ-Pille rechts · Skala als 5-Spalten-Grid, Buttons **h44** r10 16px/700 (gleiche Zustände wie Desktop) · Notiz-Trigger (min-h 24) → aufgeklappt Textarea 3 Zeilen + Mikro 44×44.
- Tab Ziele: Trickziel-Chips (h40) + Persönliche Ziele mit Eingabe (h44).
- Tab Abschluss: Persönliche Bemerkung + Maßnahmen (Textareas 4 Zeilen).

**Fußleiste** (weiß, 1px Top-Border, padding 10 16): „x/12 bewertet“ 13px/700 + Fortschrittsbalken h6 (#eef1f4, Füllung #1f9d6b) · Button „Speichern“ h44 #148cf2.

Tab-Wechsel schließt eine offene Notiz. Alle Touch-Targets ≥ 44px.

---

## Interactions & Behavior
- Bewertung: Klick setzt Wert, erneuter Klick auf denselben Wert entfernt ihn. Δ und Bereichs-Ø aktualisieren sofort.
- Bereichs-Ø = Mittel der **bewerteten** Kriterien; Δ im Bereich vergleicht mit dem Ø der vorherigen Werte **derselben** bewerteten Kriterien. Anzeige mit Dezimalkomma (3,0), „–“ wenn nichts bewertet.
- Notiz: nur eine gleichzeitig offen; Diktieren nutzt die bestehende Spracheingabe.
- Speichern: bestehende Save-Logik; bei ungespeicherten Änderungen Hinweis beim Verlassen/Athletenwechsel. Optional Autosave-Entwurf.
- Athlet/Zeitraum wechseln lädt Daten neu (Loading-Skeleton für Tabelle).
- Tastatur (Desktop): Skalen-Buttons fokussierbar, sichtbarer Fokusring 2px #148cf2.
- Breakpoints: ≥ 1200 → 1a zweispaltig; 768–1199 → 1a, rechte Spalte unter die Tabelle; < 768 → 1c.

## State / Daten
- `ratings: Record<criterionId, 1..5 | null>`
- `previousRatings: Record<criterionId, 1..5>` + Datum der letzten Auswertung (neu erforderlich, falls das Backend es noch nicht liefert)
- `notes: Record<criterionId, string>`, `openNoteId: string | null`
- `trickGoals: {id, title, done}[]`, `trickFilter: 'all'|'open'|'done'`
- `personalGoals`, `remark`, `measures`, `status`
- mobil: `activeTab: 'skate'|'mental'|'ath'|'ziele'|'abs'`
- Kennzahlen: Anwesenheit %, Anzahl Contests (+ Liste), Score

Kriterien (Mock): **Skate** – Trick-Repertoire Street, Obstacles, Variationen Flip in/out & Shuv in/out, Variationen Rotationen in/out, Stance-Optionen Switch/Fakie, Flow (Runs/Lines) · **Mental** – Risikobereitschaft & Mut, Emotional gefestigt & belastbar, Fokus/Commitment/Konstanz · **Athletik** – Fitnesszustand, Koordination & Gleichgewicht, Athletiktraining/Gym. Echte Kriterien kommen aus dem Backend.

## Design Tokens
- Farben: Navy #07182d · Sidebar/Dark #0a1a2f · Dark-2 #1d3350 · Text #102238 · Text-2 #46576b · Muted #68778a · Muted-2 #9aa6b4 · On-dark #c4d0dd · Border #dfe5eb · Divider #eef1f4 · Page #f5f7f9 · Primary #148cf2 · Primary-tint #eef6fe / #f5f9fe · Primary-text #0b5aa0 · Link #0874d1 · Success #1f9d6b / bg #e3f4ec / text #157a52 / border #bfe3d1 · Warn bg #fdf1e1 / text #9a5600
- Typo: Figtree 400/500/600/700 (UI), Barlow Condensed 600/700 uppercase (Headlines, Kennzahlen)
- Radien: 5 · 6 · 8 · 10 · 12 · 14 · Pills 18/20
- Schatten: Karte-dark 0 12px 28px rgba(10,26,47,.2) · Segment 0 1px 3px rgba(7,24,45,.12)
- Abstände: 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 28 · 32

## Assets
Keine Bilder. Icons: Mikrofon (bestehendes Icon-Set verwenden), Zeichen ✎ ○ ✓ ↑ ↓ › ▾ gern durch Icons aus der Codebasis ersetzen.

## Files
- `Auswertung - Richtungen.dc.html` – Abschnitte **#1a** (Desktop) und **#1c** (Mobil). Im Browser öffnen; interaktiv (Bewerten, Notizen, Tabs, Trick-Chips).
