-- Trainingspläne archivieren und löschen (Review 08.09., Nachtrag 30.09.2026, Punkt 7).
--
-- Begriffe
--   Plan        = Vorlage des Erstellers (training_plans + Versionen) bzw. bei
--                 Altfreigaben ohne gespeicherten Plan die Gruppe aller Kopien
--                 desselben Absenders mit derselben Plan-ID im Snapshot.
--   Kopie       = persönliche Freigabe je Athlet (training_plan_snapshot_shares)
--                 mit eigenem Fortschritt, Nachweisen und Demovideos.
--
-- Regeln (vom Nutzer am 30.09.2026 bestätigt)
--   * Eine Kopie ist ausgeführt, sobald alle ihre Tricks bestätigt sind; sie
--     wandert dann für den Athleten nach „Erledigt“. Sind alle Kopien eines
--     Plans erledigt, wird der Plan automatisch archiviert – nur im Moment der
--     letzten Bestätigung, damit ein reaktivierter Plan aktiv bleibt.
--   * Ersteller und Vorstand (für Trainer verwalteter Vereine) dürfen manuell
--     archivieren, reaktivieren, löschen und wiederherstellen.
--   * Löschen = Papierkorb für 30 Tage. Kopien mit Athletenverlauf bleiben für
--     immer (nur lesbar unter „Erledigt“); Kopien ohne Verlauf verschwinden beim
--     Athleten sofort und werden mit der Vorlage endgültig entfernt.
--   * Archivierte und gelöschte Pläne vererben sich nicht an neue Mitglieder,
--     starten kein Training und nehmen keine Nachweise an.
--
-- Rein additiv: neue Spalten mit Standardwerten, neue Funktionen/Trigger.
-- Ersetzt werden nur Funktionen, die um eine Statusprüfung ergänzt werden.

/* ------------------------------------------------------------------ */
/* Spalten                                                              */
/* ------------------------------------------------------------------ */

alter table public.training_plans
 add column archived_at timestamptz,
 add column archived_by uuid references public.profiles(id) on delete set null,
 add column archived_reason text,
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id) on delete set null,
 add constraint training_plans_archived_reason check (
  (archived_at is null and archived_reason is null)
  or (archived_at is not null and archived_reason in ('completed','manual'))
 );
create index training_plans_deleted on public.training_plans(deleted_at) where deleted_at is not null;
create index training_plans_archived_by on public.training_plans(archived_by) where archived_by is not null;
create index training_plans_deleted_by on public.training_plans(deleted_by) where deleted_by is not null;

-- keep_for_athlete wird beim Löschen gesetzt: true = Kopie hat Verlauf und
-- bleibt beim Athleten unter „Erledigt“; false = Kopie verschwindet.
alter table public.training_plan_snapshot_shares
 add column archived_at timestamptz,
 add column archived_reason text,
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id) on delete set null,
 add column keep_for_athlete boolean not null default true,
 add constraint training_plan_snapshot_shares_archived_reason check (
  (archived_at is null and archived_reason is null)
  or (archived_at is not null and archived_reason in ('completed','manual'))
 );
create index training_plan_snapshot_shares_plan_key
 on public.training_plan_snapshot_shares(shared_by,(plan_snapshot->>'id'));
create index training_plan_snapshot_shares_deleted
 on public.training_plan_snapshot_shares(deleted_at) where deleted_at is not null;
create index training_plan_snapshot_shares_deleted_by
 on public.training_plan_snapshot_shares(deleted_by) where deleted_by is not null;

-- Athleten sehen gelöschte Kopien ohne Verlauf nicht mehr; der Absender sieht
-- sie weiterhin (Papierkorb). Restriktiv, damit keine andere Policy sie öffnet.
create policy training_plan_snapshot_shares_hide_deleted on public.training_plan_snapshot_shares
as restrictive for select to authenticated
using (deleted_at is null or keep_for_athlete or shared_by=(select auth.uid()));

/* ------------------------------------------------------------------ */
/* Helfer                                                               */
/* ------------------------------------------------------------------ */

