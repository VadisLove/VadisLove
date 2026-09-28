-- Schritt 11: dieselbe dauerhafte Athleten-ID wie im Training, auch ohne Login.
-- Bestehende Login-Beziehungen bleiben maßgeblich und werden nicht kopiert.
create table public.family_guardians (
  athlete_id uuid not null references public.training_athletes(id) on delete restrict,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  declaration_version text not null default 'family-2026-09-24',
  revoked_at timestamptz,
  primary key (athlete_id, guardian_id)
);
create index family_guardians_guardian on public.family_guardians(guardian_id, athlete_id)
  where revoked_at is null;
alter table public.family_guardians enable row level security;
revoke all on public.family_guardians from public, anon, authenticated;
grant select on public.family_guardians to authenticated;

-- Kein Token und keine Kontaktadresse werden über die Daten-API lesbar.
create table private.family_invitations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.training_athletes(id) on delete restrict,
  invited_by uuid references public.profiles(id) on delete set null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(btrim(email)))
);
create index family_invitations_athlete on private.family_invitations(athlete_id);
create index family_invitations_inviter on private.family_invitations(invited_by);
alter table private.family_invitations enable row level security;
revoke all on private.family_invitations from public, anon, authenticated;

-- Selbstdeklaration gilt nur für neu angelegte Kinder. Für existierende
-- Konten ist weiterhin die aktive, bereits bestätigte Beziehung erforderlich.
create function private.family_can_manage(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_account_is_active() and exists (
  select 1 from public.training_athletes a where a.id=target and (
   (a.user_id is null and exists(select 1 from public.family_guardians g
    where g.athlete_id=a.id and g.guardian_id=auth.uid() and g.revoked_at is null))
   or (a.user_id is not null and private.account_is_active(a.user_id) and exists(
    select 1 from public.relationships r where r.active and r.relationship_type='guardian'
     and r.athlete_user_id=a.user_id and r.guardian_user_id=auth.uid()))
  )
 );
$$;
revoke all on function private.family_can_manage(uuid) from public, anon;
grant execute on function private.family_can_manage(uuid) to authenticated;
create policy family_guardians_own on public.family_guardians for select to authenticated
 using (guardian_id=(select auth.uid()) and (select private.current_account_is_active()));
create policy family_athlete_read on public.training_athletes for select to authenticated
 using (private.family_can_manage(id));

-- Bestandskinder erhalten keine zweite Identität, falls sie schon trainiert haben.
insert into public.training_athletes(user_id, display_name)
 select distinct p.id,p.display_name from public.profiles p
 join public.relationships r on r.athlete_user_id=p.id
 where r.relationship_type='guardian' and r.active
 on conflict(user_id) do nothing;
create function private.family_sync_relationship() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.relationship_type='guardian' and new.active then
  insert into public.training_athletes(user_id,display_name)
   select p.id,p.display_name from public.profiles p where p.id=new.athlete_user_id
   on conflict(user_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function private.family_sync_relationship() from public,anon,authenticated;
create trigger family_sync_relationship after insert or update on public.relationships
 for each row execute function private.family_sync_relationship();

-- Geprüfte private Commands sind die einzige Schreibschnittstelle. Die
-- öffentliche Hülle bleibt SECURITY INVOKER; auth.uid() wird nie als Payload akzeptiert.
create function private.family_create_child(child_id uuid, child_name text, declaration boolean)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.current_account_is_active() then
  raise exception 'FAMILY_FORBIDDEN' using errcode='42501'; end if;
 if child_id is null or declaration is distinct from true
  or length(btrim(coalesce(child_name,''))) not between 2 and 120 then
  raise exception 'FAMILY_INVALID' using errcode='22023'; end if;
 -- Dieselbe Formular-ID macht einen erneuten Submit nach Netzwerkabbruch sicher.
 perform pg_advisory_xact_lock(hashtextextended(child_id::text,0));
 if exists(select 1 from public.training_athletes where id=child_id) then
  if not private.family_can_manage(child_id) then raise exception 'FAMILY_FORBIDDEN'; end if;
  return child_id;
 end if;
 insert into public.training_athletes(id,display_name) values(child_id,btrim(child_name));
 insert into public.family_guardians(athlete_id,guardian_id) values(child_id,auth.uid());
 return child_id;
end;
$$;
create function public.family_create_child(child_id uuid, child_name text, declaration boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.family_create_child(child_id,child_name,declaration);
$$;

-- Zusätzliche Sorgeberechtigte erhalten einen kurzlebigen, an ihre bestätigte
-- Konto-E-Mail gebundenen Link. Der Klartext wird nur einmal zurückgegeben.
create function private.family_invite_guardian(target uuid, recipient_email text)
returns text language plpgsql security definer set search_path='' as $$
declare token text; normalized text:=lower(btrim(recipient_email));
begin
 if not private.family_can_manage(target) or not exists(
  select 1 from public.training_athletes where id=target and user_id is null
 ) then raise exception 'FAMILY_FORBIDDEN' using errcode='42501'; end if;
 if normalized is null or length(normalized)>320 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or normalized=private.current_profile_email() then raise exception 'FAMILY_INVALID'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 -- Ein neu erzeugter Link ersetzt frühere Links desselben Absenders/Ziels.
 update private.family_invitations set expires_at=now()
  where athlete_id=target and email=normalized and invited_by=auth.uid() and accepted_at is null;
 insert into private.family_invitations(athlete_id,invited_by,email,token_hash)
 values(target,auth.uid(),normalized,encode(extensions.digest(token,'sha256'),'hex'));
 return token;
end;
$$;
create function public.family_invite_guardian(target uuid, recipient_email text)
returns text language sql security invoker set search_path='' as $$
 select private.family_invite_guardian(target,recipient_email);
$$;

create function private.family_accept_invitation(token text, declaration boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation private.family_invitations;
begin
 if auth.uid() is null or not private.current_account_is_active() then raise exception 'FAMILY_FORBIDDEN'; end if;
 if declaration is distinct from true or length(coalesce(token,''))<>64 then raise exception 'FAMILY_INVALID'; end if;
 select * into invitation from private.family_invitations i
  where i.token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
 if not found or invitation.expires_at<=now() or invitation.accepted_at is not null
  or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
   and lower(u.email)=invitation.email)
  or not private.account_is_active(invitation.invited_by)
  or not exists(select 1 from public.family_guardians g where g.athlete_id=invitation.athlete_id
   and g.guardian_id=invitation.invited_by and g.revoked_at is null)
  or not exists(select 1 from public.training_athletes a where a.id=invitation.athlete_id and a.user_id is null)
 then raise exception 'FAMILY_LINK_INVALID'; end if;
 insert into public.family_guardians(athlete_id,guardian_id) values(invitation.athlete_id,auth.uid())
 on conflict(athlete_id,guardian_id) do update set revoked_at=null,confirmed_at=now();
 update private.family_invitations set accepted_at=now() where id=invitation.id;
 return invitation.athlete_id;
end;
$$;
create function public.family_accept_invitation(token text, declaration boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.family_accept_invitation(token,declaration);
$$;

revoke all on function private.family_create_child(uuid,text,boolean),public.family_create_child(uuid,text,boolean),
 private.family_invite_guardian(uuid,text),public.family_invite_guardian(uuid,text),
 private.family_accept_invitation(text,boolean),public.family_accept_invitation(text,boolean) from public,anon;
grant execute on function private.family_create_child(uuid,text,boolean),public.family_create_child(uuid,text,boolean),
 private.family_invite_guardian(uuid,text),public.family_invite_guardian(uuid,text),
 private.family_accept_invitation(text,boolean),public.family_accept_invitation(text,boolean) to authenticated;

-- Elternantworten auf bestehende Einladungen behalten die kanonische
-- Teilnehmerzeile. Es gibt keine zweite, abweichende Familien-Teilnahmeliste.
create table private.family_response_audit (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.training_athletes(id) on delete restrict,
 event_id uuid references public.events(id) on delete set null,
 actor_id uuid references public.profiles(id) on delete set null,
 operation text not null check(operation in ('respond','acknowledge')),
 response public.attendance_status,
 event_revision integer not null,
 created_at timestamptz not null default now()
);
create index family_audit_athlete on private.family_response_audit(athlete_id,created_at);
create index family_audit_event on private.family_response_audit(event_id);
create index family_audit_actor on private.family_response_audit(actor_id);
alter table private.family_response_audit enable row level security;
revoke all on private.family_response_audit from public,anon,authenticated;

create function private.family_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('children',coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'name',a.display_name,'hasLogin',a.user_id is not null,
  'events',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,
   'location',e.location,'status',e.status,'attendance',p.status,
   'revision',e.communication_revision,'responseAt',p.responded_at,
   'needsAcknowledgement',p.status in ('open','confirmed') and p.acknowledged_revision<e.communication_revision,
   'late',p.response_is_late,'deadline',e.response_deadline
  ) order by e.starts_at,e.id)
  from public.event_participants p join public.events e on e.id=p.event_id
  where p.user_id=a.user_id and e.ends_at>=now()),'[]'::jsonb)
 ) order by a.display_name,a.id),'[]'::jsonb))
 from public.training_athletes a where private.family_can_manage(a.id);
