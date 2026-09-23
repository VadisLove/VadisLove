-- Schritt 5: append-only Planstände und Session-Erfassung. Bestehende Freigaben
-- bleiben unverändert. Private Commands sind der einzige Schreibzugang.
alter table public.training_plans alter column organization_id drop not null;
create policy training_personal_read on public.training_plans for select to authenticated
  using (organization_id is null and created_by=(select auth.uid()));

-- Die bisherige Inline-Policy traversiert Plan -> Freigabe -> Plan und löst
-- dadurch bereits bei SELECT eine RLS-Rekursion aus. Der private, kontrollierte
-- Lookup erhält Organisations-/Sozialfreigaben ohne rekursive Policy-Auswertung.
create function private.training_can_read_existing_plan(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and exists (
  select 1 from public.training_plans p where p.id=target and (
   private.is_organization_member(p.organization_id)
   or private.can_view_shared_training_plan(p.id)
   or exists(select 1 from public.training_plan_shares sh
     where sh.training_plan_id=p.id and private.is_organization_member(sh.target_organization_id))
  )
 );
$$;
revoke all on function private.training_can_read_existing_plan(uuid) from public,anon;
grant execute on function private.training_can_read_existing_plan(uuid) to authenticated;
drop policy plans_read_owner_or_shared on public.training_plans;
create policy plans_read_owner_or_shared on public.training_plans for select to authenticated
using(private.training_can_read_existing_plan(id));

create table public.training_athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now()
);
-- Umbenennungen und die vorhandene Profilanonymisierung dürfen keine veralteten
-- Klarnamen in der neuen Athletenidentität zurücklassen.
create function private.training_sync_athlete_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.training_athletes set display_name=new.display_name where user_id=new.id;
 return new;
end; $$;
revoke all on function private.training_sync_athlete_name() from public,anon,authenticated;
create trigger training_athlete_profile_name after update of display_name on public.profiles
for each row when (old.display_name is distinct from new.display_name)
execute function private.training_sync_athlete_name();

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  mode text not null check(mode in ('self','individual','group')),
  source_key text not null,
  plan_version_id uuid references public.training_plan_versions(id) on delete restrict,
  plan_snapshot jsonb not null,
  revision integer not null default 1,
  status text not null default 'running' check(status in ('running','completed')),
  note text not null default '' check(length(note)<=4000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status='completed')=(completed_at is not null))
);
create unique index training_one_running_source on public.training_sessions(created_by,source_key) where status='running';
create index training_sessions_version on public.training_sessions(plan_version_id);
create table public.training_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  athlete_id uuid not null references public.training_athletes(id) on delete restrict,
  present boolean not null default true,
  unique(session_id,athlete_id)
);
create index training_participant_athlete on public.training_session_participants(athlete_id);
create table public.training_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  source_trick_id text not null,
  content jsonb not null,
  sort_order integer not null,
  note text not null default '' check(length(note)<=4000),
  elapsed_ms bigint not null default 0 check(elapsed_ms>=0),
  timer_started_at timestamptz,
  unique(session_id,source_trick_id)
);
create table public.training_session_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete restrict,
  participant_id uuid not null references public.training_session_participants(id) on delete restrict,
  exercise_id uuid not null references public.training_session_exercises(id) on delete restrict,
  landed boolean not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  undone_by uuid references public.profiles(id) on delete restrict,
  undone_at timestamptz
);
create index training_attempt_session on public.training_session_attempts(session_id);
create index training_attempt_participant on public.training_session_attempts(participant_id,exercise_id,recorded_at desc);
create index training_attempt_exercise on public.training_session_attempts(exercise_id);
create index training_attempt_actor on public.training_session_attempts(recorded_by);
create index training_attempt_undo_actor on public.training_session_attempts(undone_by);
create table private.training_requests (
  actor uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(actor,request_id)
);
revoke all on private.training_requests from public,anon,authenticated;

