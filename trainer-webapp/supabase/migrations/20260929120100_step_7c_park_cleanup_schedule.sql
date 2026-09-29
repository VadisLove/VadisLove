-- Schritt 7c: täglicher Aufruf der Park-Speicherbereinigung (03:45 Uhr, nach den
-- Trainingsvideos). Getrennt von der Hauptmigration, weil lokale Tests kein
-- pg_cron/vault haben.

-- Derselbe Cron-Schlüssel und dieselbe Basis-URL wie die übrigen Worker.
create function private.park_dispatch_storage_cleanup() returns void
language plpgsql security definer set search_path='' as $$
declare base_url text; worker_secret text;
begin
 select decrypted_secret into base_url from vault.decrypted_secrets where name='carpool_worker_url';
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='carpool_cron_secret';
 if base_url is null or worker_secret is null then
  raise warning 'Park storage cleanup is not configured';
  return;
 end if;
 perform net.http_get(
  url:=regexp_replace(base_url,'/api/carpools/mail$','/api/parks/storage-cleanup'),
  headers:=jsonb_build_object('Authorization','Bearer '||worker_secret),
  timeout_milliseconds:=60000
 );
end; $$;
revoke all on function private.park_dispatch_storage_cleanup() from public,anon,authenticated;

select cron.schedule(
 'park-storage-cleanup-daily',
 '45 3 * * *',
 'select private.park_dispatch_storage_cleanup()'
);