$$;
create function public.family_overview() returns jsonb
language sql security invoker set search_path='' as $$select private.family_overview()$$;

-- Nur Daten des eingeladenen Kindes werden projiziert. Eltern erhalten dadurch
-- weder die Teilnehmerliste noch allgemeine Kalender-/Organisationsrechte.
create function private.family_respond_event(target uuid,event uuid,response text,
 expected_revision integer,expected_response_at timestamptz,acknowledge boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare child public.training_athletes; appointment public.events; participant public.event_participants;
begin
 if not private.family_can_manage(target) then raise exception 'FAMILY_FORBIDDEN' using errcode='42501'; end if;
 select * into child from public.training_athletes where id=target;
 select * into appointment from public.events where id=event for update;
 if not found then raise exception 'FAMILY_FORBIDDEN'; end if;
 select * into participant from public.event_participants where event_id=event and user_id=child.user_id for update;
 if not found then raise exception 'FAMILY_FORBIDDEN'; end if;
 if appointment.communication_revision is distinct from expected_revision
  or participant.responded_at is distinct from expected_response_at then raise exception 'FAMILY_CONFLICT'; end if;
 if appointment.ends_at<now() then raise exception 'FAMILY_FORBIDDEN'; end if;
 if acknowledge then
  if participant.status not in ('open','confirmed') or appointment.communication_revision=0 then raise exception 'FAMILY_INVALID'; end if;
  perform set_config('app.calendar_ack_rpc','on',true);
  update public.event_participants set acknowledged_revision=appointment.communication_revision where id=participant.id;
  insert into public.event_revision_acknowledgements(revision_id,participant_id,acknowledged_by)
   select r.id,participant.id,auth.uid() from public.event_communication_revisions r
   where r.event_id=event and r.revision=appointment.communication_revision
   on conflict(revision_id,participant_id) do nothing;
 else
  if appointment.status<>'scheduled' or response is null or response not in ('confirmed','declined') then raise exception 'FAMILY_INVALID'; end if;
  update public.event_participants set status=response::public.attendance_status,responded_at=clock_timestamp() where id=participant.id;
 end if;
 insert into private.family_response_audit(athlete_id,event_id,actor_id,operation,response,event_revision)
 values(target,event,auth.uid(),case when acknowledge then 'acknowledge' else 'respond' end,
  case when acknowledge then null else response::public.attendance_status end,appointment.communication_revision);
end;
$$;
create function public.family_respond_event(target uuid,event uuid,response text,
 expected_revision integer,expected_response_at timestamptz,acknowledge boolean default false)
returns void language sql security invoker set search_path='' as $$
 select private.family_respond_event(target,event,response,expected_revision,expected_response_at,acknowledge);
$$;
revoke all on function private.family_overview(),public.family_overview(),
 private.family_respond_event(uuid,uuid,text,integer,timestamptz,boolean),
 public.family_respond_event(uuid,uuid,text,integer,timestamptz,boolean) from public,anon;
grant execute on function private.family_overview(),public.family_overview(),
 private.family_respond_event(uuid,uuid,text,integer,timestamptz,boolean),
 public.family_respond_event(uuid,uuid,text,integer,timestamptz,boolean) to authenticated;

-- Vor dem Bestätigen ist nur dem Konto mit der bestätigten Zieladresse der
-- Name zugänglich. Ein zufälliger Linkinhaber kann keine Kinderprofile auslesen.
create function private.family_invitation_preview(token text) returns text
language sql stable security definer set search_path='' as $$
 select a.display_name from private.family_invitations i
 join public.training_athletes a on a.id=i.athlete_id and a.user_id is null
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
 join public.family_guardians g on g.athlete_id=i.athlete_id and g.guardian_id=i.invited_by and g.revoked_at is null
 where private.current_account_is_active() and private.account_is_active(i.invited_by)
 and i.token_hash=encode(extensions.digest(token,'sha256'),'hex')
 and i.accepted_at is null and i.expires_at>now();
$$;
create function public.family_invitation_preview(token text) returns text
language sql security invoker set search_path='' as $$select private.family_invitation_preview(token)$$;
revoke all on function private.family_invitation_preview(text),public.family_invitation_preview(text) from public,anon;
grant execute on function private.family_invitation_preview(text),public.family_invitation_preview(text) to authenticated;