-- Zugriff folgt dem verantwortlichen Erfasser und weiterhin aktiven Beziehungen.
-- Teilnehmer erhalten hier keine Gruppenfremddaten; der Recap folgt in Schritt 6.
create function private.training_can_session(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
select auth.uid() is not null and private.current_account_is_active() and exists (
 select 1 from public.training_sessions s where s.id=target and s.created_by=auth.uid()
 and (s.mode='self' or not exists (
  select 1 from public.training_session_participants p join public.training_athletes a on a.id=p.athlete_id
  where p.session_id=s.id and (a.user_id is null or not private.has_active_trainer_athlete_relationship(auth.uid(),a.user_id))
 ))
);
$$;
revoke all on function private.training_can_session(uuid) from public,anon;
grant execute on function private.training_can_session(uuid) to authenticated;

alter table public.training_athletes enable row level security;
create policy training_athlete_read on public.training_athletes for select to authenticated
using ((select private.current_account_is_active()) and (user_id=(select auth.uid()) or private.has_active_trainer_athlete_relationship((select auth.uid()),user_id)));
alter table public.training_sessions enable row level security;
create policy training_session_read on public.training_sessions for select to authenticated using (private.training_can_session(id));
alter table public.training_session_participants enable row level security;
create policy training_participant_read on public.training_session_participants for select to authenticated using(private.training_can_session(session_id));
alter table public.training_session_exercises enable row level security;
create policy training_exercise_read on public.training_session_exercises for select to authenticated using(private.training_can_session(session_id));
alter table public.training_session_attempts enable row level security;
create policy training_attempt_read on public.training_session_attempts for select to authenticated using(private.training_can_session(session_id));
revoke all on public.training_athletes,public.training_sessions,public.training_session_participants,public.training_session_exercises,public.training_session_attempts from public,anon,authenticated;
grant select on public.training_athletes,public.training_sessions,public.training_session_participants,public.training_session_exercises,public.training_session_attempts to authenticated;

-- Historische Inhalte dürfen auch über vorhandene Versions-Policies nicht mutieren.
create function private.training_protect_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.training_sessions where plan_version_id=old.id)
 or exists(select 1 from public.training_plans where id=old.training_plan_id and organization_id is null) then
  raise exception 'TRAINING_IMMUTABLE';
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end; $$;
create trigger training_version_immutable before update or delete on public.training_plan_versions
for each row execute function private.training_protect_version();

-- JSON wird in der DB geprüft, da auch direkte RPC-Anfragen als Eingaben gelten.
create function private.training_validate_plan(content jsonb) returns void
language plpgsql set search_path='' as $$
declare e jsonb;
begin
 if content is null or jsonb_typeof(content)<>'object' or length(content::text)>240000
 or coalesce(jsonb_typeof(content->'title'),'')<>'string'
 or (content ? 'description' and (jsonb_typeof(content->'description')<>'string' or length(content->>'description')>4000))
 or coalesce(length(btrim(content->>'title')),0) not between 1 and 160
 or coalesce(jsonb_typeof(content->'tricks'),'')<>'array' then raise exception 'TRAINING_INVALID'; end if;
 if jsonb_array_length(content->'tricks') not between 1 and 100 then raise exception 'TRAINING_INVALID'; end if;
 for e in select value from jsonb_array_elements(content->'tricks') loop
  if jsonb_typeof(e)<>'object' or coalesce(jsonb_typeof(e->'id'),'')<>'string'
  or coalesce(jsonb_typeof(e->'name'),'')<>'string'
  or (e ? 'targetValue' and (jsonb_typeof(e->'targetValue')<>'string' or length(e->>'targetValue')>160))
  or (e ? 'trainerNote' and (jsonb_typeof(e->'trainerNote')<>'string' or length(e->>'trainerNote')>4000))
  or coalesce(length(e->>'id'),0) not between 1 and 160 or coalesce(length(btrim(e->>'name')),0) not between 1 and 160 then raise exception 'TRAINING_INVALID'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(content->'tricks'))<>jsonb_array_length(content->'tricks') then raise exception 'TRAINING_INVALID'; end if;
end; $$;
revoke all on function private.training_validate_plan(jsonb),private.training_protect_version() from public,anon,authenticated;

-- Ein Command ist atomar. Request-ID schützt Wiederholungen; Zeilensperre und
-- erwartete Revision verhindern unbemerkte Überschreibungen zwischen Geräten.
create function private.training_command(request_id uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); previous private.training_requests%rowtype;
 s public.training_sessions%rowtype; plan public.training_plans%rowtype;
 share public.training_plan_snapshot_shares%rowtype; ex public.training_session_exercises%rowtype;
 content jsonb; result jsonb; target uuid; version_id uuid; version_no integer;
 person uuid; athlete uuid; selected_users uuid[]; session_mode text;
 source text; item jsonb; pos integer:=0; attempt uuid;
