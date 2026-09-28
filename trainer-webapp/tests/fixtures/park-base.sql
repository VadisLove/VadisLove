-- Isolierte PostgreSQL-Verträge für den Park- und Run-Planer (Schritt 7); keine Echtdaten.
-- Baut auf training-base.sql und der Schritt-5-Migration auf und ergänzt nur die
-- zusätzlich referenzierten Tabellen und Helfer in vereinfachter Form.
alter table public.relationships add column relationship_type text not null default 'trainer_athlete';
alter table public.relationships add column guardian_user_id uuid;
alter table public.relationships add column athlete_user_id uuid;
alter table public.organization_memberships add column role text;
create function private.is_trainer_profile(p uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=p and account_type='trainer') $$;
create function private.account_is_active(p uuid) returns boolean language sql stable as $$ select p<>'00000000-0000-0000-0000-000000000009'::uuid $$;

create table public.events(id uuid primary key default gen_random_uuid(),organization_id uuid,created_by uuid,title text,type text,starts_at timestamptz);
-- Vereinfachte Terminsichtbarkeit: Ersteller sieht seine Termine.
create table public.event_viewers(event_id uuid,user_id uuid);
create function private.calendar_event_visible(target uuid, actor uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id=target and (e.created_by=actor or exists(select 1 from public.event_viewers v where v.event_id=e.id and v.user_id=actor))) $$;

create schema storage;
grant usage on schema storage to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
alter table storage.objects enable row level security;
grant select,insert on storage.objects to authenticated;
-- Wie in Produktion: Termine sind per RLS nur für berechtigte Personen lesbar.
alter table public.events enable row level security;
grant select on public.events to authenticated;
create policy events_read_visible on public.events for select to authenticated using(private.calendar_event_visible(id,auth.uid()));
