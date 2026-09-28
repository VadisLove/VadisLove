Setze das Redesign der Seite **Auswertung → Einzelauswertung** im Trainer Hub um.

Referenz: `design_handoff_auswertung/README.md` (Spezifikation) und `design_handoff_auswertung/Auswertung - Richtungen.dc.html` (interaktiver HTML-Prototyp – nur Variante **#1a** Desktop und **#1c** Mobil; 1b/1d ignorieren). Die HTML-Datei ist eine Designreferenz, kein Code zum Kopieren.

Vorgehen:
1. Lies zuerst die bestehende Auswertungs-Seite, ihre Datenquellen und die vorhandenen UI-Komponenten (Buttons, Inputs, Segmented Control, Date-Range-Picker, Athleten-Select, Spracheingabe). Nutze diese wieder, statt neue zu bauen.
2. Prüfe, ob das Backend die **Werte der vorherigen Auswertung** pro Kriterium (+ Datum) liefert. Falls nicht: sag mir Bescheid und schlage die minimale API-Erweiterung vor, bevor du sie baust.
3. Baue Desktop (1a): Kopfzeile mit Speichern oben, dunkler Athleten-Streifen mit Kennzahlen (ersetzt die Donuts), Bewertungstabelle mit 1–5-Skala, gestrichelter Markierung des letzten Werts, Δ-Pille und einklappbaren Notizen; rechte Spalte (380px, sticky) mit Entwicklung je Bereich, Bemerkung/Maßnahmen, persönlichen Zielen; darunter Trickziel-Chips mit Filter.
4. Baue Mobil (1c, < 768px): fester Kopf mit Athleten-Karte und Tab-Leiste (Skate · Mental · Athletik · Ziele · Abschluss), scrollender Inhalt, feste Fußleiste mit Fortschritt „x/12 bewertet“ und Speichern. Touch-Targets ≥ 44px.
5. Tablet (768–1199px): Layout 1a, rechte Spalte unter die Tabelle.
6. Bestehende Speicher-, Diktier- und Validierungslogik unverändert weiterverwenden; Warnung bei ungespeicherten Änderungen beim Athletenwechsel/Verlassen.

Farben, Typo, Maße und Zustände exakt laut README übernehmen, sofern die Codebasis keine entsprechenden Tokens hat – dann die vorhandenen Tokens verwenden.

Am Ende: kurze Liste der geänderten Dateien, offene Punkte (z. B. API) und wie ich es lokal teste.