begin
 if v_actor is null or not private.current_account_is_active() then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>250000 then raise exception 'TRAINING_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||request_id::text,0));
 select * into previous from private.training_requests r where r.actor=v_actor and r.request_id=training_command.request_id;
 if found then
  if previous.operation<>operation or previous.payload<>payload then raise exception 'TRAINING_REQUEST_REUSED'; end if;
  return previous.result;
 end if;
 if operation='plan_save' then
  content:=payload->'content'; perform private.training_validate_plan(content);
  target:=(payload->>'id')::uuid;
  if target is null then raise exception 'TRAINING_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,1));
  select * into plan from public.training_plans where id=target for update;
  if found then
   if plan.created_by<>v_actor or plan.organization_id is not null then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   select coalesce(max(version_number),0) into version_no from public.training_plan_versions where training_plan_id=target;
   if version_no is distinct from (payload->>'revision')::integer then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
   update public.training_plans set title=content->>'title',category=coalesce(content->>'category',''),updated_at=now() where id=target;
  else
   if (payload->>'revision')::integer is distinct from 0 then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
   version_no:=0;
   insert into public.training_plans(id,organization_id,created_by,title,category) values(target,null,v_actor,content->>'title',coalesce(content->>'category',''));
  end if;
  content:=content||jsonb_build_object('id',target,'version',(version_no+1)::text);
  insert into public.training_plan_versions(training_plan_id,version_number,content,created_by) values(target,version_no+1,content,v_actor) returning id into version_id;
  result:=jsonb_build_object('plan_id',target,'version_id',version_id);
 elsif operation='session_start' then
  source:=payload->>'source'; session_mode:=payload->>'mode';
  if session_mode is null or session_mode not in ('self','individual','group') then raise exception 'TRAINING_INVALID'; end if;
  if source='plan' then
   select * into plan from public.training_plans where id=(payload->>'plan_id')::uuid and created_by=v_actor;
   if not found then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   select v.id,v.content into version_id,content from public.training_plan_versions v where v.training_plan_id=plan.id and v.id=(payload->>'version_id')::uuid;
   source:='plan:'||plan.id::text;
  elsif source='share' then
   select * into share from public.training_plan_snapshot_shares where id=(payload->>'share_id')::uuid and (shared_by=v_actor or recipient_user_id=v_actor);
   if not found then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   content:=share.plan_snapshot; source:='share:'||share.id::text;
  else raise exception 'TRAINING_INVALID'; end if;
  perform private.training_validate_plan(content);
  if session_mode='self' then
   if not exists(select 1 from public.profiles where id=v_actor and account_type::text='athlete') then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   selected_users:=array[v_actor];
  else
   if coalesce(jsonb_typeof(payload->'users'),'')<>'array' then raise exception 'TRAINING_INVALID'; end if;
   select array_agg(distinct value::uuid) into selected_users from jsonb_array_elements_text(payload->'users');
   if coalesce(cardinality(selected_users),0) not between 1 and 50 or (session_mode='individual' and cardinality(selected_users)<>1) then raise exception 'TRAINING_INVALID'; end if;
   foreach person in array selected_users loop
    if person=v_actor or not private.has_active_trainer_athlete_relationship(v_actor,person) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   end loop;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||source,2));
  select id into target from public.training_sessions where created_by=v_actor and source_key=source and status='running';
  if found then
   if not private.training_can_session(target) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   result:=jsonb_build_object('session_id',target);
  else
   insert into public.training_sessions(created_by,mode,source_key,plan_version_id,plan_snapshot) values(v_actor,session_mode,source,version_id,content) returning id into target;
   foreach person in array selected_users loop
    insert into public.training_athletes(user_id,display_name) select id,display_name from public.profiles where id=person
    on conflict(user_id) do nothing;
    select id into athlete from public.training_athletes where user_id=person;
    insert into public.training_session_participants(session_id,athlete_id) values(target,athlete);
   end loop;
   for item in select value from jsonb_array_elements(content->'tricks') loop
    insert into public.training_session_exercises(session_id,source_trick_id,content,sort_order) values(target,item->>'id',item,pos); pos:=pos+1;
   end loop;
   result:=jsonb_build_object('session_id',target);
  end if;
 else
  target:=(payload->>'session_id')::uuid;
  select * into s from public.training_sessions where id=target for update;
  if not found or not private.training_can_session(target) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  if s.status<>'running' then raise exception 'TRAINING_COMPLETED'; end if;
  if s.revision is distinct from (payload->>'revision')::integer then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
  if operation in ('attempt','undo','exercise_note','timer') then
   select * into ex from public.training_session_exercises where id=(payload->>'exercise_id')::uuid and session_id=target;
   if not found then raise exception 'TRAINING_INVALID'; end if;
  end if;
  if operation in ('attempt','undo','attendance') then
   if not exists(select 1 from public.training_session_participants where id=(payload->>'participant_id')::uuid and session_id=target) then raise exception 'TRAINING_INVALID'; end if;
  end if;
  if operation='attempt' then
   if jsonb_typeof(payload->'landed') is distinct from 'boolean' or not exists(select 1 from public.training_session_participants where id=(payload->>'participant_id')::uuid and present) then raise exception 'TRAINING_INVALID'; end if;
   insert into public.training_session_attempts(session_id,participant_id,exercise_id,landed,recorded_by) values(target,(payload->>'participant_id')::uuid,ex.id,(payload->>'landed')::boolean,v_actor);
  elsif operation='undo' then
   select id into attempt from public.training_session_attempts where session_id=target and participant_id=(payload->>'participant_id')::uuid and exercise_id=ex.id and undone_at is null order by recorded_at desc,id desc limit 1;
   if attempt is null then raise exception 'TRAINING_INVALID'; end if;
   update public.training_session_attempts set undone_at=now(),undone_by=v_actor where id=attempt;
  elsif operation='attendance' then
   if jsonb_typeof(payload->'present') is distinct from 'boolean' then raise exception 'TRAINING_INVALID'; end if;
   update public.training_session_participants set present=(payload->>'present')::boolean where id=(payload->>'participant_id')::uuid;
  elsif operation in ('session_note','exercise_note') then
   if jsonb_typeof(payload->'note') is distinct from 'string' or length(payload->>'note')>4000 then raise exception 'TRAINING_INVALID'; end if;
   if operation='session_note' then update public.training_sessions set note=payload->>'note' where id=target;
   else update public.training_session_exercises set note=payload->>'note' where id=ex.id; end if;
  elsif operation='timer' then
   if payload->>'action'='start' and ex.timer_started_at is null then
    update public.training_session_exercises set timer_started_at=now() where id=ex.id;
   elsif payload->>'action'='pause' and ex.timer_started_at is not null then
    update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where id=ex.id;
   elsif payload->>'action' not in ('start','pause') or payload->>'action' is null then raise exception 'TRAINING_INVALID'; end if;
  elsif operation='complete' then
   update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where session_id=target and timer_started_at is not null;
   update public.training_sessions set status='completed',completed_at=now() where id=target;
  else raise exception 'TRAINING_INVALID'; end if;
  update public.training_sessions set revision=revision+1 where id=target;
  result:=jsonb_build_object('session_id',target);
 end if;
 insert into private.training_requests values(v_actor,request_id,operation,payload,result);
 return result;