-- Ersteller oder Vorstand eines Vereins/Verbands, in dem der Ersteller als
-- Trainer*in Mitglied ist (Prüfung wie bei der Vereinsverwaltung).
create function private.training_plan_can_manage(owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and owner is not null and (
  owner=auth.uid()
  or (private.training_is_board(auth.uid()) and exists(
   select 1 from public.organization_memberships m
   where m.user_id=owner and m.role::text in ('club_trainer','state_trainer','federal_trainer')
    and private.can_manage_organization(m.organization_id)))
 );
$$;

-- Verlauf einer Kopie: ein Trick nicht mehr „Offen“, ein Nachweis, eine
-- Session aus dieser Kopie oder eine anwesende Teilnahme an einer Session aus
-- dem Ursprungsplan. Genau das muss nachvollziehbar bleiben.
create function private.training_share_has_history(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.training_trick_progress p where p.snapshot_share_id=target and p.status::text<>'not_started')
  or exists(select 1 from public.training_video_evidence e where e.snapshot_share_id=target)
  or exists(select 1 from public.training_sessions s where s.source_key='share:'||target::text)
  or exists(
   select 1 from public.training_plan_snapshot_shares sh
   join public.training_plan_versions v on v.training_plan_id::text=sh.plan_snapshot->>'id'
   join public.training_sessions s on s.plan_version_id=v.id
   join public.training_session_participants pa on pa.session_id=s.id and pa.present
   join public.training_athletes a on a.id=pa.athlete_id
   where sh.id=target and a.user_id=sh.recipient_user_id);
$$;

-- Eigener gespeicherter Plan zu (Ersteller, Plan-ID), sonst null (Altfreigabe).
create function private.training_plan_row(owner uuid, plan_key text) returns public.training_plans
language sql stable security definer set search_path='' as $$
 select p.* from public.training_plans p
 where p.id::text=plan_key and p.created_by=owner and p.organization_id is null;
$$;

-- Bisherige Athlet*innen eines Plans: je Person die neueste Kopie.
create function private.training_plan_athletes(owner uuid, plan_key text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',x.recipient_user_id,'name',pr.display_name,'share_id',x.id,
  'archived',x.archived_at is not null,'deleted',x.deleted_at is not null,
  'history',private.training_share_has_history(x.id)) order by pr.display_name),'[]'::jsonb)
 from (
  select distinct on (s.recipient_user_id) s.* from public.training_plan_snapshot_shares s
  where s.shared_by=owner and s.plan_snapshot->>'id'=plan_key
   and s.target_type='person' and s.recipient_user_id is not null
  order by s.recipient_user_id, s.created_at desc
 ) x join public.profiles pr on pr.id=x.recipient_user_id;
$$;

-- Einheitliche Vorprüfung aller Lebenszyklus-Aktionen; sperrt den Plan.
create function private.training_plan_lock(owner uuid, plan_key text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if plan_key is null or length(plan_key) not between 1 and 160 or not private.training_plan_can_manage(owner) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||plan_key,4));
 if private.training_plan_row(owner,plan_key) is null and not exists(
  select 1 from public.training_plan_snapshot_shares where shared_by=owner and plan_snapshot->>'id'=plan_key) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
end; $$;

/* ------------------------------------------------------------------ */
/* Aktionen                                                             */
/* ------------------------------------------------------------------ */

