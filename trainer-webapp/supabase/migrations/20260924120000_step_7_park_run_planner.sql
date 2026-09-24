-- Schritt 7: öffentliche Parkmodelle mit unveränderlichen Versionen, gemeinsamer
-- Trick-Katalog mit Freigabe und Runs je Athlet. Wie in Schritt 5 ist ein
-- privater, idempotenter Command der einzige Schreibzugang; Tabellen sind nur lesbar.

-- ---------------------------------------------------------------------------
-- Rollen-Helfer
-- ---------------------------------------------------------------------------

-- Trainer und Funktionäre dürfen fremde Parks ändern und Trick-Vorschläge prüfen.
create function private.park_is_curator(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select actor is not null and (
  private.is_trainer_profile(actor)
  or exists(select 1 from public.profiles p where p.id=actor and p.account_type::text='organization_staff')
  or exists(select 1 from public.organization_memberships m where m.user_id=actor
    and m.role::text in ('federal_chair','specialist','club_board'))
 );
$$;

-- Lesen eines Athleten-Runs: der Athlet, aktiv zugeordnete Trainer, aktiv verknüpfte Eltern.
create function private.park_can_read_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and athlete is not null and (
  athlete=auth.uid()
  or private.has_active_trainer_athlete_relationship(auth.uid(),athlete)
  or exists(select 1 from public.relationships r where r.active and r.relationship_type::text='guardian'
    and r.guardian_user_id=auth.uid() and r.athlete_user_id=athlete)
 );
$$;

-- Schreiben: nur der Athlet selbst und aktiv zugeordnete Trainer. Eltern lesen nur mit.
create function private.park_can_write_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and athlete is not null and (
  athlete=auth.uid() or private.has_active_trainer_athlete_relationship(auth.uid(),athlete)
 );
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.skateparks (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 120),
  location text not null default '' check(length(location)<=200),
  created_by uuid references public.profiles(id) on delete set null,
  -- Entspricht immer der höchsten Versionsnummer und dient als erwartete Revision.
  latest_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skateparks_creator on public.skateparks(created_by);
create index skateparks_name on public.skateparks(lower(name));

-- Versionen werden nie geändert; Runs referenzieren die Version, in der sie geplant wurden.
create table public.skatepark_versions (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.skateparks(id) on delete restrict,
  version_number integer not null check(version_number>=1),
  content jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(park_id,version_number)
);
create index skatepark_versions_creator on public.skatepark_versions(created_by);

create table public.trick_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 80),
  category text not null check(category in ('flip','grind','slide','grab','air','manual','transition','other')),
  status text not null default 'pending' check(status in ('approved','pending','rejected')),
  -- null = vorbefüllter Standardtrick.
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Ein Name existiert höchstens einmal freigegeben oder in Prüfung.
create unique index trick_catalog_active_name on public.trick_catalog(lower(btrim(name))) where status in ('approved','pending');
create index trick_catalog_creator on public.trick_catalog(created_by);
create index trick_catalog_reviewer on public.trick_catalog(reviewed_by);

