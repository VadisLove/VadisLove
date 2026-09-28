-- Schritt 11, bestätigte Erweiterung: Kinder ohne Login nutzen dieselbe
-- Teilnehmerliste wie Konten. Keine künstlichen E-Mail-Adressen/Auth-Konten.
alter table public.event_participants
 alter column invited_email drop not null,
 add column family_athlete_id uuid references public.training_athletes(id) on delete restrict,
 add column family_display_name text,
 add constraint family_participant_identity check (
  (family_athlete_id is null and family_display_name is null and invited_email is not null)
  or (family_athlete_id is not null and user_id is null and invited_email is null and family_display_name is not null)
 );
create unique index family_event_athlete_unique on public.event_participants(event_id,family_athlete_id)
 where family_athlete_id is not null;
create index family_participant_athlete on public.event_participants(family_athlete_id)
 where family_athlete_id is not null;

-- Auch Terminersteller dürfen über direkte INSERTs keine fremden Kinder-IDs
-- zuordnen. Die private Familienaktion setzt diesen Kontext nach Rechteprüfung.
create function private.family_participant_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.family_athlete_id is distinct from old.family_athlete_id
  or new.family_display_name is distinct from old.family_display_name) then
  raise exception 'FAMILY_FORBIDDEN';
 end if;
 if tg_op='INSERT' and new.family_athlete_id is not null then
  if coalesce(current_setting('app.family_participant_write',true),'')<>'on'
    or not private.family_can_manage(new.family_athlete_id) then raise exception 'FAMILY_FORBIDDEN'; end if;
  select a.display_name into new.family_display_name from public.training_athletes a
   where a.id=new.family_athlete_id and a.user_id is null;
  if not found then raise exception 'FAMILY_FORBIDDEN'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.family_participant_guard() from public,anon,authenticated;
create trigger family_participant_guard before insert or update on public.event_participants
 for each row execute function private.family_participant_guard();

create or replace function private.family_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from (
   select id,title,message,created_at as "createdAt" from public.notifications
   where user_id=auth.uid() and link='/familie' and private.current_account_is_active()
   order by created_at desc,id desc limit 5
 ) n),'[]'::jsonb),
 'children',coalesce((select jsonb_agg(jsonb_build_object(
  'id',a.id,'name',a.display_name,'hasLogin',a.user_id is not null,
  'events',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,
   'location',e.location,'status',e.status,'attendance',p.status,
   'revision',e.communication_revision,'responseAt',p.responded_at,
   'needsAcknowledgement',coalesce(p.status in ('open','confirmed') and p.acknowledged_revision<e.communication_revision,false),
   'late',coalesce(p.response_is_late,false),'deadline',e.response_deadline
  ) order by e.starts_at,e.id)
  from public.events e
  left join public.event_participants p on p.event_id=e.id and (
   p.family_athlete_id=a.id or (a.user_id is not null and (p.user_id=a.user_id or
    (p.user_id is null and p.invited_email=(select lower(email) from public.profiles where id=a.user_id))))
  )
  where e.ends_at>=now() and (p.id is not null or (e.status='scheduled' and private.calendar_event_visible(e.id)))),'[]'::jsonb)
 ) order by a.display_name,a.id) from public.training_athletes a where private.family_can_manage(a.id)),'[]'::jsonb));
$$;