-- Manuell als erledigt markieren: Vorlage und alle aktiven Kopien archivieren.
create function private.training_plan_archive(p_plan text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=coalesce(p_owner,auth.uid()); v_row public.training_plans%rowtype; v_count integer;
begin
 perform private.training_plan_lock(v_owner,p_plan);
 v_row:=private.training_plan_row(v_owner,p_plan);
 if v_row.id is not null then
  if v_row.deleted_at is not null then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
  if v_row.archived_at is null then
   update public.training_plans set archived_at=now(),archived_by=auth.uid(),archived_reason='manual' where id=v_row.id;
  end if;
 end if;
 update public.training_plan_snapshot_shares set archived_at=now(),archived_reason='manual'
 where shared_by=v_owner and plan_snapshot->>'id'=p_plan and archived_at is null and deleted_at is null;
 get diagnostics v_count=row_count;
 return jsonb_build_object('archived_copies',v_count);
end; $$;

-- Reaktivieren mit neuer Auswahl: gewählte bisherige Athlet*innen erhalten ihre
-- Kopie samt Fortschritt zurück, neue Athlet*innen/Gruppen den aktuellen Stand.
-- Ohne Auswahl wird der Plan wieder zum Entwurf. Neue Zuweisungen darf nur der
-- Ersteller vornehmen; der Vorstand reaktiviert nur bisherige Kopien.
create function private.training_plan_reactivate(p_plan text, p_owner uuid, p_athletes uuid[], p_groups uuid[], p_club boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=coalesce(p_owner,auth.uid()); v_row public.training_plans%rowtype;
 v_previous uuid[]; v_new uuid[]; v_restored integer; v_content jsonb; v_assigned jsonb:='{}'::jsonb;
begin
 perform private.training_plan_lock(v_owner,p_plan);
 if coalesce(cardinality(p_athletes),0)>200 or coalesce(cardinality(p_groups),0)>50 then
  raise exception 'TRAINING_INVALID'; end if;
 v_row:=private.training_plan_row(v_owner,p_plan);
 if v_row.id is not null then
  if v_row.deleted_at is not null then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
  update public.training_plans set archived_at=null,archived_by=null,archived_reason=null where id=v_row.id;
 elsif exists(select 1 from public.training_plan_snapshot_shares where shared_by=v_owner and plan_snapshot->>'id'=p_plan and deleted_at is not null) then
  raise exception 'TRAINING_CONFLICT' using errcode='40001';
 end if;

 select coalesce(array_agg(distinct recipient_user_id),'{}') into v_previous
 from public.training_plan_snapshot_shares
 where shared_by=v_owner and plan_snapshot->>'id'=p_plan and recipient_user_id is not null and deleted_at is null;

 -- Bisherige: neueste Kopie je gewählter Person wieder aktiv.
 update public.training_plan_snapshot_shares s set archived_at=null,archived_reason=null
 where s.id in (
  select distinct on (x.recipient_user_id) x.id from public.training_plan_snapshot_shares x
  where x.shared_by=v_owner and x.plan_snapshot->>'id'=p_plan and x.deleted_at is null
   and x.recipient_user_id=any(coalesce(p_athletes,'{}'))
  order by x.recipient_user_id, x.created_at desc)
 and s.archived_at is not null;
 get diagnostics v_restored=row_count;

 select coalesce(array_agg(a),'{}') into v_new from unnest(coalesce(p_athletes,'{}')) a where not a=any(v_previous);

 if v_row.id is not null then
  -- Gruppen-/Vereinszuweisungen folgen der neuen Auswahl.
  delete from public.training_plan_group_assignments
  where source_plan_id=v_row.id
   and ((group_id is not null and not group_id=any(coalesce(p_groups,'{}'))) or (organization_id is not null and not coalesce(p_club,false)));
 end if;

 if cardinality(v_new)>0 or coalesce(cardinality(p_groups),0)>0 or coalesce(p_club,false) then
  if v_row.id is null or v_owner<>auth.uid() then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  select content into v_content from public.training_plan_versions
  where training_plan_id=v_row.id order by version_number desc limit 1;
  v_assigned:=private.training_assign_plan(v_content,v_new,coalesce(p_groups,'{}'),coalesce(p_club,false));
 end if;
 return jsonb_build_object('restored',v_restored,'shared',coalesce((v_assigned->>'shared')::integer,0));
end; $$;

-- In den Papierkorb: Vorlage markieren; aktive Pläne landen nach dem
-- Wiederherstellen im Archiv. Jede Kopie merkt sich, ob sie Verlauf hat.
create function private.training_plan_delete(p_plan text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=coalesce(p_owner,auth.uid()); v_row public.training_plans%rowtype;
 v_kept integer; v_removed integer;
begin
 perform private.training_plan_lock(v_owner,p_plan);
 v_row:=private.training_plan_row(v_owner,p_plan);
 if v_row.id is not null then
  if v_row.deleted_at is not null then return jsonb_build_object('kept',0,'removed',0); end if;
  update public.training_plans set deleted_at=now(),deleted_by=auth.uid(),
   archived_at=case when archived_at is null and exists(
     select 1 from public.training_plan_snapshot_shares where shared_by=v_owner and plan_snapshot->>'id'=p_plan
      and archived_at is null and deleted_at is null) then now() else archived_at end,
   archived_by=case when archived_at is null and exists(
     select 1 from public.training_plan_snapshot_shares where shared_by=v_owner and plan_snapshot->>'id'=p_plan
      and archived_at is null and deleted_at is null) then auth.uid() else archived_by end,
   archived_reason=case when archived_at is null and exists(
     select 1 from public.training_plan_snapshot_shares where shared_by=v_owner and plan_snapshot->>'id'=p_plan
      and archived_at is null and deleted_at is null) then 'manual' else archived_reason end
  where id=v_row.id;
 end if;
 update public.training_plan_snapshot_shares set deleted_at=now(),deleted_by=auth.uid(),
  keep_for_athlete=private.training_share_has_history(id),
  archived_at=coalesce(archived_at,now()),archived_reason=coalesce(archived_reason,'manual')
 where shared_by=v_owner and plan_snapshot->>'id'=p_plan and deleted_at is null;
 select count(*) filter(where keep_for_athlete),count(*) filter(where not keep_for_athlete) into v_kept,v_removed
 from public.training_plan_snapshot_shares where shared_by=v_owner and plan_snapshot->>'id'=p_plan and deleted_at is not null;
 return jsonb_build_object('kept',v_kept,'removed',v_removed);
end; $$;

-- Aus dem Papierkorb zurück: dorthin, wo der Plan vorher war (aktiv → Archiv).
create function private.training_plan_restore(p_plan text, p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=coalesce(p_owner,auth.uid()); v_row public.training_plans%rowtype; v_count integer;
begin
 perform private.training_plan_lock(v_owner,p_plan);
 v_row:=private.training_plan_row(v_owner,p_plan);
 if v_row.id is not null then
  -- Frist abgelaufen: der Plan wartet nur noch auf die Bereinigung.
  if v_row.deleted_at is null or v_row.deleted_at<=now()-interval '30 days' then
   raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
  update public.training_plans set deleted_at=null,deleted_by=null,updated_at=now() where id=v_row.id;
 end if;
 update public.training_plan_snapshot_shares set deleted_at=null,deleted_by=null,keep_for_athlete=true
 where shared_by=v_owner and plan_snapshot->>'id'=p_plan and deleted_at is not null
  and deleted_at>now()-interval '30 days';
 get diagnostics v_count=row_count;
 if v_row.id is null and v_count=0 then raise exception 'TRAINING_CONFLICT' using errcode='40001'; end if;
 return jsonb_build_object('restored',v_count);
end; $$;

-- Status aller verwaltbaren Pläne (eigene und – Vorstand – der Vereinstrainer)
-- samt Altfreigaben; Grundlage für Aktiv/Entwürfe/Archiv/Papierkorb.
create function private.training_plan_library() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'plans',coalesce((select jsonb_agg(jsonb_build_object(
    'key',p.id::text,'owner_id',p.created_by,'owner_name',pr.display_name,'own',p.created_by=auth.uid(),
    'title',p.title,'legacy',false,'archived_at',p.archived_at,'archived_reason',p.archived_reason,
    'deleted_at',p.deleted_at,'purge_at',p.deleted_at+interval '30 days',
    'athletes',private.training_plan_athletes(p.created_by,p.id::text)
   ) order by coalesce(p.deleted_at,p.archived_at,p.updated_at) desc)
   from public.training_plans p join public.profiles pr on pr.id=p.created_by
   where p.organization_id is null and private.training_plan_can_manage(p.created_by)
    and (p.deleted_at is null or p.deleted_at>now()-interval '30 days')),'[]'::jsonb),
  'legacy',coalesce((select jsonb_agg(jsonb_build_object(
    'key',g.plan_key,'owner_id',g.shared_by,'owner_name',pr.display_name,'own',g.shared_by=auth.uid(),
    'title',g.title,'legacy',true,'archived_at',g.archived_at,'archived_reason',g.archived_reason,
    'deleted_at',g.deleted_at,'purge_at',g.deleted_at+interval '30 days',
    'athletes',private.training_plan_athletes(g.shared_by,g.plan_key)
   ) order by coalesce(g.deleted_at,g.archived_at,g.created_at) desc)
   from (
    select s.shared_by,s.plan_snapshot->>'id' plan_key,
     (array_agg(s.title order by s.created_at desc))[1] title,
     max(s.created_at) created_at,
     case when bool_and(s.archived_at is not null) then max(s.archived_at) end archived_at,
     case when bool_and(s.archived_at is not null) then (array_agg(s.archived_reason order by s.archived_at desc))[1] end archived_reason,
     case when bool_and(s.deleted_at is not null) then max(s.deleted_at) end deleted_at
    from public.training_plan_snapshot_shares s
    where s.plan_snapshot->>'id' is not null and s.target_type='person'
     and private.training_plan_can_manage(s.shared_by)
     and not exists(select 1 from public.training_plans p where p.id::text=s.plan_snapshot->>'id')
    group by 1,2
   ) g join public.profiles pr on pr.id=g.shared_by
   where g.deleted_at is null or g.deleted_at>now()-interval '30 days'),'[]'::jsonb)
 );
$$;

/* ------------------------------------------------------------------ */
/* Automatisches Archivieren                                            */
/* ------------------------------------------------------------------ */

-- Letzter Trick einer Kopie bestätigt → Kopie erledigt. Keine aktive Kopie
-- mehr → Plan archiviert. Greift nur bei diesem Übergang.
create function private.training_plan_auto_archive() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_share public.training_plan_snapshot_shares%rowtype;
begin
 select * into v_share from public.training_plan_snapshot_shares where id=new.snapshot_share_id for update;
 if not found or v_share.archived_at is not null or v_share.deleted_at is not null
 or exists(select 1 from public.training_trick_progress where snapshot_share_id=v_share.id and status::text<>'confirmed') then
  return null;
 end if;
 update public.training_plan_snapshot_shares set archived_at=now(),archived_reason='completed' where id=v_share.id;
 if v_share.plan_snapshot->>'id' is not null and not exists(
  select 1 from public.training_plan_snapshot_shares where shared_by=v_share.shared_by
   and plan_snapshot->>'id'=v_share.plan_snapshot->>'id' and archived_at is null and deleted_at is null) then
  update public.training_plans set archived_at=now(),archived_by=null,archived_reason='completed'
  where id::text=v_share.plan_snapshot->>'id' and created_by=v_share.shared_by
   and organization_id is null and archived_at is null and deleted_at is null;
 end if;
 return null;
end; $$;
create trigger training_trick_progress_auto_archive after update of status on public.training_trick_progress
for each row when (new.status::text='confirmed' and old.status::text<>'confirmed')
execute function private.training_plan_auto_archive();

/* ------------------------------------------------------------------ */
/* Sperren für archivierte/gelöschte Pläne                              */
/* ------------------------------------------------------------------ */

-- Kein neues Training aus archivierten oder gelöschten Plänen/Kopien.
-- Laufende Trainings dürfen zu Ende geführt werden.
create function private.training_guard_archived_session() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.source_key like 'share:%' and exists(select 1 from public.training_plan_snapshot_shares
   where id::text=substr(new.source_key,7) and (archived_at is not null or deleted_at is not null)))
 or (new.source_key like 'plan:%' and exists(select 1 from public.training_plans
   where id::text=substr(new.source_key,6) and (archived_at is not null or deleted_at is not null))) then
  raise exception 'TRAINING_PLAN_ARCHIVED' using errcode='55000';
 end if;
 return new;
end; $$;
create trigger training_sessions_guard_archived before insert on public.training_sessions
for each row execute function private.training_guard_archived_session();

-- Keine neuen Nachweise zu erledigten oder gelöschten Kopien.
create function private.training_guard_archived_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.training_plan_snapshot_shares where id=new.snapshot_share_id
  and (archived_at is not null or deleted_at is not null)) then
  raise exception 'TRAINING_PLAN_ARCHIVED' using errcode='55000';
 end if;
 return new;
end; $$;
create trigger training_video_evidence_guard_archived before insert on public.training_video_evidence
for each row execute function private.training_guard_archived_evidence();

-- Archivierte/gelöschte Vorlagen werden nicht bearbeitet (erst reaktivieren).
create function private.training_guard_archived_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.training_plans where id=new.training_plan_id
  and (archived_at is not null or deleted_at is not null)) then
  raise exception 'TRAINING_PLAN_ARCHIVED' using errcode='55000';
 end if;
 return new;
