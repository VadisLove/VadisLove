-- Live-Training neu: Pausen, eigener Notizkanal, Lines (Serien aus Tricks) und
-- die Brücke „Bereit für den Plan“. Ausschließlich additiv: neue Spalten mit
-- Standardwerten, Funktionen werden mit identischer Signatur ersetzt.

-- Pausen halten das Training offen (status bleibt 'running'); die Summe der
-- Pausen wird von der aktiven Zeit abgezogen.
alter table public.training_sessions
 add column paused_at timestamptz,
 add column paused_ms bigint not null default 0 check(paused_ms>=0),
 add column pause_count integer not null default 0 check(pause_count>=0),
 add column resume_exercise_id uuid references public.training_session_exercises(id) on delete restrict,
 add constraint training_sessions_pause_running check(paused_at is null or status='running');
create index training_sessions_resume_exercise on public.training_sessions(resume_exercise_id);

-- Line-Versuch: landed = komplette Line, sonst Index des Tricks, bei dem sie
-- brach (null = ohne Angabe). Einzeltricks haben nie eine Bruchstelle.
alter table public.training_session_attempts
 add column broke_at smallint check(broke_at is null or (broke_at between 0 and 4 and not landed));

-- Herkunft einer Bestätigung: die bestehende Spalte confirmed_source
-- ('review','recap', siehe 20260929100000) wird um 'live' erweitert, damit der
-- Plan „Bestätigt aus Live-Training“ anzeigen kann. Die Session wird verknüpft.
alter table public.training_trick_progress add column if not exists confirmed_source text;
alter table public.training_trick_progress drop constraint if exists training_trick_progress_confirmed_source_check;
alter table public.training_trick_progress
 add constraint training_trick_progress_confirmed_source_check check (confirmed_source is null or confirmed_source in ('review','recap','live')),
 add column confirmed_session_id uuid references public.training_sessions(id) on delete set null;
create index training_trick_progress_session on public.training_trick_progress(confirmed_session_id) where confirmed_session_id is not null;

-- Ein Plan-Eintrag ist ein Trick oder eine Line mit 2–5 geordneten Tricks.
create or replace function private.training_validate_plan(content jsonb) returns void
language plpgsql set search_path='' as $$
declare e jsonb; n integer;
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
  if e ? 'type' and (jsonb_typeof(e->'type')<>'string' or e->>'type' not in ('trick','line')) then raise exception 'TRAINING_INVALID'; end if;
  if e->>'type'='line' then
   if coalesce(jsonb_typeof(e->'trickIds'),'')<>'array' or coalesce(jsonb_typeof(e->'trickNames'),'')<>'array' then raise exception 'TRAINING_INVALID'; end if;
   n:=jsonb_array_length(e->'trickIds');
   if n not between 2 and 5 or jsonb_array_length(e->'trickNames')<>n
   or exists(select 1 from jsonb_array_elements(e->'trickIds') x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}') not between 1 and 160)
   or exists(select 1 from jsonb_array_elements(e->'trickNames') x where jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}')) not between 1 and 160) then raise exception 'TRAINING_INVALID'; end if;
  elsif e ? 'trickIds' or e ? 'trickNames' then raise exception 'TRAINING_INVALID';
  end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(content->'tricks'))<>jsonb_array_length(content->'tricks') then raise exception 'TRAINING_INVALID'; end if;
end; $$;
revoke all on function private.training_validate_plan(jsonb) from public,anon,authenticated;