create table public.park_runs (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.skateparks(id) on delete restrict,
  park_version_id uuid not null references public.skatepark_versions(id) on delete restrict,
  -- Athletenidentität aus Schritt 5: getrennt vom Login, damit Kinderprofile anschließbar bleiben.
  athlete_id uuid not null references public.training_athletes(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check(length(btrim(title)) between 1 and 120),
  event_id uuid references public.events(id) on delete set null,
  start_point jsonb not null,
  end_point jsonb not null,
  target_score numeric(7,2) check(target_score between 0 and 1000),
  actual_score numeric(7,2) check(actual_score between 0 and 1000),
  note text not null default '' check(length(note)<=2000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index park_runs_park on public.park_runs(park_id);
create index park_runs_version on public.park_runs(park_version_id);
create index park_runs_athlete on public.park_runs(athlete_id);
create index park_runs_event on public.park_runs(event_id);
create index park_runs_creator on public.park_runs(created_by);
create index park_runs_updater on public.park_runs(updated_by);

-- Geordnete Schritte; der Trickname wird als Snapshot gespeichert, damit der Run
-- auch für Personen lesbar bleibt, die einen nicht freigegebenen Vorschlag nicht sehen.
create table public.park_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.park_runs(id) on delete cascade,
  position integer not null check(position>=1),
  obstacle_id text not null,
  trick_id uuid references public.trick_catalog(id) on delete set null,
  trick_name text not null,
  stance text check(stance in ('regular','fakie','switch','nollie')),
  direction text check(direction in ('frontside','backside')),
  note text not null default '' check(length(note)<=500),
  unique(run_id,position)
);
create index park_run_steps_trick on public.park_run_steps(trick_id);

create table private.park_requests (
  actor uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(actor,request_id)
);
revoke all on private.park_requests from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Lesezugriff
-- ---------------------------------------------------------------------------

create function private.park_can_read_run(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.park_runs r join public.training_athletes a on a.id=r.athlete_id
  where r.id=target and private.park_can_read_athlete(a.user_id));
$$;

alter table public.skateparks enable row level security;
create policy skateparks_read_active on public.skateparks for select to authenticated
 using((select private.current_account_is_active()));
alter table public.skatepark_versions enable row level security;
create policy skatepark_versions_read_active on public.skatepark_versions for select to authenticated
 using((select private.current_account_is_active()));
alter table public.trick_catalog enable row level security;
create policy trick_catalog_read on public.trick_catalog for select to authenticated
 using((select private.current_account_is_active()) and (status='approved' or created_by=(select auth.uid()) or (select private.park_is_curator(auth.uid()))));
alter table public.park_runs enable row level security;
create policy park_runs_read on public.park_runs for select to authenticated using(private.park_can_read_run(id));
alter table public.park_run_steps enable row level security;
create policy park_run_steps_read on public.park_run_steps for select to authenticated using(private.park_can_read_run(run_id));

revoke all on public.skateparks,public.skatepark_versions,public.trick_catalog,public.park_runs,public.park_run_steps from public,anon,authenticated;
grant select on public.skateparks,public.skatepark_versions,public.trick_catalog,public.park_runs,public.park_run_steps to authenticated;

-- ---------------------------------------------------------------------------
-- Validierung (auch direkte RPC-Aufrufe gelten als unvertrauenswürdige Eingabe)
-- ---------------------------------------------------------------------------

create function private.park_num(v jsonb, lo numeric, hi numeric) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='number' and (v::text)::numeric between lo and hi,false);
$$;

-- Parkinhalt: Grundfläche, Obstacles mit stabilen IDs und optionalem Luftbild.
create function private.park_validate_content(content jsonb) returns void
language plpgsql set search_path='' as $$
declare o jsonb; a jsonb;
begin
 if content is null or jsonb_typeof(content)<>'object' or length(content::text)>200000
 or coalesce(jsonb_typeof(content->'size'),'')<>'object'
 or not private.park_num(content->'size'->'width',10,300) or not private.park_num(content->'size'->'length',10,300)
 or coalesce(jsonb_typeof(content->'obstacles'),'')<>'array' or jsonb_array_length(content->'obstacles')>300
 then raise exception 'PARK_INVALID'; end if;
 for o in select value from jsonb_array_elements(content->'obstacles') loop
  if jsonb_typeof(o)<>'object' or coalesce(jsonb_typeof(o->'id'),'')<>'string' or length(o->>'id') not between 1 and 64
  or coalesce(o->>'type','') not in ('quarter','bank','bowl','ledge','hubba','stairs','rail','manual_pad','wall')
  or not private.park_num(o->'x',-200,200) or not private.park_num(o->'z',-200,200)
  or not private.park_num(o->'rotation',-360,360)
  or not private.park_num(o->'width',0.1,60) or not private.park_num(o->'length',0.1,60) or not private.park_num(o->'height',0.05,10)
  or (o ? 'label' and (jsonb_typeof(o->'label')<>'string' or length(o->>'label')>60))
  then raise exception 'PARK_INVALID'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(content->'obstacles'))<>jsonb_array_length(content->'obstacles') then raise exception 'PARK_INVALID'; end if;
 a:=content->'aerial';
 if a is not null and jsonb_typeof(a)<>'null' then
  if jsonb_typeof(a)<>'object'
  or coalesce(a->>'path','') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpe?g|png)$'
  or not private.park_num(a->'width',5,400) or not private.park_num(a->'aspect',0.1,10)
  or not private.park_num(a->'rotation',-360,360)
  or not private.park_num(a->'offsetX',-200,200) or not private.park_num(a->'offsetZ',-200,200)
  or not private.park_num(a->'opacity',0.1,1)
  or a->'rightsConfirmed' is distinct from 'true'::jsonb
  then raise exception 'PARK_INVALID'; end if;
 end if;