end; $$;
create trigger training_plan_versions_guard_archived before insert on public.training_plan_versions
for each row execute function private.training_guard_archived_version();

-- Versionsschutz wie bisher; zusätzlich darf die endgültige Bereinigung die
-- Versionen löschen, wenn der Plan selbst bereits entfernt wurde (Kaskade).
-- Sessions müssen vorher gelöst sein – sonst greift weiterhin die Sperre.
create or replace function private.training_protect_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.training_sessions where plan_version_id=old.id) then
  raise exception 'TRAINING_IMMUTABLE';
 end if;
 if tg_op='DELETE' and not exists(select 1 from public.training_plans where id=old.training_plan_id) then
  return old;
 end if;
 if exists(select 1 from public.training_plans where id=old.training_plan_id and organization_id is null) then
  raise exception 'TRAINING_IMMUTABLE';
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end; $$;

/* ------------------------------------------------------------------ */
/* Bestehende Funktionen um den Status ergänzt                          */
/* ------------------------------------------------------------------ */

-- Wie bisher; eine vorhandene erledigte (nicht gelöschte) Kopie wird beim
-- erneuten Zuweisen wieder aktiv statt übersprungen.
create or replace function private.training_share_to(p_actor uuid, p_athlete uuid, p_plan jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_existing uuid;
begin
 if p_athlete is null or p_athlete=p_actor
 or not exists(select 1 from public.profiles where id=p_athlete and account_type::text='athlete') then
  return false;
 end if;
 select id into v_existing from public.training_plan_snapshot_shares where shared_by=p_actor
  and recipient_user_id=p_athlete and plan_snapshot->>'id'=p_plan->>'id' and deleted_at is null
  order by created_at desc limit 1;
 if v_existing is not null then
  update public.training_plan_snapshot_shares set archived_at=null,archived_reason=null
  where id=v_existing and archived_at is not null;
  return found;
 end if;
 if exists(select 1 from public.training_plan_snapshot_shares where shared_by=p_actor
  and recipient_user_id=p_athlete and plan_snapshot->>'id'=p_plan->>'id') then
  return false;
 end if;
 insert into public.training_plan_snapshot_shares(shared_by,target_type,recipient_user_id,title,plan_snapshot)
 values(p_actor,'person',p_athlete,btrim(p_plan->>'title'),p_plan);
 return true;
end; $$;

-- Wie bisher, zusätzlich: nur aktive (nicht archivierte/gelöschte) Pläne.
create or replace function private.training_assign_plan(p_plan jsonb, p_athletes uuid[], p_groups uuid[], p_club boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_plan uuid; v_board boolean; v_person uuid; v_group uuid; v_org uuid;
 v_count integer:=0; v_board_athletes uuid[];
begin
 if v_actor is null or not private.current_account_is_active()
 or not (private.is_trainer_profile(v_actor) or private.training_is_board(v_actor)) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 perform private.training_validate_plan(p_plan);
 v_plan:=(p_plan->>'id')::uuid;
 if not exists(select 1 from public.training_plans where id=v_plan and created_by=v_actor and organization_id is null) then
  raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.training_plans where id=v_plan and (archived_at is not null or deleted_at is not null)) then
  raise exception 'TRAINING_PLAN_ARCHIVED' using errcode='55000'; end if;
 if coalesce(cardinality(p_athletes),0)>200 or coalesce(cardinality(p_groups),0)>50 then
  raise exception 'TRAINING_INVALID'; end if;
 v_board:=private.training_is_board(v_actor);
 select coalesce(array_agg(x),'{}') into v_board_athletes from private.training_board_athletes() x;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||v_plan::text,3));

 foreach v_person in array coalesce(p_athletes,'{}'::uuid[]) loop
  if not (private.are_connected(v_actor,v_person) or v_person=any(v_board_athletes)) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  if private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
 end loop;

 foreach v_group in array coalesce(p_groups,'{}'::uuid[]) loop
  if not private.can_manage_group(v_group) then raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  insert into public.training_plan_group_assignments(source_plan_id,group_id,assigned_by,title,plan_snapshot)
  values(v_plan,v_group,v_actor,btrim(p_plan->>'title'),p_plan)
  on conflict(source_plan_id,group_id) where group_id is not null
  do update set plan_snapshot=excluded.plan_snapshot,title=excluded.title,updated_at=now();
  for v_person in select m.user_id from public.group_memberships m where m.group_id=v_group loop
   if (private.are_connected(v_actor,v_person) or v_person=any(v_board_athletes))
   and private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
  end loop;
 end loop;

 if coalesce(p_club,false) then
  if not v_board or not exists(select 1 from private.training_board_clubs()) then
   raise exception 'TRAINING_FORBIDDEN' using errcode='42501'; end if;
  for v_org in select private.training_board_clubs() loop
   insert into public.training_plan_group_assignments(source_plan_id,organization_id,assigned_by,title,plan_snapshot)
   values(v_plan,v_org,v_actor,btrim(p_plan->>'title'),p_plan)
   on conflict(source_plan_id,organization_id) where organization_id is not null
   do update set plan_snapshot=excluded.plan_snapshot,title=excluded.title,updated_at=now();
  end loop;
  foreach v_person in array v_board_athletes loop
   if private.training_share_to(v_actor,v_person,p_plan) then v_count:=v_count+1; end if;
  end loop;
 end if;
 return jsonb_build_object('shared',v_count);
