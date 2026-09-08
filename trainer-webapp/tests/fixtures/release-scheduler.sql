-- Isolierte Verträge für Supabase-Erweiterungen. Die echte Release-Migration
-- wird unverändert ausgeführt; diese Doubles senden niemals Netzwerkverkehr.
create schema vault;
create schema net;
create schema cron;
create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
create table net.test_requests(id bigint generated always as identity, url text, headers jsonb, timeout_milliseconds integer);
create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 2000)
returns bigint language sql as $$
  insert into net.test_requests(url,headers,timeout_milliseconds)
  values(url,headers,timeout_milliseconds) returning id;
$$;
create table cron.job(jobid bigint generated always as identity, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, job_schedule text, job_command text)
returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values(job_name,job_schedule,job_command)
  on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
  returning jobid;
$$;
