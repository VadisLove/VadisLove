-- Ergänzt die minimale Fahrten-Fikstur um die produktiven Kalenderverträge.
create type public.attendance_status as enum('open','confirmed','declined');
create type public.event_type as enum('training','contest','medical','meeting');
alter table public.events
  alter column id set default gen_random_uuid(),
  add column title text not null default 'Event',
  add column description text not null default '',
  add column state_code text,
  add column region_name text,
  add column capacity integer not null default 10,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.events alter column type type public.event_type using type::public.event_type;
create table public.event_participants(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id),
  invited_email text not null,
  invited_by uuid not null,
  status public.attendance_status not null default 'open',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id,invited_email)
);
alter table public.event_participants enable row level security;
grant select,insert,update,delete on public.event_participants to authenticated;
create function private.current_profile_email() returns text language sql stable security definer set search_path='' as $$
  select lower(profile.email) from public.profiles profile where profile.id=auth.uid()
$$;
grant execute on function private.current_profile_email() to authenticated;
create policy participants_manage_event on public.event_participants for all to authenticated
  using(exists(select 1 from public.events event where event.id=event_id and event.created_by=auth.uid()))
  with check(exists(select 1 from public.events event where event.id=event_id and event.created_by=auth.uid()));
create policy participants_read_related on public.event_participants for select to authenticated
  using(user_id=auth.uid() or invited_email=private.current_profile_email()
    or exists(select 1 from public.events event where event.id=event_id and event.created_by=auth.uid()));
create policy participants_update_self on public.event_participants for update to authenticated
  using(user_id=auth.uid() or invited_email=private.current_profile_email())
  with check(user_id=auth.uid() or invited_email=private.current_profile_email());
grant insert,update,delete on public.events to authenticated;
create policy events_insert on public.events for insert to authenticated with check(created_by=auth.uid());
create policy events_update on public.events for update to authenticated using(created_by=auth.uid()) with check(created_by=auth.uid());
create policy events_delete on public.events for delete to authenticated using(created_by=auth.uid());
grant execute on function private.current_account_is_active() to authenticated;
alter table public.notifications add column read_at timestamptz,add column created_at timestamptz not null default now();
grant select on public.events,public.event_participants,public.profiles,public.relationships,
  public.guardian_approval_requests to service_role;
grant select,insert,update on public.notifications to service_role;

-- Lokale Scheduler-Doubles enthalten keine Geheimnisse und führen keine Requests aus.
create schema vault;
create schema cron;
create schema net;
create table vault.decrypted_secrets(name text,decrypted_secret text);
create table cron.job(jobid bigserial,jobname text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
begin insert into cron.job(jobname,schedule,command) values($1,$2,$3);return 1;end
$$;
create function net.http_get(url text,headers jsonb default '{}',timeout_milliseconds integer default 1000)
returns bigint language sql as $$select 1::bigint$$;