end; $$;

create function private.park_validate_point(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and private.park_num(p->'x',-200,200) and private.park_num(p->'z',-200,200),false);
$$;

create function private.park_can_see_trick(target uuid, actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trick_catalog t where t.id=target and (
  t.status='approved' or (t.status='pending' and (t.created_by=actor or private.park_is_curator(actor)))
 ));
$$;

-- ---------------------------------------------------------------------------
-- Command
-- ---------------------------------------------------------------------------

-- Ein Command ist atomar. Request-ID schützt Wiederholungen; erwartete Revision
-- und Zeilensperre verhindern unbemerkte Überschreibungen zwischen Geräten.
create function private.park_command(request_id uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); previous private.park_requests%rowtype;
 park public.skateparks%rowtype; run public.park_runs%rowtype; trick public.trick_catalog%rowtype;
 content jsonb; old_content jsonb; result jsonb; target uuid; version_id uuid; version_content jsonb;
 athlete_user uuid; athlete uuid; step jsonb; pos integer:=0; trick_name text; aerial_path text;
begin
 if v_actor is null or not private.current_account_is_active() then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>220000 then raise exception 'PARK_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||request_id::text,7));
 select * into previous from private.park_requests r where r.actor=v_actor and r.request_id=park_command.request_id;
 if found then
  if previous.operation<>operation or previous.payload<>payload then raise exception 'PARK_REQUEST_REUSED'; end if;
  return previous.result;
 end if;

 if operation in ('park_create','park_save') then
  content:=payload->'content'; perform private.park_validate_content(content);
  if coalesce(jsonb_typeof(payload->'name'),'')<>'string' or length(btrim(payload->>'name')) not between 1 and 120
  or (payload ? 'location' and (jsonb_typeof(payload->'location')<>'string' or length(payload->>'location')>200))
  then raise exception 'PARK_INVALID'; end if;
  target:=(payload->>'park_id')::uuid;
  if target is null then raise exception 'PARK_INVALID'; end if;
  aerial_path:=content->'aerial'->>'path';
  if operation='park_create' then
   if exists(select 1 from public.skateparks where id=target) then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
   if aerial_path is not null and split_part(aerial_path,'/',1)<>v_actor::text then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
   insert into public.skateparks(id,name,location,created_by) values(target,btrim(payload->>'name'),coalesce(payload->>'location',''),v_actor);
   insert into public.skatepark_versions(park_id,version_number,content,created_by) values(target,1,content,v_actor) returning id into version_id;
  else
   select * into park from public.skateparks where id=target for update;
   if not found then raise exception 'PARK_INVALID'; end if;
   if park.created_by is distinct from v_actor and not private.park_is_curator(v_actor) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
   if park.latest_version is distinct from (payload->>'revision')::integer then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
   select v.content into old_content from public.skatepark_versions v where v.park_id=target and v.version_number=park.latest_version;
   -- Ein neues Luftbild darf nur aus dem eigenen Upload-Ordner stammen; ein
   -- bereits verwendetes Bild eines anderen Bearbeiters darf erhalten bleiben.
   if aerial_path is not null and aerial_path is distinct from old_content->'aerial'->>'path'
   and split_part(aerial_path,'/',1)<>v_actor::text then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
   update public.skateparks set name=btrim(payload->>'name'),location=coalesce(payload->>'location',''),latest_version=latest_version+1,updated_at=now() where id=target;
   insert into public.skatepark_versions(park_id,version_number,content,created_by) values(target,park.latest_version+1,content,v_actor) returning id into version_id;
  end if;
  result:=jsonb_build_object('park_id',target,'version_id',version_id);

 elsif operation='trick_suggest' then
  if coalesce(jsonb_typeof(payload->'name'),'')<>'string' or length(btrim(payload->>'name')) not between 1 and 80
  or coalesce(payload->>'category','') not in ('flip','grind','slide','grab','air','manual','transition','other')
  then raise exception 'PARK_INVALID'; end if;
  select * into trick from public.trick_catalog t where lower(btrim(t.name))=lower(btrim(payload->>'name')) and t.status in ('approved','pending');
  if found then
   -- Vorhandene Einträge werden wiederverwendet statt dupliziert.
   if trick.status='pending' and trick.created_by is distinct from v_actor and not private.park_is_curator(v_actor) then raise exception 'TRICK_PENDING'; end if;
   result:=jsonb_build_object('trick_id',trick.id,'status',trick.status);
  else
   insert into public.trick_catalog(name,category,status,created_by) values(btrim(payload->>'name'),payload->>'category','pending',v_actor) returning id into target;
   result:=jsonb_build_object('trick_id',target,'status','pending');
  end if;

 elsif operation='trick_review' then
  if not private.park_is_curator(v_actor) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
  if coalesce(payload->>'decision','') not in ('approved','rejected') then raise exception 'PARK_INVALID'; end if;
  update public.trick_catalog set status=payload->>'decision',reviewed_by=v_actor,reviewed_at=now()
   where id=(payload->>'trick_id')::uuid and status='pending' returning id into target;
  if target is null then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
  result:=jsonb_build_object('trick_id',target);

 elsif operation='run_save' then
  target:=(payload->>'run_id')::uuid;
  if target is null or coalesce(jsonb_typeof(payload->'title'),'')<>'string' or length(btrim(payload->>'title')) not between 1 and 120
  or not private.park_validate_point(payload->'start') or not private.park_validate_point(payload->'end')
  or (payload ? 'note' and (jsonb_typeof(payload->'note')<>'string' or length(payload->>'note')>2000))
  or (jsonb_typeof(payload->'target_score')='number' and not private.park_num(payload->'target_score',0,1000))
  or (jsonb_typeof(payload->'actual_score')='number' and not private.park_num(payload->'actual_score',0,1000))
  or coalesce(jsonb_typeof(payload->'target_score'),'null') not in ('number','null')
  or coalesce(jsonb_typeof(payload->'actual_score'),'null') not in ('number','null')
  or coalesce(jsonb_typeof(payload->'steps'),'')<>'array' or jsonb_array_length(payload->'steps') not between 1 and 60
  then raise exception 'PARK_INVALID'; end if;
  select v.id,v.content into version_id,version_content from public.skatepark_versions v where v.id=(payload->>'park_version_id')::uuid;
  if version_id is null then raise exception 'PARK_INVALID'; end if;
  athlete_user:=(payload->>'athlete_user_id')::uuid;
  if not private.park_can_write_athlete(athlete_user) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
  -- Termine nur verknüpfen, wenn der Handelnde sie sieht und sie Training oder Contest sind.
  if payload->>'event_id' is not null and not exists(
   select 1 from public.events e where e.id=(payload->>'event_id')::uuid and e.type::text in ('training','contest')
   and private.calendar_event_visible(e.id,v_actor)) then raise exception 'PARK_INVALID'; end if;
  insert into public.training_athletes(user_id,display_name) select id,display_name from public.profiles where id=athlete_user
   on conflict(user_id) do nothing;
  select id into athlete from public.training_athletes where user_id=athlete_user;
  if athlete is null then raise exception 'PARK_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,7));
  select * into run from public.park_runs where id=target for update;
  if found then
   -- Ein Run bleibt bei seinem Athleten; Bearbeiter müssen den bisherigen Athleten weiterhin betreuen.
   if run.athlete_id<>athlete or not private.park_can_read_run(target) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
   if run.revision is distinct from (payload->>'revision')::integer then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
   if (select park_id from public.skatepark_versions where id=version_id)<>run.park_id then raise exception 'PARK_INVALID'; end if;
   update public.park_runs set park_version_id=version_id,title=btrim(payload->>'title'),event_id=(payload->>'event_id')::uuid,
    start_point=payload->'start',end_point=payload->'end',
    target_score=case when jsonb_typeof(payload->'target_score')='number' then (payload->>'target_score')::numeric end,
    actual_score=case when jsonb_typeof(payload->'actual_score')='number' then (payload->>'actual_score')::numeric end,
    note=coalesce(payload->>'note',''),revision=revision+1,updated_by=v_actor,updated_at=now() where id=target;
   delete from public.park_run_steps where run_id=target;
  else
   if (payload->>'revision')::integer is distinct from 0 then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
   insert into public.park_runs(id,park_id,park_version_id,athlete_id,created_by,updated_by,title,event_id,start_point,end_point,target_score,actual_score,note)
   select target,v.park_id,version_id,athlete,v_actor,v_actor,btrim(payload->>'title'),(payload->>'event_id')::uuid,payload->'start',payload->'end',
    case when jsonb_typeof(payload->'target_score')='number' then (payload->>'target_score')::numeric end,
    case when jsonb_typeof(payload->'actual_score')='number' then (payload->>'actual_score')::numeric end,
    coalesce(payload->>'note','')
   from public.skatepark_versions v where v.id=version_id;
  end if;
  for step in select value from jsonb_array_elements(payload->'steps') loop
   pos:=pos+1;
   if jsonb_typeof(step)<>'object'
   or not exists(select 1 from jsonb_array_elements(version_content->'obstacles') o where o.value->>'id'=step->>'obstacle_id')
   or coalesce(step->>'stance','regular') not in ('regular','fakie','switch','nollie')
   or coalesce(step->>'direction','frontside') not in ('frontside','backside')
   or (step ? 'note' and (jsonb_typeof(step->'note')<>'string' or length(step->>'note')>500))
   or not private.park_can_see_trick((step->>'trick_id')::uuid,v_actor)
   then raise exception 'PARK_INVALID'; end if;
   select t.name into trick_name from public.trick_catalog t where t.id=(step->>'trick_id')::uuid;
   insert into public.park_run_steps(run_id,position,obstacle_id,trick_id,trick_name,stance,direction,note)
   values(target,pos,step->>'obstacle_id',(step->>'trick_id')::uuid,trick_name,step->>'stance',step->>'direction',coalesce(step->>'note',''));
  end loop;
  result:=jsonb_build_object('run_id',target);

 elsif operation='run_delete' then
  target:=(payload->>'run_id')::uuid;
  select * into run from public.park_runs where id=target for update;
  if not found then raise exception 'PARK_INVALID'; end if;
  if not exists(select 1 from public.training_athletes a where a.id=run.athlete_id and private.park_can_write_athlete(a.user_id)) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
  if run.revision is distinct from (payload->>'revision')::integer then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
  delete from public.park_runs where id=target;
  result:=jsonb_build_object('run_id',target);
 else raise exception 'PARK_INVALID'; end if;

 insert into private.park_requests values(v_actor,request_id,operation,payload,result);
 return result;