-- Übernimmt alle bisherigen Operationen unverändert und ergänzt:
-- session_pause/session_resume, participant_add, progress (Bereit → Plan),
-- Bruchstellen bei Line-Versuchen und exklusive Timer.
-- Notizen laufen über einen eigenen Kanal: ohne Revisionsprüfung und ohne
-- Revisionserhöhung, damit sie Versuchseingaben nie in einen Konflikt treiben.
create or replace function private.training_command(request_id uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); previous private.training_requests%rowtype;
 s public.training_sessions%rowtype; plan public.training_plans%rowtype;
 share public.training_plan_snapshot_shares%rowtype; ex public.training_session_exercises%rowtype;
 part public.training_session_participants%rowtype;
 content jsonb; result jsonb; target uuid; version_id uuid; version_no integer;
 person uuid; athlete uuid; selected_users uuid[]; session_mode text;
 source text; item jsonb; pos integer:=0; attempt uuid; running uuid;
 line_len integer; attempts_n integer; landed_n integer; progress_row public.training_trick_progress%rowtype;
 wanted public.trick_progress_status; athlete_user uuid;
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
  -- Die Plan-Brücke bleibt auch im Abschluss-Screen nutzbar; alles andere ist danach gesperrt.
  if s.status<>'running' and operation<>'progress' then raise exception 'TRAINING_COMPLETED'; end if;
  if operation not in ('session_note','exercise_note','progress') and s.revision is distinct from (payload->>'revision')::integer then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
  if s.paused_at is not null and operation in ('attempt','undo','timer','participant_add','session_pause','progress') then raise exception 'TRAINING_PAUSED'; end if;
  if s.paused_at is null and operation='session_resume' then raise exception 'TRAINING_INVALID'; end if;
  if operation in ('attempt','undo','exercise_note','timer','progress') then
   select * into ex from public.training_session_exercises where id=(payload->>'exercise_id')::uuid and session_id=target;
   if not found then raise exception 'TRAINING_INVALID'; end if;
  end if;
  if operation in ('attempt','undo','attendance','progress') then
   select * into part from public.training_session_participants where id=(payload->>'participant_id')::uuid and session_id=target;
   if not found then raise exception 'TRAINING_INVALID'; end if;
  end if;
  if operation='attempt' then
   if jsonb_typeof(payload->'landed') is distinct from 'boolean' or not part.present then raise exception 'TRAINING_INVALID'; end if;
   line_len:=case when ex.content->>'type'='line' then jsonb_array_length(ex.content->'trickIds') else 0 end;
   if payload ? 'broke_at' and jsonb_typeof(payload->'broke_at')<>'null' then
    if line_len=0 or (payload->>'landed')::boolean or jsonb_typeof(payload->'broke_at')<>'number'
    or (payload->>'broke_at')::numeric<>floor((payload->>'broke_at')::numeric)
    or (payload->>'broke_at')::integer not between 0 and line_len-1 then raise exception 'TRAINING_INVALID'; end if;
   end if;
   insert into public.training_session_attempts(session_id,participant_id,exercise_id,landed,broke_at,recorded_by)
   values(target,part.id,ex.id,(payload->>'landed')::boolean,case when jsonb_typeof(payload->'broke_at')='number' then (payload->>'broke_at')::smallint end,v_actor);
  elsif operation='undo' then
   select id into attempt from public.training_session_attempts where session_id=target and participant_id=part.id and exercise_id=ex.id and undone_at is null order by recorded_at desc,id desc limit 1;
   if attempt is null then raise exception 'TRAINING_INVALID'; end if;
   update public.training_session_attempts set undone_at=now(),undone_by=v_actor where id=attempt;
  elsif operation='attendance' then
   if jsonb_typeof(payload->'present') is distinct from 'boolean' then raise exception 'TRAINING_INVALID'; end if;
   update public.training_session_participants set present=(payload->>'present')::boolean where id=part.id;
  elsif operation='participant_add' then
   -- Später Gekommene: nur in Gruppen, nur bestätigte Trainer-Athlet-Beziehungen.
   person:=(payload->>'user_id')::uuid;
   if s.mode<>'group' or person is null then raise exception 'TRAINING_INVALID'; end if;
   if person=v_actor or not private.has_active_trainer_athlete_relationship(v_actor,person) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
   insert into public.training_athletes(user_id,display_name) select id,display_name from public.profiles where id=person
   on conflict(user_id) do nothing;
   select id into athlete from public.training_athletes where user_id=person;
   if (select count(*) from public.training_session_participants where session_id=target)>=50
   and not exists(select 1 from public.training_session_participants where session_id=target and athlete_id=athlete) then raise exception 'TRAINING_INVALID'; end if;
   insert into public.training_session_participants(session_id,athlete_id) values(target,athlete)
   on conflict(session_id,athlete_id) do update set present=true;
  elsif operation in ('session_note','exercise_note') then
   if jsonb_typeof(payload->'note') is distinct from 'string' or length(payload->>'note')>4000 then raise exception 'TRAINING_INVALID'; end if;
   if operation='session_note' then update public.training_sessions set note=payload->>'note' where id=target;
   else update public.training_session_exercises set note=payload->>'note' where id=ex.id; end if;
  elsif operation='timer' then
   if payload->>'action'='start' and ex.timer_started_at is null then
    -- Es läuft immer höchstens ein Übungstimer.
    update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where session_id=target and timer_started_at is not null;
    update public.training_session_exercises set timer_started_at=now() where id=ex.id;
   elsif payload->>'action'='pause' and ex.timer_started_at is not null then
    update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where id=ex.id;
   elsif payload->>'action' not in ('start','pause') or payload->>'action' is null then raise exception 'TRAINING_INVALID'; end if;
  elsif operation='session_pause' then
   select id into running from public.training_session_exercises where session_id=target and timer_started_at is not null order by sort_order limit 1;
   update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where session_id=target and timer_started_at is not null;
   update public.training_sessions set paused_at=now(),pause_count=pause_count+1,resume_exercise_id=running where id=target;
  elsif operation='session_resume' then
   update public.training_sessions set paused_ms=paused_ms+greatest(0,floor(extract(epoch from (now()-paused_at))*1000)::bigint),paused_at=null,resume_exercise_id=null where id=target;
   if s.resume_exercise_id is not null then
    update public.training_session_exercises set timer_started_at=now() where id=s.resume_exercise_id and timer_started_at is null;
   end if;
  elsif operation='progress' then
   -- Brücke zum Plan: dieselbe Bereit-Regel wie im Session-Rückblick.
   select a.user_id into athlete_user from public.training_athletes a where a.id=part.athlete_id;
   select count(*),count(*) filter(where landed) into attempts_n,landed_n from public.training_session_attempts
   where session_id=target and participant_id=part.id and exercise_id=ex.id and undone_at is null;
   if athlete_user is null or attempts_n<5 or landed_n*100<attempts_n*80 then raise exception 'TRAINING_NOT_READY'; end if;
   select * into progress_row from public.training_trick_progress
   where snapshot_share_id=(payload->>'share_id')::uuid and trick_id=ex.source_trick_id and athlete_id=athlete_user for update;
   if not found then raise exception 'TRAINING_INVALID'; end if;
   wanted:=(payload->>'status')::public.trick_progress_status;
   if athlete_user=v_actor and s.mode='self' and (
    (progress_row.status='not_started' and wanted='in_progress')
    or (progress_row.status='in_progress' and wanted='awaiting_confirmation')) then
    update public.training_trick_progress set status=wanted,confirmed_by=null,confirmed_at=null,updated_at=now() where id=progress_row.id;
   elsif athlete_user<>v_actor and private.has_active_trainer_athlete_relationship(v_actor,athlete_user)
    and progress_row.status<>'confirmed' and wanted='confirmed' then
    update public.training_trick_progress set status='confirmed',confirmed_by=v_actor,confirmed_at=now(),
     confirmed_source='live',confirmed_session_id=target,updated_at=now() where id=progress_row.id;
   else raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  elsif operation='complete' then
   update public.training_session_exercises set elapsed_ms=elapsed_ms+greatest(0,floor(extract(epoch from (now()-timer_started_at))*1000)::bigint),timer_started_at=null where session_id=target and timer_started_at is not null;
   update public.training_sessions set status='completed',completed_at=now(),
    paused_ms=paused_ms+case when paused_at is null then 0 else greatest(0,floor(extract(epoch from (now()-paused_at))*1000)::bigint) end,
    paused_at=null,resume_exercise_id=null where id=target;
  else raise exception 'TRAINING_INVALID'; end if;
  -- Notizen und Planstatus verändern keine Zähl- oder Zeitdaten der Session.
  if operation not in ('session_note','exercise_note','progress') then
   update public.training_sessions set revision=revision+1 where id=target;
  end if;
  result:=jsonb_build_object('session_id',target);
 end if;
 insert into private.training_requests values(v_actor,request_id,operation,payload,result);
 return result;
