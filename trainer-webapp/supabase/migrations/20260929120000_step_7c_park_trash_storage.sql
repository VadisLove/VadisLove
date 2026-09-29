-- Schritt 7c: Parks löschen (Papierkorb, 30 Tage), Speicherbereinigung für
-- Luftbilder, Höhenraster und Modelle. Additiv: park_command bleibt unverändert,
-- die neuen Operationen laufen über private.park_trash_command.
--
-- Regeln (vom Nutzer am 29.09.2026 bestätigt):
--   * Löschen und Wiederherstellen dürfen nur die Person, die den Park angelegt
--     hat, und Fachreferenten (Rolle specialist). Trainer und Vorstand nicht.
--   * Hat ein Park Runs anderer Athleten, ist Löschen gesperrt. Eigene Runs der
--     löschenden Person werden beim endgültigen Löschen mitgelöscht.
--   * Gelöschte Parks liegen 30 Tage im Papierkorb; danach löscht der tägliche
--     Worker Park, Versionen und eigene Runs endgültig.
--   * Dateien, die in keiner Parkversion (auch im Papierkorb) vorkommen und älter
--     als 24 Stunden sind, entfernt derselbe Worker über die Storage-API.

alter table public.skateparks
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id) on delete set null;
create index skateparks_deleted on public.skateparks(deleted_at) where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Rechte und Hilfen
-- ---------------------------------------------------------------------------

create function private.park_can_delete(actor uuid, creator uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select actor is not null and (
  creator=actor
  or exists(select 1 from public.organization_memberships m where m.user_id=actor and m.role::text='specialist')
 );
$$;

-- Runs, deren Athlet nicht die angegebene Person ist (unabhängig von der Lesbarkeit).
create function private.park_foreign_run_count(target uuid, actor uuid) returns integer
language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.park_runs r join public.training_athletes a on a.id=r.athlete_id
 where r.park_id=target and a.user_id is distinct from actor;
$$;

-- Gelöschte Parks sind für normale Leser unsichtbar.
drop policy skateparks_read_active on public.skateparks;
create policy skateparks_read_active on public.skateparks for select to authenticated
 using((select private.current_account_is_active()) and deleted_at is null);

-- Im Papierkorb darf weder eine neue Parkversion noch ein Run entstehen.
create function private.park_guard_not_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.skateparks p where p.id=new.park_id and p.deleted_at is not null) then
  raise exception 'PARK_DELETED' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger skatepark_versions_not_deleted before insert on public.skatepark_versions
for each row execute function private.park_guard_not_deleted();
create trigger park_runs_not_deleted before insert or update on public.park_runs
for each row execute function private.park_guard_not_deleted();

-- ---------------------------------------------------------------------------
-- Löschen und Wiederherstellen (idempotent über private.park_requests)
-- ---------------------------------------------------------------------------

create function private.park_trash_command(request_id uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); previous private.park_requests%rowtype;
 park public.skateparks%rowtype; target uuid; result jsonb;
begin
 if v_actor is null or not private.current_account_is_active() then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'PARK_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||request_id::text,7));
 select * into previous from private.park_requests r where r.actor=v_actor and r.request_id=park_trash_command.request_id;
 if found then
  if previous.operation<>operation or previous.payload<>payload then raise exception 'PARK_REQUEST_REUSED'; end if;
  return previous.result;
 end if;

 target:=(payload->>'park_id')::uuid;
 select * into park from public.skateparks p where p.id=target for update;
 if not found then raise exception 'PARK_INVALID'; end if;
 if not private.park_can_delete(v_actor,park.created_by) then raise exception 'PARK_FORBIDDEN' using errcode='42501'; end if;

 if operation='park_delete' then
  if park.deleted_at is not null then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
  if park.latest_version is distinct from (payload->>'revision')::integer then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
  if private.park_foreign_run_count(target,v_actor)>0 then raise exception 'PARK_HAS_RUNS'; end if;
  update public.skateparks set deleted_at=now(),deleted_by=v_actor where id=target;
 elsif operation='park_restore' then
  if park.deleted_at is null then raise exception 'PARK_CONFLICT' using errcode='40001'; end if;
  update public.skateparks set deleted_at=null,deleted_by=null,updated_at=now() where id=target;
 else raise exception 'PARK_INVALID'; end if;

 result:=jsonb_build_object('park_id',target);
 insert into private.park_requests values(v_actor,request_id,operation,payload,result);
 return result;
end; $$;

