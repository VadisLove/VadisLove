# Schritt 7c – Parks löschen, Speicherbereinigung und Caching

Stand: 29. September 2026. Branch `claude/parks-delete-storage-caching-4f8943`, Basis
`claude/trainingsplaene-restliche-lucken-38e8f4` (`25a8b6d`, aktueller Produktionsstand).
Vom Nutzer am 28.09.2026 vorgemerkt und am 29.09.2026 beauftragt. Ergänzt
[Schritt 7](park-run-planner-step-7.md) und [Schritt 7b](park-ground-step-7b.md).

## Ziel

Parks lassen sich wieder entfernen, ohne fremde Runs zu verlieren. Der Speicher in
Supabase bleibt schlank, und wiederholtes Laden derselben Parkdateien verursacht
weniger Egress (Datenabruf aus Supabase).

## Bestätigte Entscheidungen (Nutzer, 29.09.2026)

- **Löschrecht:** nur die Person, die den Park angelegt hat, und Fachreferenten (Rolle
  `specialist`). In der Datenbank am 29.09.2026 gegengeprüft: genau zwei Fachreferenten
  (der Nutzer, BRIV, und Ingo Naschold, RSV NRW). Trainer und Vorstand dürfen Parks
  bearbeiten, aber nicht löschen.
- **Runs anderer Athleten:** Löschen ist gesperrt, solange der Park Runs anderer
  Athleten hat; die App zeigt die Anzahl. Eigene Runs der löschenden Person werden
  beim endgültigen Löschen mitgelöscht.
- **Papierkorb:** Gelöschte Parks sind sofort für alle unsichtbar und 30 Tage lang
  wiederherstellbar (Runbuilder → „Papierkorb“ → „Wiederherstellen“). Danach löscht
  der tägliche Worker Park, Versionen und eigene Runs endgültig.
- **Dateien:** Luftbild, Höhenraster und Modelle werden mit dem endgültigen Löschen
  entfernt (sie sind dann in keiner Parkversion mehr referenziert).
- **Höhenraster mit 2 statt 4 Byte:** auf später verschoben. Speicherverbrauch
  beobachten, bevor mehr Nutzer dazukommen bzw. wenn der Wechsel auf Pro ansteht.

## Umsetzung

- **Migration `20260929120000_step_7c_park_trash_storage`:** Spalten
  `skateparks.deleted_at`/`deleted_by`; Operationen `park_delete` (mit Revision) und
  `park_restore` über den bestehenden Zugang `public.park_command` (idempotent);
  Trigger verhindern neue Versionen und Runs im Papierkorb; `park_directory` liefert
  `can_delete` und `trash`, `park_detail` liefert `can_delete` und
  `foreign_run_count`. Nur für die Service-Rolle: `park_purge_trash` (30 Tage) und
  `park_orphan_objects` (Dateien in `skatepark-aerials` und `skatepark-models`, die in
  keiner Parkversion vorkommen und älter als 24 Stunden sind).
- **Migration `20260929120100_step_7c_park_cleanup_schedule`:** pg_cron-Job
  `park-storage-cleanup-daily` um 03:45 Uhr, gleicher Cron-Schlüssel und gleiche
  Basis-URL wie die übrigen Worker.
- **Worker `/api/parks/storage-cleanup`:** erst Papierkorb leeren, dann verwaiste
  Dateien über die Storage-API löschen (höchstens 5 × 200 Dateien pro Lauf).
- **Caching:** signierte Links für Parkdateien gelten 7 Tage und werden serverseitig
  6 Tage lang wiederverwendet (stabile URL, damit Browser und CDN treffen). Neue
  Uploads erhalten `Cache-Control` mit einem Jahr, weil sich eine Datei unter ihrem
  Pfad nie ändert. Ohne Service-Schlüssel (lokal) bleibt es bei 1-Stunden-Links.
  Folge: Ein deaktiviertes Konto kann einen bereits erhaltenen Link bis zu 7 Tage
  weiter nutzen; Parkdateien sind ohnehin für alle aktiven Nutzer lesbar.
- **Oberfläche:** Knopf „Löschen“ im Park (mit Rückfrage bzw. Hinweis auf fremde
  Runs) und Bereich „Papierkorb“ in der Runbuilder-Übersicht.

## Stand am 29.09.2026 (vor dem Löschen)

5 Parks, 16 Versionen, 2 Runs in 2 Parks. Park-Speicher 23,6 MB (Modelle 20 MB,
Luftbilder 3,6 MB), davon 14,2 MB in keiner Parkversion referenziert (alle jünger als
24 Stunden, also noch nicht betroffen).

## Veröffentlichung

Stand 29.09.2026: Beide Migrationen vom Nutzer im SQL-Editor angewendet und in
`supabase_migrations.schema_migrations` eingetragen (Spalten, Funktionen, Trigger und
Cron-Job `park-storage-cleanup-daily` per Abfrage bestätigt). Deploy durch den Nutzer
(`trainer-webapp-9hc74dz46`, Commit `80853e3`), live unter trainer-webapp-ruby.vercel.app;
`/api/parks/storage-cleanup` antwortet ohne Schlüssel mit 401. Rollback-Tag
`production/stable-before-step-7c-20260929` → `25a8b6d`. Praxisprüfung offen.

Ablauf:

1. Beide Migrationen in dieser Reihenfolge in Produktion anwenden (vor dem Deploy,
   weil die App die neuen Felder liest).
2. Deploy durch den Nutzer.
3. Praxisprüfung: Park anlegen, löschen, im Papierkorb wiederherstellen; Park mit Run
   eines anderen Athleten lässt sich nicht löschen; Trainer ohne Ersteller-Rolle sieht
   keinen Löschen-Knopf. Am Folgetag Ergebnis des Cron-Laufs prüfen.