end; $$;
revoke all on function private.training_command(uuid,text,jsonb) from public,anon;
grant execute on function private.training_command(uuid,text,jsonb) to authenticated;
create function public.training_command(request_id uuid,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_command(request_id,operation,payload); $$;
revoke all on function public.training_command(uuid,text,jsonb) from public,anon;
grant execute on function public.training_command(uuid,text,jsonb) to authenticated;

-- Aggregation vor der API-Grenze: auch >1000 Versuche dürfen nicht durch das
-- PostgREST-Zeilenlimit abgeschnitten und als falsche Quote angezeigt werden.
create function public.training_workspace_data() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'versions',
  coalesce((select jsonb_agg(to_jsonb(v) order by v.version_number desc) from public.training_plan_versions v where v.training_plan_id=p.id),'[]'::jsonb)) order by p.updated_at desc)
  from public.training_plans p where p.created_by=auth.uid() and p.organization_id is null),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
  'participants',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('athlete',to_jsonb(a)) order by p.id) from public.training_session_participants p join public.training_athletes a on a.id=p.athlete_id where p.session_id=s.id),'[]'::jsonb),
  'exercises',coalesce((select jsonb_agg(to_jsonb(e) order by e.sort_order) from public.training_session_exercises e where e.session_id=s.id),'[]'::jsonb),
  'totals',coalesce((select jsonb_agg(to_jsonb(t)) from (
    select participant_id,exercise_id,count(*)::integer attempts,count(*) filter(where landed)::integer landed
    from public.training_session_attempts where session_id=s.id and undone_at is null group by participant_id,exercise_id
  ) t),'[]'::jsonb)
 ) order by s.started_at desc) from public.training_sessions s),'[]'::jsonb)
);
$$;
revoke all on function public.training_workspace_data() from public,anon;
grant execute on function public.training_workspace_data() to authenticated;
