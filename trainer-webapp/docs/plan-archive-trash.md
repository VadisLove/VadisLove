# Trainingspläne archivieren und löschen

Stand: 30. September 2026. Branch `claude/plaene-archivieren-loeschen-9e79bb`, Basis
`origin/main` (`1aca2c1`, Live-Stand). Umsetzung von Punkt 7 aus
[roadmap-review-2026-09-08.md](roadmap-review-2026-09-08.md) (Nachtrag 30.09.2026).
Vorbild für den Papierkorb ist [Schritt 7c](park-cleanup-step-7c.md).

## Ziel

Die Planübersicht wächst nicht endlos. Ausgeführte Pläne wandern ins Archiv und bleiben
dort einsehbar und reaktivierbar. Nicht mehr benötigte Pläne lassen sich über einen
Papierkorb löschen, ohne dass die Historie der Athleten verloren geht. Das Datenmodell
lässt späteres Teilen archivierter Pläne mit anderen Trainern (Punkt 8) zu.

## Ist-Stand vor der Umsetzung

- **Vorlage des Trainers:** `training_plans` + `training_plan_versions` (Versionen).
  Ändern ausschließlich über `training_command('plan_save')`, nur der Ersteller.
- **Kopie je Athlet:** `training_plan_snapshot_shares` (unveränderlicher Snapshot).
  Fortschritt (`training_trick_progress`), Nachweise (`training_video_evidence`) und
  Demovideos hängen per `on delete cascade` an der Kopie. Live: 14 Kopien, davon 7
  Altfreigaben ohne gespeicherte Vorlage.
- **Sessions** verweisen per `restrict` auf eine Planversion und tragen den Planinhalt
  zusätzlich selbst (`plan_snapshot`). Versionen persönlicher Pläne sind per Trigger
  unveränderlich.
- **„Ausgeführt“** gab es als Feld nicht; die Oberfläche zeigte 100 %, wenn alle Tricks
  einer Kopie bestätigt waren.

## Bestätigte Entscheidungen (Nutzer, 30.09.2026)

- **Ausgeführt** = alle Tricks einer Kopie bestätigt (egal ob per Meldung, Rückblick
  oder Live-Training). Die Kopie wandert dann für den Athleten nach „Erledigt“. Sind
  alle Kopien erledigt, wird der Plan automatisch archiviert – nur im Moment der letzten
  Bestätigung; ein reaktivierter Plan bleibt aktiv. Pläne ohne Athleten werden nie
  automatisch archiviert.
- **Manuell als erledigt markieren** jederzeit möglich (z. B. zu schwer, Verletzung).
- **Rechte:** Ersteller und Vorstand. Der Vorstand darf Pläne von Trainern verwalten,
  die Mitglied (Trainerrolle) eines von ihm verwalteten Vereins/Verbands sind
  (`can_manage_organization`). Neue Athleten weist nur der Ersteller zu. Athleten mit
  Erstellrecht verwalten ihre eigenen Pläne selbst.
- **Entwürfe:** eigene Pläne ohne aktive Zuweisung (nie zugewiesen oder ohne Auswahl
  reaktiviert). Eigener Bereich „Entwürfe“; dort wie bisher über „Bearbeiten“ zuweisen.
- **Reaktivieren** fragt neu ab, wem der Plan zugewiesen wird: bisherige Athleten sind
  vorausgewählt (Kopie samt Fortschritt kommt zurück), weitere Athleten und Gruppen
  bekommen den aktuellen Planstand, Abgewählte behalten den Plan unter „Erledigt“.
  Ohne Auswahl landet der Plan bei den Entwürfen.
- **Papierkorb:** 30 Tage wiederherstellbar. „Wiederherstellen“ bringt den Plan dorthin
  zurück, wo er war; ein vorher aktiver Plan landet im Archiv (niemand wird ungefragt
  wieder zugewiesen).
- **Athletenhistorie beim Löschen** (je Athlet entschieden):
  mit Verlauf (ein Trick nicht mehr „Offen“, ein Nachweis oder eine Session aus dem Plan)
  bleibt die Kopie dauerhaft unter „Erledigt“ – nachvollziehbar, wer was aus welchem Plan
  mit welchen Tricks gemacht hat. Ohne Verlauf verschwindet die Kopie sofort und wird mit
  der Vorlage endgültig entfernt; ein versehentlich angelegter Plan ist nach der Frist
  vollständig weg. Videodateien löscht wie bisher der Worker nach 14 Tagen; der Nachweis
  selbst bleibt.