end; $$;
revoke all on function private.training_command(uuid,text,jsonb) from public,anon;
grant execute on function private.training_command(uuid,text,jsonb) to authenticated;

-- Ergänzt je Session die letzte gültige Eingabe pro Übung (für „Rückgängig“)
-- und die Bruchstellen von Line-Versuchen. Alles bleibt serverseitig aggregiert.
create or replace function public.training_workspace_data() returns jsonb
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
  ) t),'[]'::jsonb),
  'breaks',coalesce((select jsonb_agg(to_jsonb(b)) from (
    select participant_id,exercise_id,broke_at,count(*)::integer attempts
    from public.training_session_attempts where session_id=s.id and undone_at is null and not landed group by participant_id,exercise_id,broke_at
  ) b),'[]'::jsonb),
  'recent',coalesce((select jsonb_agg(to_jsonb(r)) from (
    select distinct on (exercise_id) exercise_id,participant_id,landed,broke_at,recorded_at
    from public.training_session_attempts where session_id=s.id and undone_at is null order by exercise_id,recorded_at desc,id desc
  ) r),'[]'::jsonb)
 ) order by s.started_at desc) from public.training_sessions s),'[]'::jsonb)
);
$$;
revoke all on function public.training_workspace_data() from public,anon;
grant execute on function public.training_workspace_data() to authenticated;