end; $$;

-- Neue Gruppenmitglieder erben nur aktive Pläne.
create or replace function private.training_inherit_group_plans() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.training_plan_group_assignments%rowtype;
begin
 for a in select x.* from public.training_plan_group_assignments x
  join public.training_plans p on p.id=x.source_plan_id
  where x.group_id=new.group_id and p.archived_at is null and p.deleted_at is null loop
  if private.training_connected(a.assigned_by,new.user_id) then
   perform private.training_share_to(a.assigned_by,new.user_id,a.plan_snapshot);
  end if;
 end loop;
 return new;
end; $$;

-- Neue Vereinsathlet*innen erben nur aktive Vereinszuweisungen.
create or replace function private.training_inherit_club_plans() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.training_plan_group_assignments%rowtype;
begin
 if new.role::text<>'athlete' then return new; end if;
 for a in select x.* from public.training_plan_group_assignments x
  join public.training_plans p on p.id=x.source_plan_id
  where x.organization_id=new.organization_id and p.archived_at is null and p.deleted_at is null loop
  perform private.training_share_to(a.assigned_by,new.user_id,a.plan_snapshot);
 end loop;
 return new;
end; $$;

-- Vereinsvorlagen im Papierkorb werden nicht mehr angeboten.
create or replace function private.training_club_templates() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'title',p.title,'organization_name',o.name,'author_name',pr.display_name,
  'own',p.created_by=auth.uid(),'content',v.content) order by p.updated_at desc),'[]'::jsonb)
 from public.training_plans p
 join public.organizations o on o.id=p.template_organization_id
 join public.profiles pr on pr.id=p.created_by
 join lateral (select content from public.training_plan_versions where training_plan_id=p.id
  order by version_number desc limit 1) v on true
 where p.is_club_template and p.deleted_at is null and private.current_account_is_active()
 and (private.is_trainer_profile(auth.uid()) or private.training_is_board(auth.uid()))
 and exists(select 1 from public.organization_memberships m
  join public.organizations mo on mo.id=m.organization_id
  where m.user_id=auth.uid() and (mo.id=o.id or mo.parent_id=o.id));