- **Neue Gruppen-/Vereinsmitglieder** erben archivierte oder gelöschte Pläne nicht.

## Umsetzung

### Migration `20260930100000_plan_archive_trash`

- Spalten `training_plans.archived_at/_by/_reason`, `deleted_at/_by` und
  `training_plan_snapshot_shares.archived_at/_reason`, `deleted_at/_by`,
  `keep_for_athlete` (Standardwerte, rein additiv).
- Restriktive Policy `training_plan_snapshot_shares_hide_deleted`: Empfänger sehen
  gelöschte Kopien ohne Verlauf nicht mehr.
- RPCs (`security invoker` → `private`, Prüfung in der DB):
  `training_plan_archive`, `training_plan_reactivate`, `training_plan_delete`,
  `training_plan_restore`, `training_plan_library` (Status aller verwaltbaren Pläne
  inkl. Altfreigaben). Parameter `p_plan` ist die Plan-ID (Text, auch für Altfreigaben),
  `p_owner` der Ersteller (Vorstand).
- Trigger: automatisches Archivieren beim letzten bestätigten Trick; Sperren für neue
  Sessions (`share:`/`plan:`), neue Nachweise und neue Versionen archivierter oder
  gelöschter Pläne (`TRAINING_PLAN_ARCHIVED`, SQLSTATE 55000).
- Ersetzt (nur um Statusprüfung ergänzt): `training_share_to` (erneutes Zuweisen holt
  eine erledigte Kopie zurück), `training_assign_plan` (nur aktive Pläne),
  `training_inherit_group_plans`, `training_inherit_club_plans`,
  `training_club_templates` (keine gelöschten Vorlagen), `training_protect_version`
  (Kaskade bei endgültiger Bereinigung erlaubt, sonst unverändert).
- `training_plan_purge_trash(max_items)` nur für die Service-Rolle: löscht nach 30 Tagen
  Kopien ohne Verlauf, löst Sessions von der Vorlage (`plan_version_id = null`, Inhalt
  bleibt im Session-Snapshot) und entfernt Vorlage, Versionen und Zuweisungen.

### Migration `20260930100100_plan_trash_schedule`

pg_cron-Job `training-plan-trash-daily` um 03:50 Uhr ruft
`public.training_plan_purge_trash(200)` direkt auf (reines SQL, kein Worker nötig).

### App

- `training_plan_library` wird auf `/trainingsplaene` geladen; fehlt die Migration, zeigt
  die App alles wie bisher als aktiv. Die Freigaben-Abfrage fällt bei fehlenden Spalten
  (42703) auf den alten Spaltensatz zurück.
- Planliste mit Umschalter **Aktiv · Entwürfe · Archiv** (Athleten: **Aktiv · Erledigt**,
  Vorstand zusätzlich **Verein**), darunter „Papierkorb · N“.
- Plan-Detail: Menü „…“ mit „Als erledigt markieren“ und „Löschen“; archivierte Pläne sind
  nur lesbar, einzige Hauptaktion „Reaktivieren“. Sheets „Wem zuweisen?“ und Lösch-
  Rückfrage mit Wirkung je Athlet (mit/ohne Verlauf).
- Meldungen und „nächster Schritt“ berücksichtigen nur laufende Pläne; „Mein Fortschritt“
  der Athleten zeigt weiterhin alle eigenen Pläne.
- Dateien: `src/features/plan-hub/plan-archive.tsx` (neu), `plan-hub.tsx`,
  `plan-detail.tsx`, `plan-hub-model.ts`, `plan-hub.module.css`,
  `src/app/trainingsplaene/{actions.ts,page.tsx}`,
  `src/data/shared-training-plan-repository.ts`, `src/domain/models.ts`.

### Bewusste Grenzen

- Fortschrittsänderungen an einer bereits erledigten Kopie sperrt die Datenbank nicht
  (sonst würde ein gerade laufendes Live-Training beim Bestätigen scheitern); die
  Oberfläche bietet dafür keine Aktion mehr an.
