-- Nutzt die in diesem Supabase-Projekt vorhandenen Erweiterungen. Der Worker
-- bleibt ohne Vault-Konfiguration inaktiv; Geheimnisse gehören niemals ins Git.
create function private.carpool_dispatch_mail_worker() returns void
language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text;
begin
  select decrypted_secret into worker_url from vault.decrypted_secrets where name='carpool_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='carpool_cron_secret';
  if worker_url is null or worker_secret is null then
    raise warning 'Carpool mail scheduler is not configured'; return;
  end if;
  if worker_url !~ '^https://[^/]+/api/carpools/mail$' then raise exception 'Invalid carpool worker URL'; end if;
  perform net.http_get(url:=worker_url,headers:=jsonb_build_object('Authorization','Bearer '||worker_secret),timeout_milliseconds:=60000);
end $$;
revoke all on function private.carpool_dispatch_mail_worker() from public,anon,authenticated;
select cron.schedule('carpool-mail-every-minute','* * * * *','select private.carpool_dispatch_mail_worker()');