$$;

/* ------------------------------------------------------------------ */
/* Endgültige Bereinigung (nur Service-Rolle / pg_cron)                 */
/* ------------------------------------------------------------------ */

-- Nach 30 Tagen: Kopien ohne Verlauf löschen (samt leerem Fortschritt und
-- Demovideos), Sessions vom Plan lösen (ihr Planinhalt bleibt im Snapshot)
-- und die Vorlage mit Versionen und Zuweisungen entfernen. Kopien mit Verlauf
-- bleiben dauerhaft beim Athleten.
create function public.training_plan_purge_trash(max_items integer default 50) returns integer
language plpgsql security definer set search_path='' as $$
declare v_plan public.training_plans%rowtype; v_purged integer:=0; v_shares integer;
begin
 delete from public.training_plan_snapshot_shares s
 where s.deleted_at<now()-interval '30 days' and not s.keep_for_athlete
  and not private.training_share_has_history(s.id);
 get diagnostics v_shares=row_count;
 for v_plan in select * from public.training_plans
  where deleted_at<now()-interval '30 days' and organization_id is null
  order by deleted_at limit least(greatest(coalesce(max_items,50),1),500) for update skip locked loop
  update public.training_sessions set plan_version_id=null
  where plan_version_id in (select id from public.training_plan_versions where training_plan_id=v_plan.id);
  delete from public.training_plans where id=v_plan.id;
  v_purged:=v_purged+1;
 end loop;
 return v_purged+v_shares;