end; $$;

-- Schreibrechte für Runs werden zusätzlich zur Lesbarkeit geprüft (Eltern lesen nur).
create function private.park_guard_run_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.training_athletes a where a.id=new.athlete_id and private.park_can_write_athlete(a.user_id)) then
  raise exception 'PARK_FORBIDDEN' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger park_runs_write_guard before insert or update on public.park_runs
for each row execute function private.park_guard_run_write();

revoke all on function private.park_is_curator(uuid),private.park_can_read_athlete(uuid),private.park_can_write_athlete(uuid),
 private.park_can_read_run(uuid),private.park_num(jsonb,numeric,numeric),private.park_validate_content(jsonb),
 private.park_validate_point(jsonb),private.park_can_see_trick(uuid,uuid),private.park_command(uuid,text,jsonb),
 private.park_guard_run_write() from public,anon;
grant execute on function private.park_is_curator(uuid),private.park_can_read_athlete(uuid),private.park_can_read_run(uuid),
 private.park_command(uuid,text,jsonb) to authenticated;
revoke all on function private.park_guard_run_write() from authenticated;

create function public.park_command(request_id uuid, operation text, payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.park_command(request_id,operation,payload); $$;
revoke all on function public.park_command(uuid,text,jsonb) from public,anon;
grant execute on function public.park_command(uuid,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Lese-RPCs: Aggregation vor der API-Grenze, damit Listen nicht durch das
-- PostgREST-Zeilenlimit unbemerkt abgeschnitten werden.
-- ---------------------------------------------------------------------------

create function private.park_run_json(r public.park_runs) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object(
  'athlete',(select jsonb_build_object('id',a.id,'user_id',a.user_id,'display_name',a.display_name) from public.training_athletes a where a.id=r.athlete_id),
  'can_edit',exists(select 1 from public.training_athletes a where a.id=r.athlete_id and private.park_can_write_athlete(a.user_id)),
  'park_name',(select p.name from public.skateparks p where p.id=r.park_id),
  'version_number',(select v.version_number from public.skatepark_versions v where v.id=r.park_version_id),
  'event',(select jsonb_build_object('id',e.id,'title',e.title,'type',e.type,'starts_at',e.starts_at) from public.events e
    where e.id=r.event_id and private.calendar_event_visible(e.id,auth.uid())),
  'steps',coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.park_run_steps s where s.run_id=r.id),'[]'::jsonb)
 );