-- Einziger Schreibzugang bleibt public.park_command; neue Operationen werden verteilt.
create or replace function public.park_command(request_id uuid, operation text, payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select case when operation in ('park_delete','park_restore')
  then private.park_trash_command(request_id,operation,payload)
  else private.park_command(request_id,operation,payload) end;
$$;

revoke all on function private.park_can_delete(uuid,uuid),private.park_foreign_run_count(uuid,uuid),
 private.park_guard_not_deleted(),private.park_trash_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.park_can_delete(uuid,uuid),private.park_foreign_run_count(uuid,uuid),
 private.park_trash_command(uuid,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Lese-RPCs: Löschrecht, gesperrte Runs und Papierkorb
-- ---------------------------------------------------------------------------

-- Papierkorb des Handelnden: nur Parks, die er löschen bzw. wiederherstellen darf.
create function private.park_trash_json() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'name',p.name,'location',p.location,'deleted_at',p.deleted_at,
   'purge_at',p.deleted_at+interval '30 days',
   'deleted_by_name',(select pr.display_name from public.profiles pr where pr.id=p.deleted_by)
  ) order by p.deleted_at desc),'[]'::jsonb)
 from public.skateparks p
 where p.deleted_at is not null and private.current_account_is_active() and private.park_can_delete(auth.uid(),p.created_by);
$$;
revoke all on function private.park_trash_json() from public,anon;
grant execute on function private.park_trash_json() to authenticated;

create or replace function public.park_directory() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'is_curator',private.park_is_curator(auth.uid()),
  'parks',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'location',p.location,'latest_version',p.latest_version,'updated_at',p.updated_at,
    'can_edit',p.created_by=auth.uid() or private.park_is_curator(auth.uid()),
    'can_delete',private.park_can_delete(auth.uid(),p.created_by),
    'obstacle_count',(select jsonb_array_length(v.content->'obstacles') from public.skatepark_versions v where v.park_id=p.id and v.version_number=p.latest_version),
    'run_count',(select count(*) from public.park_runs r where r.park_id=p.id)
   ) order by p.updated_at desc) from public.skateparks p),'[]'::jsonb),
  -- Runs in gelöschten Parks werden ausgeblendet (der Park ist per RLS unsichtbar).
  'runs',coalesce((select jsonb_agg(private.park_run_json(r) order by r.updated_at desc) from public.park_runs r
    where exists(select 1 from public.skateparks p where p.id=r.park_id)),'[]'::jsonb),
  'pending_tricks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.trick_catalog t where t.status='pending'),'[]'::jsonb),
  'trash',private.park_trash_json()
 );
$$;

create or replace function public.park_detail(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when p.id is null then null else jsonb_build_object(
  'park',jsonb_build_object('id',p.id,'name',p.name,'location',p.location,'latest_version',p.latest_version,
    'created_by',p.created_by,'can_edit',p.created_by=auth.uid() or private.park_is_curator(auth.uid()),
    'can_delete',private.park_can_delete(auth.uid(),p.created_by),
    'foreign_run_count',private.park_foreign_run_count(p.id,auth.uid())),
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
-- Endgültiges Löschen und Speicherbereinigung (nur Service-Rolle, täglicher Worker)
-- ---------------------------------------------------------------------------

-- Löscht Parks, die seit mehr als 30 Tagen im Papierkorb liegen, mit Versionen und
-- den Runs der löschenden Person. Sind (durch einen seltenen Wettlauf) doch Runs
-- anderer Athleten vorhanden, bleibt der Park im Papierkorb.
create function public.park_purge_trash(max_items integer default 50) returns integer
language plpgsql security definer set search_path='' as $$
declare target uuid; purged integer:=0;
begin
 for target in
  select p.id from public.skateparks p
  where p.deleted_at < now()-interval '30 days' and private.park_foreign_run_count(p.id,p.deleted_by)=0
  order by p.deleted_at limit least(greatest(coalesce(max_items,50),1),500)
  for update skip locked
 loop
  delete from public.park_runs where park_id=target;
  delete from public.skatepark_versions where park_id=target;
  delete from public.skateparks where id=target;
  purged:=purged+1;
 end loop;
 return purged;
end; $$;

-- Dateien in beiden Park-Buckets, die in keiner Parkversion vorkommen und älter als
-- 24 Stunden sind (verworfene Ausschnitte, abgebrochene Uploads, endgültig gelöschte Parks).
create function public.park_orphan_objects(max_items integer default 200)
returns table (bucket_id text, name text)
language sql stable security definer set search_path='' as $$
 with used as (
  select distinct path from public.skatepark_versions v, private.park_asset_paths(v.content) path
 )
 select o.bucket_id,o.name from storage.objects o
 where o.bucket_id in ('skatepark-aerials','skatepark-models')
   and o.created_at < now()-interval '24 hours'
   and not exists(select 1 from used u where u.path=o.name)
 order by o.created_at
 limit least(greatest(coalesce(max_items,200),1),1000);
$$;

revoke all on function public.park_purge_trash(integer),public.park_orphan_objects(integer) from public,anon,authenticated;
grant execute on function public.park_purge_trash(integer),public.park_orphan_objects(integer) to service_role;

select pg_notify('pgrst','reload schema');