- Offene Meldungen eines manuell archivierten Plans erscheinen nicht mehr in der
  Meldungsliste; nach dem Reaktivieren sind sie wieder da.
- Altfreigaben ohne gespeicherte Vorlage: Reaktivieren nur für bisherige Athleten.
- Teilen archivierter Pläne mit anderen Trainern folgt in Punkt 8; archivierte Pläne
  bleiben dafür vollständige Datensätze (Vorlage + Versionen).

## Technischer Nachweis (30.09.2026, lokal)

- `npm test`: 274 Tests bestanden, darunter neu
  `tests/plan-archive-database.test.mjs` (8 Tests: automatisches Archivieren, Rechte
  Ersteller/Vorstand/Fremde/Athleten, Reaktivieren mit neuer Auswahl und als Entwurf,
  keine Vererbung/Nachweise/Sessions für archivierte Pläne auch über den
  Live-Training-Command, Papierkorb mit Athletensicht, Wiederherstellen, Frist,
  endgültige Bereinigung mit erhaltener Historie, Altfreigaben) und
  `tests/plan-archive-model.test.mjs` (5 Tests). Die Migration läuft dort nach den
  Live-Training-Migrationen wie in Produktion.
- Test-Fixture `plan-hub-base.sql`: Versionen hängen jetzt wie in Produktion per
  `on delete cascade` am Plan.
- Typprüfung und Produktionsbuild bestanden; Lint für alle geänderten Dateien sauber.
  `npm run lint` meldet 2 Fehler in `docs/design_handoff_trainingsplaene/support.js`
  (mit `1aca2c1` auf `main` gekommen, hier unverändert).
- Lokaler Browserprüfstand `tests/support/plan-hub-fixture-server.mjs` (PGlite mit den
  echten Migrationen, synthetische Konten, kein Produktionszugang), mobil 375 × 812:
  Trainer – Umschalter, Archiv mit Grund/Datum, Reaktivieren (Abwählen/Hinzufügen),
  Löschen mit Rückfrage (1 mit / 2 ohne Verlauf), Papierkorb und Wiederherstellen ins
  Archiv; Athlet – „Erledigt“, nur lesbar, kein „Jetzt dran“; Vorstand – Bereich
  „Verein“ mit den Plänen der Vereinstrainerin. Desktop: Menü „…“ geprüft. Keine
  Konsolenfehler.
- Produktion nur lesend geprüft: letzte eingetragene Migration `20260929130100`; die
  ersetzten Funktionen stammen ausschließlich aus bereits eingespielten Migrationen.

## Veröffentlichung

Offen. Reihenfolge:

1. **Vor dem Deploy** beide Migrationen im Supabase-SQL-Editor ausführen (erst
   `20260930100000_plan_archive_trash.sql`, dann `20260930100100_plan_trash_schedule.sql`)
   und in `supabase_migrations.schema_migrations` eintragen.
2. Rollback-Tag `production/stable-before-plaene-archiv-20260930` auf `origin/main` setzen.
3. Branch nach `main` bringen (= Deploy über Vercel), Produktions-URL prüfen.

Rollback: App über den Tag zurücksetzen. Die Migration ist additiv; eine ältere App
ignoriert die neuen Spalten. Der Cron-Job lässt sich mit
`select cron.unschedule('training-plan-trash-daily');` stoppen.

## Praxisprüfliste (offen)

- Plan einem Athleten zuweisen, alle Tricks bestätigen → Plan im Archiv „Alle bestätigt“,
  beim Athleten unter „Erledigt“.
- Plan mit zwei Athleten manuell als erledigt markieren → beide sehen „Erledigt“, kein
  Trainingsstart, kein Melden.
- Reaktivieren: einen Athleten abwählen, einen neuen hinzufügen → Fortschritt des
  bisherigen bleibt, Abgewählter behält „Erledigt“.
- Reaktivieren ohne Auswahl → Plan unter „Entwürfe“.
- Plan löschen → Athlet ohne Verlauf sieht ihn nicht mehr, Athlet mit Verlauf unter
  „Erledigt“; im Papierkorb wiederherstellen → Plan im Archiv.
- Vorstand: Bereich „Verein“ zeigt Pläne der Vereinstrainer; archivieren/löschen möglich.
- Am Folgetag nach 30 Tagen bzw. im Cron-Verlauf `training-plan-trash-daily` prüfen.