$$;
revoke all on function private.park_run_json(public.park_runs) from public,anon;
grant execute on function private.park_run_json(public.park_runs) to authenticated;

create function public.park_directory() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'is_curator',private.park_is_curator(auth.uid()),
  'parks',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'location',p.location,'latest_version',p.latest_version,'updated_at',p.updated_at,
    'can_edit',p.created_by=auth.uid() or private.park_is_curator(auth.uid()),
    'obstacle_count',(select jsonb_array_length(v.content->'obstacles') from public.skatepark_versions v where v.park_id=p.id and v.version_number=p.latest_version),
    'run_count',(select count(*) from public.park_runs r where r.park_id=p.id)
   ) order by p.updated_at desc) from public.skateparks p),'[]'::jsonb),
  'runs',coalesce((select jsonb_agg(private.park_run_json(r) order by r.updated_at desc) from public.park_runs r),'[]'::jsonb),
  'pending_tricks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.trick_catalog t where t.status='pending'),'[]'::jsonb)
 );
$$;

-- Parkdetail: neueste Version, alle von sichtbaren Runs referenzierten Versionen,
-- Runs, Trick-Katalog und verknüpfbare Termine des Handelnden.
create function public.park_detail(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when p.id is null then null else jsonb_build_object(
  'park',jsonb_build_object('id',p.id,'name',p.name,'location',p.location,'latest_version',p.latest_version,
    'created_by',p.created_by,'can_edit',p.created_by=auth.uid() or private.park_is_curator(auth.uid())),
  'versions',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'content',v.content,'created_at',v.created_at) order by v.version_number desc)
    from public.skatepark_versions v where v.park_id=p.id and (v.version_number=p.latest_version
    or exists(select 1 from public.park_runs r where r.park_version_id=v.id))),'[]'::jsonb),
  'runs',coalesce((select jsonb_agg(private.park_run_json(r) order by r.updated_at desc) from public.park_runs r where r.park_id=p.id),'[]'::jsonb),
  'tricks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'category',t.category,'status',t.status) order by lower(t.name))
    from public.trick_catalog t where t.status in ('approved','pending')),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'type',e.type,'starts_at',e.starts_at) order by e.starts_at)
    from (select e.* from public.events e where e.type::text in ('training','contest')
      and e.starts_at between now()-interval '60 days' and now()+interval '365 days'
      and private.calendar_event_visible(e.id,auth.uid()) order by e.starts_at limit 80) e),'[]'::jsonb)
 ) end
 from (select 1) one left join public.skateparks p on p.id=target;
