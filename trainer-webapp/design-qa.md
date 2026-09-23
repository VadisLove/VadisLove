# Design-QA – Passwortsichtbarkeit in Anmeldung und Registrierung

**Datum:** 23.09.2026  
**Referenz:** `/var/folders/m5/_32ynztn12q_h2mq20gx0nkr0000gn/T/TemporaryItems/NSIRD_screencaptureui_PPbHL9/Bildschirmfoto 2026-09-23 um 10.23.46.png` (1078 × 334 px)  
**Implementierung:** `src/app/login/page.module.css`  
**Prüfkontext:** Next.js-Entwicklungsserver, Codex In-App-Browser, kombinierter Vergleich unter `http://localhost:8010/comparison.html`

## Ziel und Abnahmekriterien

- Zielentität: Passwort-Sichtbarkeitsschalter der öffentlichen Anmeldung und Registrierung.
- Nutzungskontext: Desktop-Browser für anonyme Nutzerinnen und Nutzer.
- Relevante Qualitätsmerkmale: visuelle Konsistenz, Benutzbarkeit, Barrierefreiheit und Wartbarkeit.
- Abnahme: Der Schalter erscheint wie im Profil als blaues Auge ohne vollflächigen blauen Button, liegt vollständig innerhalb des Eingabefelds und schaltet jedes Passwortfeld unabhängig um.

## Vergleich und Korrekturen

| Prüffläche | Referenz | Implementierung und Nachweis | Ergebnis |
| --- | --- | --- | --- |
| Typografie | Unaufdringlicher Icon-Schalter ohne eigene Beschriftung im Sichtbereich | Vorhandene Formular-Typografie unverändert; zugängliche Beschriftung bleibt für Screenreader erhalten | bestanden |
| Abstand und Layout | Auge vollständig innerhalb des Felds, rechts ausgerichtet | 38 × 38 px großer Schalter mit 5 px rechtem Innenabstand; Browser-Messung bestätigt vollständige Begrenzung im Feld | bestanden |
| Farben und Zustände | Transparenter Hintergrund, blaues Augen-Icon | Ruhezustand transparent mit `rgb(8, 116, 209)`; vorhandener Fokuszustand bleibt für Tastaturbedienung sichtbar | bestanden |
| Icon/Asset | Blaues Augen-Symbol | Gemeinsame Lucide-Komponente `Eye`/`EyeOff`, identisch zur Profilfunktion; kein zusätzliches Raster-Asset | bestanden |
| Inhalt | Bestehende Formulartexte | Keine Texte, Regeln oder Formulardaten geändert | bestanden |
| Interaktion | Sichtbarkeit direkt am jeweiligen Passwortfeld | Anmeldung sowie beide Registrierungsfelder einzeln geprüft; `aria-pressed` und Beschriftung wechseln korrekt | bestanden |

## Iterationshistorie

1. Ausgangsbefund: Die allgemeine Regel `.form button` überschrieb den Icon-Schalter. Dadurch erhielt er den blauen Primärbutton-Hintergrund, eine zu große Mindesthöhe und ragte aus dem Feld.
2. Korrektur: Die Primärbutton-Regel wurde auf den direkten Formular-Button (`.form > button`) begrenzt; der Icon-Schalter behält sein eigenes zurückhaltendes Styling.
3. Feinabgleich: Der rechte Innenabstand wurde entsprechend der Referenz auf 5 px gesetzt.
4. Nachprüfung: Kombinierter Referenz-/Implementierungsvergleich, beide Umschaltzustände und Browser-Konsole ohne Fehler geprüft. Es bestehen keine offenen P0-, P1- oder P2-Abweichungen.

## Technische Prüfung

- `npm run lint`: bestanden
- `npm test`: 139 Tests bestanden
- `npm run typecheck`: bestanden
- `npm run build`: bestanden mit Next.js 16.2.12
- Browser-Konsole: keine Fehler

Bekannte Grenze: Die fachliche Praxisabnahme auf dem persönlichen Endgerät des Nutzers steht noch aus; Anmeldung oder Registrierung mit echten Zugangsdaten war nicht Bestandteil dieser visuellen Änderung.

final result: passed
