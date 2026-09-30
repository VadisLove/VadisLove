-- Papierkorb der Trainingspläne täglich um 03:50 Uhr bereinigen (nach Parks
-- und Trainingsvideos). Reines SQL, daher ohne Worker direkt über pg_cron.
-- Getrennt von der Hauptmigration, weil lokale Tests kein pg_cron haben.
select cron.schedule(
 'training-plan-trash-daily',
 '50 3 * * *',
 'select public.training_plan_purge_trash(200)'
);
