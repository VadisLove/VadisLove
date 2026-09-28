# Schritt 7 – Technischer Nachweis und Praxisprüfliste

Datum: 24.09.2026. Branch `claude/step-7-park-planner`, Basis
`codex/step-6-session-recaps` (`8aa88a3`, produktiver Stand mit Schritt 6 und Stance). Umfang, Rollen und Abnahmekriterien:
[Schritt 7](park-run-planner-step-7.md).

**Status: technisch produktiv veröffentlicht am 24.09.2026** auf ausdrücklichen
Wunsch des Nutzers (App bisher nur vom Nutzer selbst genutzt). Praxisabnahme offen.

## Implementierter Umfang

- Migration `20260924135627_step_7_park_run_planner.sql`: `skateparks`,
  unveränderliche `skatepark_versions`, `trick_catalog` (65 vorbefüllte Tricks),
  `park_runs`, `park_run_steps`, idempotenter Command `park_command`, Lese-RPCs
  `park_directory` / `park_detail`, privater Bucket `skatepark-aerials`.
- Oberfläche `/skateparks` (Parkliste, Runs, Trick-Freigabe) und
  `/skateparks/[parkId]` (3D-Ansicht mit three.js / @react-three/fiber,
  Park-Bearbeitungsmodus, Run-Editor). Navigationseintrag „Skateparks“.
- Runs verwenden die Athletenidentität `training_athletes` aus Schritt 5.

## Technische Prüfung (lokal, 24.09.2026)

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | 163/163 bestanden (davon 13 neu: 9 Datenbank, 4 Domain) |
| `npm run typecheck` | fehlerfrei |
| `npm run lint` | fehlerfrei |
| `npm run build` | erfolgreich, Routen `/skateparks`, `/skateparks/[parkId]`, `/api/parks` |

Datenbanktests (`tests/park-database.test.mjs`, PGlite gegen die echte Migration):
öffentliche Lesbarkeit und Sperre deaktivierter Konten; Parkänderung nur durch
Ersteller, Trainer und Vorstand; Versionierung und Schreibschutz; ungültige
Obstacles, doppelte IDs, fremde Luftbildpfade und fehlende Rechtebestätigung;
mehrere Pins an einem Obstacle; Run bleibt nach Umbau an seiner Version;
Athlet/Trainer schreiben, Eltern lesen, Fremde sehen nichts; Idempotenz,
Revision und paralleles Speichern; Terminverknüpfung nur für sichtbare
Trainings/Contests; Trick-Vorschlag, Freigabe und Sichtbarkeit; Upload-Policy.

Lokaler Browserprüfstand (`tests/support/park-fixture-server.mjs`: PGlite mit
echten Migrationen, synthetische Konten, simulierte Auth/Storage):

- Athlet: Park anlegen → Bearbeitungsmodus → 6 Obstacles aus der Bibliothek
  setzen und ziehen (Kamera bleibt beim Ziehen fest) → als Version 2 speichern.
- Run planen: 6 Schritte per Tipp auf Obstacles, davon je zwei an Ledge und
  Treppe (nebeneinanderliegende Pins), Linie mit Pfeilen, Start/Ziel sichtbar,
  Stance/Seite, Contest-Termin, Ziel-Score 72,5; unbekannter Trick „Hippie Jump“
  vorgeschlagen und sofort verwendet; nach Neuladen identisch.
- Elternsicht: Run sichtbar, ohne „Bearbeiten“ und ohne „Park bearbeiten“.
- 375 × 812: kein horizontales Scrollen, 3D-Ansicht und Run-Details bedienbar.

## Bekannte Grenzen der Prüfung

- Luftbild-Upload nur über Datenbank-Policy geprüft, nicht im Browser mit einem
  echten Bild und nicht gegen Supabase Storage.
- Keine Prüfung auf echten Mobilgeräten (Touch-Gesten, WebGL-Leistung).
- Trainer-Ablauf (Run für betreuten Athleten) und Trick-Freigabe nur per
  Datenbanktest, nicht im Browser.
- RLS-Hilfsfunktionen der Produktion (`calendar_event_visible`,
  `is_trainer_profile`) sind im Prüfstand vereinfacht nachgebildet.

## Produktionsrelease (24.09.2026)

- Vorheriger Stand: `dpl_AxqqDHdSxVZ8Frq6mWN6pwYSAWCc` (Schritt 6). Sicherungstag
  `production/stable-before-step-7-park-planner-20260924` auf `8aa88a3`, vor
  Migration und Deployment zu origin gepusht.
- Kombinierter Stand (Schritt 6 + 7) vor Veröffentlichung erneut geprüft:
  165/165 Tests, Typprüfung, Lint, Produktionsbuild.
- Migration auf `lglmlktrngmrimvhwxab` als Version `20260924135627` angewandt;
  lokaler Dateiname angeglichen. Kommentare wurden beim Anwenden weggelassen,
  SQL-Anweisungen unverändert. Vorabprüfung der referenzierten Funktionen,
  Tabellen und Spalten bestanden. RLS auf allen fünf neuen Tabellen aktiv,
  65 Tricks, Bucket privat. Transaktionaler Funktionstest (Park, Run mit zwei
  Pins am selben Obstacle, Detail- und Listen-RPC) bestanden und vollständig
  zurückgerollt; danach 0 Parks, 0 Runs, 0 Requests. Security-Advisor: keine
  neuen Findings, nur bekannte Altbestände.
- Vercel: `dpl_7BCNCfEAEMNRE7o5L6Nsd2PzMVyA`, Status `READY`; die Produktions-
  adresse `https://trainer-webapp-ruby.vercel.app` zeigt laut `vercel inspect`
  darauf. Ein unmittelbar vorheriger, identischer Deploy-Aufruf erzeugte zusätzlich
  `trainer-webapp-n9plrwado` (gleicher Code, ersetzt).
- HTTP: `/login` 200; `/skateparks` und `/api/parks` ohne Anmeldung 307 zum Login.
  `vercel logs` (Level error, 30 min): keine Einträge.
- Kein angemeldeter Produktions-Browsertest; Teil der Praxisabnahme.

Rollback: vorheriges Vercel-Deployment wieder zuweisen
(`vercel promote dpl_AxqqDHdSxVZ8Frq6mWN6pwYSAWCc`). Die additive
Datenbankerweiterung bleibt bestehen, damit erfasste Parks/Runs nicht verloren gehen.

## Praxisprüfliste für den Nutzer

- [ ] Einen echten Park anlegen und mit Luftbild nachbauen (Maßstab über Bildbreite).
- [ ] Obstacles auf dem Tablet/Handy verschieben, drehen und Maße anpassen.
- [ ] Run mit mindestens 5 Tricks inkl. zwei Tricks am selben Obstacle planen;
      Reihenfolge ändern; Start und Ziel setzen.
- [ ] Run einem Contest-Termin zuordnen und nach dem Contest den erhaltenen Score eintragen.
- [ ] Als Trainer einen Run für einen betreuten Athleten anlegen.
- [ ] Als Elternteil den Run des Kindes ansehen (ohne Bearbeitungsmöglichkeit).
- [ ] Park umbauen und prüfen, dass bestehende Runs ihre Version behalten.
- [ ] Trick vorschlagen und als Trainer/Funktionär freigeben.
- [ ] Verständlichkeit: Sind Draufsicht, Pins und Pfeile ohne Erklärung klar?