end; $$;

/* ------------------------------------------------------------------ */
/* Öffentliche Wrapper und Rechte                                       */
/* ------------------------------------------------------------------ */

create function public.training_plan_archive(p_plan text, p_owner uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_plan_archive(p_plan,p_owner); $$;
create function public.training_plan_reactivate(p_plan text, p_owner uuid default null, p_athletes uuid[] default '{}',
 p_groups uuid[] default '{}', p_club boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_plan_reactivate(p_plan,p_owner,p_athletes,p_groups,p_club); $$;
create function public.training_plan_delete(p_plan text, p_owner uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_plan_delete(p_plan,p_owner); $$;
create function public.training_plan_restore(p_plan text, p_owner uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.training_plan_restore(p_plan,p_owner); $$;
create function public.training_plan_library() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.training_plan_library(); $$;

revoke all on function
 private.training_plan_can_manage(uuid), private.training_share_has_history(uuid),
 private.training_plan_row(uuid,text), private.training_plan_athletes(uuid,text), private.training_plan_lock(uuid,text),
 private.training_plan_archive(text,uuid), private.training_plan_reactivate(text,uuid,uuid[],uuid[],boolean),
 private.training_plan_delete(text,uuid), private.training_plan_restore(text,uuid), private.training_plan_library(),
 private.training_plan_auto_archive(), private.training_guard_archived_session(),
 private.training_guard_archived_evidence(), private.training_guard_archived_version(),
 public.training_plan_archive(text,uuid), public.training_plan_reactivate(text,uuid,uuid[],uuid[],boolean),
 public.training_plan_delete(text,uuid), public.training_plan_restore(text,uuid), public.training_plan_library(),
 public.training_plan_purge_trash(integer)
from public, anon, authenticated;

grant execute on function
 private.training_plan_archive(text,uuid), private.training_plan_reactivate(text,uuid,uuid[],uuid[],boolean),
 private.training_plan_delete(text,uuid), private.training_plan_restore(text,uuid), private.training_plan_library(),
 public.training_plan_archive(text,uuid), public.training_plan_reactivate(text,uuid,uuid[],uuid[],boolean),
 public.training_plan_delete(text,uuid), public.training_plan_restore(text,uuid), public.training_plan_library()
to authenticated;
grant execute on function public.training_plan_purge_trash(integer) to service_role;