create or replace function private.family_respond_event(target uuid,event uuid,response text,
 expected_revision integer,expected_response_at timestamptz,acknowledge boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare child public.training_athletes; appointment public.events; participant public.event_participants; child_email text;
begin
 if not private.family_can_manage(target) then raise exception 'FAMILY_FORBIDDEN' using errcode='42501'; end if;
 select * into appointment from public.events where id=event for update;
 if not found or not private.family_can_manage(target) then raise exception 'FAMILY_FORBIDDEN'; end if;
 select * into child from public.training_athletes where id=target;
 select lower(email) into child_email from public.profiles where id=child.user_id;
 select * into participant from public.event_participants p where p.event_id=event and (
  p.family_athlete_id=target or (child.user_id is not null and (p.user_id=child.user_id or (p.user_id is null and p.invited_email=child_email)))
 ) for update;
 if participant.id is null and not private.calendar_event_visible(event) then raise exception 'FAMILY_FORBIDDEN'; end if;
 if appointment.communication_revision is distinct from expected_revision
  or participant.responded_at is distinct from expected_response_at then raise exception 'FAMILY_CONFLICT'; end if;
 if appointment.ends_at<now() then raise exception 'FAMILY_FORBIDDEN'; end if;
 if acknowledge then
  if participant.id is null or participant.status not in ('open','confirmed') or appointment.communication_revision=0 then raise exception 'FAMILY_INVALID'; end if;
  perform set_config('app.calendar_ack_rpc','on',true);
  update public.event_participants set acknowledged_revision=appointment.communication_revision where id=participant.id;
  insert into public.event_revision_acknowledgements(revision_id,participant_id,acknowledged_by)
   select r.id,participant.id,auth.uid() from public.event_communication_revisions r
   where r.event_id=event and r.revision=appointment.communication_revision
   on conflict(revision_id,participant_id) do nothing;
 else
  if appointment.status<>'scheduled' or response is null or response not in ('confirmed','declined') then raise exception 'FAMILY_INVALID'; end if;
  if participant.id is null then
   perform set_config('app.family_participant_write','on',true);
   insert into public.event_participants(event_id,user_id,invited_email,invited_by,status,responded_at,family_athlete_id)
    values(event,child.user_id,child_email,auth.uid(),response::public.attendance_status,clock_timestamp(),
     case when child.user_id is null then target else null end);
  else
   update public.event_participants set status=response::public.attendance_status,responded_at=clock_timestamp(),
    user_id=case when child.user_id is not null then child.user_id else user_id end where id=participant.id;
  end if;
 end if;
 insert into private.family_response_audit(athlete_id,event_id,actor_id,operation,response,event_revision)
 values(target,event,auth.uid(),case when acknowledge then 'acknowledge' else 'respond' end,
  case when acknowledge then null else response::public.attendance_status end,appointment.communication_revision);
end;
$$;

-- Dieser Hinweis ist für alle aktiv verknüpften Kinderkonten gleich, unabhängig
-- von einem unvollständigen historischen Altersfeld oder einer bloßen UI-Rolle.
create function private.family_self_notice() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and exists(
  select 1 from public.relationships r where r.active and r.relationship_type='guardian'
  and r.athlete_user_id=auth.uid() and private.account_is_active(r.guardian_user_id)
 );
$$;
create function public.family_self_notice() returns boolean
language sql security invoker set search_path='' as $$select private.family_self_notice()$$;
revoke all on function private.family_self_notice(),public.family_self_notice() from public,anon;
grant execute on function private.family_self_notice(),public.family_self_notice() to authenticated;

-- Läuft atomar mit jeder echten Selbst-Zu-/Absage, auch beim direkten API-Aufruf.
-- Gleiche Antwort erneut speichern, Einladungen und Elternantworten erzeugen
-- keine vermeintliche Selbstanmeldung. Es wird keine weitere Freigabe verlangt.
create function private.family_notify_self_response() returns trigger
language plpgsql security definer set search_path='' as $$
declare child_name text; event_title text;
begin
 if new.user_id is distinct from auth.uid() or not private.current_account_is_active()
   or new.status not in ('confirmed','declined') then return new; end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 select display_name into child_name from public.profiles where id=new.user_id;
 select title into event_title from public.events where id=new.event_id;
 insert into public.notifications(user_id,actor_user_id,type,title,message,link)
  select distinct r.guardian_user_id,auth.uid(),'guardian_activity'::public.notification_type,
   case when new.status='confirmed' then 'Kind hat sich angemeldet' else 'Kind hat abgesagt' end,
   child_name || case when new.status='confirmed' then ' hat sich für „' else ' hat für „' end
    || event_title || case when new.status='confirmed' then '“ angemeldet.' else '“ abgesagt.' end,
   '/familie'
  from public.relationships r where r.active and r.relationship_type='guardian'
   and r.athlete_user_id=new.user_id and private.account_is_active(r.guardian_user_id);
 return new;
end;
$$;
revoke all on function private.family_notify_self_response() from public,anon,authenticated;
create trigger family_notify_self_response after insert or update on public.event_participants
 for each row execute function private.family_notify_self_response();

-- Die bestehende Kalenderkommunikation adressiert Konten. Ohne Kinderlogin
-- erhalten stattdessen die direkt verknüpften Eltern den Änderungshinweis.
create function private.family_notify_child_event_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.communication_revision=old.communication_revision then return new; end if;
 insert into public.notifications(user_id,actor_user_id,type,title,message,link,dedupe_key)
  select g.guardian_id,auth.uid(),'guardian_activity',
   case when new.status='cancelled' then 'Termin des Kindes abgesagt' else 'Termin des Kindes geändert' end,
   p.family_display_name || ': „' || new.title || '“ – bitte prüfe die aktuellen Angaben.', '/familie',
   'family:event:'||new.id||':'||new.communication_revision||':'||p.family_athlete_id||':'||g.guardian_id
  from public.event_participants p join public.family_guardians g on g.athlete_id=p.family_athlete_id
  where p.event_id=new.id and p.status in ('open','confirmed') and g.revoked_at is null
   and private.account_is_active(g.guardian_id)
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
 return new;
end;
$$;
revoke all on function private.family_notify_child_event_change() from public,anon,authenticated;
create trigger family_notify_child_event_change after update on public.events
 for each row execute function private.family_notify_child_event_change();