$$;
revoke all on function public.park_directory(),public.park_detail(uuid) from public,anon;
grant execute on function public.park_directory(),public.park_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Luftbilder: privater Bucket, für aktive Nutzer lesbar (Parks sind öffentlich),
-- Upload ausschließlich in den eigenen Ordner.
-- ---------------------------------------------------------------------------

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('skatepark-aerials','skatepark-aerials',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy skatepark_aerials_read_active on storage.objects for select to authenticated
 using(bucket_id='skatepark-aerials' and private.current_account_is_active());
create policy skatepark_aerials_insert_own on storage.objects for insert to authenticated
 with check(bucket_id='skatepark-aerials' and private.current_account_is_active()
  and owner_id=(select auth.uid())::text
  and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$'));

-- ---------------------------------------------------------------------------
-- Vorbefüllter Trick-Katalog (freigegeben, ohne Ersteller)
-- ---------------------------------------------------------------------------

insert into public.trick_catalog(name,category,status) values
 ('Ollie','flip','approved'),('Nollie','flip','approved'),('Pop Shove-it','flip','approved'),
 ('Frontside Pop Shove-it','flip','approved'),('Kickflip','flip','approved'),('Heelflip','flip','approved'),
 ('Varial Kickflip','flip','approved'),('Varial Heelflip','flip','approved'),('Hardflip','flip','approved'),
 ('Inward Heelflip','flip','approved'),('360 Flip','flip','approved'),('Laser Flip','flip','approved'),
 ('Frontside 180','flip','approved'),('Backside 180','flip','approved'),('Frontside Flip','flip','approved'),
 ('Backside Flip','flip','approved'),('Impossible','flip','approved'),('Bigspin','flip','approved'),
 ('50-50','grind','approved'),('5-0','grind','approved'),('Nosegrind','grind','approved'),
 ('Crooked Grind','grind','approved'),('Smith Grind','grind','approved'),('Feeble Grind','grind','approved'),
 ('Salad Grind','grind','approved'),('Suski Grind','grind','approved'),('Overcrook','grind','approved'),
 ('Willy Grind','grind','approved'),('Boardslide','slide','approved'),('Lipslide','slide','approved'),
 ('Noseslide','slide','approved'),('Tailslide','slide','approved'),('Bluntslide','slide','approved'),
 ('Noseblunt Slide','slide','approved'),('Manual','manual','approved'),('Nose Manual','manual','approved'),
 ('Wallride','other','approved'),('Wallie','other','approved'),('No Comply','other','approved'),
 ('Boneless','other','approved'),('Drop In','transition','approved'),('Rock to Fakie','transition','approved'),
 ('Rock n Roll','transition','approved'),('Axle Stall','transition','approved'),('Disaster','transition','approved'),
 ('Tail Stall','transition','approved'),('Nose Stall','transition','approved'),('Blunt to Fakie','transition','approved'),
 ('Fakie Tail Stall','transition','approved'),('Kickturn','transition','approved'),('Carve','transition','approved'),
 ('Pump','transition','approved'),('Frontside Air','air','approved'),('Backside Air','air','approved'),
 ('Ollie Air','air','approved'),('Indy Grab','grab','approved'),('Melon Grab','grab','approved'),
 ('Stalefish','grab','approved'),('Mute Grab','grab','approved'),('Method','grab','approved'),
 ('Tail Grab','grab','approved'),('Nose Grab','grab','approved'),('Madonna','air','approved'),
 ('Frontside Invert','air','approved'),('Eggplant','air','approved');
