-- Fahrgemeinschaften: Schreibzugriffe erfolgen ausschließlich über den geprüften
-- Befehls-Endpunkt. Private Helfer verhindern rekursive RLS-Abfragen.
-- Voraussetzung: guardian_registration_approval (Alters- und Kontosperren).
do $$ begin
  if to_regclass('public.guardian_approval_requests') is null then
    raise exception 'Install guardian_registration_approval before carpool_release';
  end if;
end $$;
alter type public.notification_type add value if not exists 'carpool_activity';

create table public.carpool_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  own_app boolean not null default true, own_email boolean not null default true,
  guardian_app boolean not null default true, guardian_email boolean not null default true,
  locale text not null default 'de' check (locale in ('de','en'))
);
create table public.carpool_rides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('outbound','return')),
  departure_at timestamptz not null,
  origin text not null check (length(btrim(origin)) between 1 and 160),
  meeting_point text not null check (length(btrim(meeting_point)) between 1 and 240),
  seats integer not null check (seats between 1 and 50),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'active' check (status in ('active','review','cancelled')),
  revision integer not null default 1,
  attested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index carpool_rides_event_idx on public.carpool_rides(event_id);
create index carpool_rides_driver_idx on public.carpool_rides(driver_id);
create table public.carpool_requests (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.carpool_rides(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('outbound','return')),
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled')),
  acknowledged_revision integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index carpool_one_active_request on public.carpool_requests(event_id,passenger_id,direction)
  where status in ('pending','confirmed');
create index carpool_requests_ride_idx on public.carpool_requests(ride_id,status);
create index carpool_requests_passenger_idx on public.carpool_requests(passenger_id);
create table public.carpool_wanted (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction text not null check (direction in ('outbound','return')),
  origin text not null check (length(btrim(origin)) between 1 and 160),
  note text not null default '' check (length(note) <= 500),
  unique(event_id,user_id,direction)
);
create index carpool_wanted_user_idx on public.carpool_wanted(user_id);
create table public.carpool_comments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.carpool_rides(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index carpool_comments_ride_idx on public.carpool_comments(ride_id,created_at);
create index carpool_comments_author_idx on public.carpool_comments(author_id);

-- Idempotenz gilt für den gesamten Befehl einschließlich Buchung und Meldungen.
create table private.carpool_commands (
  id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table private.carpool_mail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid references public.carpool_rides(id) on delete cascade,
  guardian_for uuid references public.profiles(id) on delete cascade,
  subject text not null, body text not null, link text not null,
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease_id uuid, first_attempt_at timestamptz, sent_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now()
);
create index carpool_mail_pending_idx on private.carpool_mail(available_at) where sent_at is null and failed_at is null;
alter table private.carpool_mail enable row level security;
alter table private.carpool_commands enable row level security;

create function private.carpool_guardian(child uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.account_is_active(auth.uid()) and exists (
    select 1 from public.relationships r where r.active and r.relationship_type='guardian'
      and r.guardian_user_id=auth.uid() and r.athlete_user_id=child
  );
$$;
-- Dieselben Sichtbarkeitsregeln wie events; keine zusätzliche Freigabe des Termins.
create function private.carpool_event(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.account_is_active(auth.uid()) and exists (
    select 1 from public.events e where e.id=target and e.type in ('training','contest') and (
      e.created_by=auth.uid() or private.is_organization_member(e.organization_id)
      or private.can_view_event_organization(e.organization_id) or private.can_view_social_activity(e.created_by)
    )
  );
$$;
create function private.carpool_related(target uuid, confirmed_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.account_is_active(auth.uid()) and exists (
    select 1 from public.carpool_rides r where r.id=target and (
      r.driver_id=auth.uid() or exists (
        select 1 from public.carpool_requests q where q.ride_id=r.id
          and (not confirmed_only or q.status='confirmed')
          and (q.passenger_id=auth.uid() or private.carpool_guardian(q.passenger_id))
      )
    )
  );
$$;
create function private.carpool_visible(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.account_is_active(auth.uid()) and exists (
    select 1 from public.carpool_rides r where r.id=target
      and (private.carpool_event(r.event_id) or private.carpool_related(r.id))
  );
$$;

do $$ declare t text; begin
  foreach t in array array['carpool_preferences','carpool_rides','carpool_requests','carpool_wanted','carpool_comments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy carpool_preferences_read on public.carpool_preferences for select to authenticated
  using (user_id=auth.uid() and private.current_account_is_active());
create policy carpool_rides_read on public.carpool_rides for select to authenticated using (private.carpool_visible(id));
create policy carpool_requests_read on public.carpool_requests for select to authenticated using (
  private.current_account_is_active() and (passenger_id=auth.uid() or private.carpool_guardian(passenger_id)
    or exists(select 1 from public.carpool_rides r where r.id=ride_id and r.driver_id=auth.uid()))
);
create policy carpool_wanted_read on public.carpool_wanted for select to authenticated using (private.carpool_event(event_id));
create policy carpool_comments_read on public.carpool_comments for select to authenticated using (private.carpool_related(ride_id,true));

-- Nachrichten enthalten absichtlich keine Adressen. Details bleiben im geschützten Bereich.
create function private.carpool_notify(target uuid, change_code text, only_passenger uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare recipient record; title_text text; message_text text; is_en boolean; app_enabled boolean; email_enabled boolean;
begin
  for recipient in
    with involved as (
      select r.driver_id user_id from public.carpool_rides r where r.id=target
      union select q.passenger_id from public.carpool_requests q where q.ride_id=target
        and (q.passenger_id=only_passenger or (only_passenger is null and q.status in ('pending','confirmed')))
    ), recipients as (
      select i.user_id, null::uuid child from involved i
      union select rel.guardian_user_id, i.user_id from involved i join public.relationships rel
        on rel.athlete_user_id=i.user_id and rel.active and rel.relationship_type='guardian'
    ) select user_id, min(child::text)::uuid child from recipients group by user_id
  loop
    if not private.account_is_active(recipient.user_id) then continue; end if;
    select p.locale='en', case when recipient.child is null then p.own_app else p.guardian_app end,
      case when recipient.child is null then p.own_email else p.guardian_email end
      into is_en, app_enabled, email_enabled from public.carpool_preferences p where p.user_id=recipient.user_id;
    title_text := case when coalesce(is_en,false) then 'Carpool update' else 'Fahrgemeinschaft aktualisiert' end;
    message_text := case change_code
      when 'requested' then case when coalesce(is_en,false) then 'A seat has been requested.' else 'Ein Mitfahrplatz wurde angefragt.' end
      when 'confirmed' then case when coalesce(is_en,false) then 'A seat has been confirmed.' else 'Ein Mitfahrplatz wurde bestätigt.' end
      when 'declined' then case when coalesce(is_en,false) then 'A seat request was declined.' else 'Eine Mitfahranfrage wurde abgelehnt.' end
      when 'cancelled' then case when coalesce(is_en,false) then 'A ride or booking was cancelled.' else 'Eine Fahrt oder Buchung wurde abgesagt.' end
      when 'comment' then case when coalesce(is_en,false) then 'There is a new comment on your ride.' else 'Es gibt eine neue Nachricht zu deiner Fahrt.' end
      when 'review' then case when coalesce(is_en,false) then 'The event changed. The driver must review the ride.' else 'Der Termin wurde geändert. Der Fahrer muss die Fahrt prüfen.' end
      else case when coalesce(is_en,false) then 'Ride details changed. Please review them.' else 'Die Fahrtdaten wurden geändert. Bitte prüfe sie.' end end;
    if coalesce(app_enabled,true) then
      insert into public.notifications(user_id,actor_user_id,type,title,message,link)
      values(recipient.user_id,auth.uid(),'carpool_activity',title_text,message_text,'/fahrgemeinschaften?ride='||target);
    end if;
    if coalesce(email_enabled,true) then
      insert into private.carpool_mail(user_id,ride_id,guardian_for,subject,body,link)
      values(recipient.user_id,target,recipient.child,title_text,message_text,'/fahrgemeinschaften?ride='||target);
    end if;
  end loop;
end $$;

-- Einzige Schreibschnittstelle: Identität immer aus auth.uid(), niemals aus dem Payload.
-- Fahrtzeilensperren serialisieren Bestätigungen, Änderungen und Stornierungen.
create function private.carpool_command(command_id uuid, operation text, payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ride public.carpool_rides; req public.carpool_requests;
  target_event uuid; target_ride uuid; leg jsonb; leg_count integer; existing_count integer;
begin
  if actor is null or not private.account_is_active(actor) then raise exception 'CARPOOL_FORBIDDEN'; end if;
  insert into private.carpool_commands(id,user_id) values(command_id,actor) on conflict do nothing;
  if not found then
    if not exists(select 1 from private.carpool_commands where id=command_id and user_id=actor) then raise exception 'CARPOOL_FORBIDDEN'; end if;
    return;
  end if;
  insert into public.carpool_preferences(user_id,locale) values(actor,coalesce(payload->>'locale','de'))
    on conflict(user_id) do update set locale=excluded.locale;
  if operation='preferences' then
    insert into public.carpool_preferences(user_id,own_app,own_email,guardian_app,guardian_email,locale)
    values(actor,(payload->>'own_app')::boolean,(payload->>'own_email')::boolean,
      (payload->>'guardian_app')::boolean,(payload->>'guardian_email')::boolean,payload->>'locale')
    on conflict(user_id) do update set own_app=excluded.own_app,own_email=excluded.own_email,
      guardian_app=excluded.guardian_app,guardian_email=excluded.guardian_email,locale=excluded.locale;
    return;
  end if;
  if operation in ('offer','wanted','remove_wanted') then
    target_event:=(payload->>'event_id')::uuid;
    -- Gemeinsame Sperrreihenfolge mit Termin-Triggern: zuerst Termin, danach Fahrt.
    perform 1 from public.events where id=target_event for share;
    if not private.carpool_event(target_event) then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if operation='remove_wanted' then
      delete from public.carpool_wanted where event_id=target_event and user_id=actor and direction=payload->>'direction'; return;
    end if;
    if exists(select 1 from public.events where id=target_event and ends_at<=now()) then raise exception 'CARPOOL_DEPARTED'; end if;
    if operation='wanted' then
      insert into public.carpool_wanted(event_id,user_id,direction,origin,note)
      values(target_event,actor,payload->>'direction',payload->>'origin',coalesce(payload->>'note',''))
      on conflict(event_id,user_id,direction) do update set origin=excluded.origin,note=excluded.note;
      return;
    end if;
    if coalesce((payload->>'attested')::boolean,false) is not true or exists(
      select 1 from public.guardian_approval_requests where minor_user_id=actor and guardian_required_until>current_date
    ) then raise exception 'CARPOOL_ADULT_REQUIRED'; end if;
    leg_count:=jsonb_array_length(payload->'legs');
    if leg_count is null or leg_count not between 1 and 2 then raise exception 'CARPOOL_INVALID'; end if;
    if leg_count=2 and payload->'legs'->0->>'direction'=payload->'legs'->1->>'direction' then raise exception 'CARPOOL_INVALID'; end if;
    for leg in select value from jsonb_array_elements(payload->'legs') loop
      if (leg->>'departure_at')::timestamptz<=now() then raise exception 'CARPOOL_DEPARTED'; end if;
      insert into public.carpool_rides(event_id,driver_id,direction,departure_at,origin,meeting_point,seats,note)
      values(target_event,actor,leg->>'direction',(leg->>'departure_at')::timestamptz,
        leg->>'origin',leg->>'meeting_point',(leg->>'seats')::integer,coalesce(leg->>'note',''));
    end loop;
    return;
  end if;
  target_ride:=(payload->>'ride_id')::uuid;
  select event_id into target_event from public.carpool_rides where id=target_ride;
  perform 1 from public.events where id=target_event for share;
  select * into ride from public.carpool_rides where id=target_ride for update;
  if ride.id is null or not private.carpool_visible(ride.id) then raise exception 'CARPOOL_FORBIDDEN'; end if;
  if operation='request' then
    if not private.carpool_event(ride.event_id) or ride.driver_id=actor then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if ride.status<>'active' then raise exception 'CARPOOL_REVIEW'; end if;
    if ride.departure_at<=now() then raise exception 'CARPOOL_DEPARTED'; end if;
    if (select count(*) from public.carpool_requests where ride_id=ride.id and status='confirmed')>=ride.seats then raise exception 'CARPOOL_FULL'; end if;
    insert into public.carpool_requests(ride_id,event_id,passenger_id,direction)
    values(ride.id,ride.event_id,actor,ride.direction);
    perform private.carpool_notify(ride.id,'requested',actor); return;
  elsif operation in ('confirm','decline','cancel_request','acknowledge') then
    select * into req from public.carpool_requests where id=(payload->>'request_id')::uuid and ride_id=ride.id for update;
    if req.id is null then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if operation in ('confirm','decline') and ride.driver_id<>actor then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if operation='cancel_request' and actor not in (ride.driver_id,req.passenger_id) then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if operation='acknowledge' then
      if req.passenger_id<>actor or req.status<>'confirmed' then raise exception 'CARPOOL_FORBIDDEN'; end if;
      if (payload->>'revision')::integer is distinct from ride.revision then raise exception 'CARPOOL_STALE'; end if;
      update public.carpool_requests set acknowledged_revision=ride.revision where id=req.id; return;
    end if;
    if operation='confirm' then
      if req.status<>'pending' or ride.status<>'active' then raise exception 'CARPOOL_REVIEW'; end if;
      if ride.departure_at<=now() then raise exception 'CARPOOL_DEPARTED'; end if;
      if (select count(*) from public.carpool_requests where ride_id=ride.id and status='confirmed')>=ride.seats then raise exception 'CARPOOL_FULL'; end if;
      update public.carpool_requests set status='confirmed',acknowledged_revision=ride.revision where id=req.id;
      delete from public.carpool_wanted where event_id=ride.event_id and user_id=req.passenger_id and direction=ride.direction;
      perform private.carpool_notify(ride.id,'confirmed',req.passenger_id);
    elsif operation='decline' then
      if req.status<>'pending' then raise exception 'CARPOOL_STALE'; end if;
      update public.carpool_requests set status='declined' where id=req.id;
      perform private.carpool_notify(ride.id,'declined',req.passenger_id);
    else
      if req.status not in ('pending','confirmed') then return; end if;
      update public.carpool_requests set status='cancelled' where id=req.id;
      perform private.carpool_notify(ride.id,'cancelled',req.passenger_id);
    end if;
    return;
  elsif operation in ('edit','cancel_ride','review') then
    if ride.driver_id<>actor then raise exception 'CARPOOL_FORBIDDEN'; end if;
    if ride.status='cancelled' then raise exception 'CARPOOL_STALE'; end if;
    if operation='cancel_ride' then
      perform private.carpool_notify(ride.id,'cancelled');
      update public.carpool_rides set status='cancelled' where id=ride.id;
      update public.carpool_requests set status='cancelled' where ride_id=ride.id and status in ('pending','confirmed');
      return;
    end if;
    if (payload->>'revision')::integer is distinct from ride.revision then raise exception 'CARPOOL_STALE'; end if;
    if operation='review' then
      if ride.departure_at<=now() then raise exception 'CARPOOL_DEPARTED'; end if;
      update public.carpool_rides set status='active',revision=revision+1 where id=ride.id;
    else
      existing_count:=(select count(*) from public.carpool_requests where ride_id=ride.id and status='confirmed');
      if (payload->>'seats')::integer<existing_count then raise exception 'CARPOOL_CAPACITY'; end if;
      if (payload->>'departure_at')::timestamptz<=now() then raise exception 'CARPOOL_DEPARTED'; end if;
      update public.carpool_rides set departure_at=(payload->>'departure_at')::timestamptz,
        origin=payload->>'origin',meeting_point=payload->>'meeting_point',seats=(payload->>'seats')::integer,
        note=coalesce(payload->>'note',''),status='active',revision=revision+1 where id=ride.id;
    end if;
    perform private.carpool_notify(ride.id,'changed'); return;
  elsif operation='comment' then
    if not private.carpool_related(ride.id,true) then raise exception 'CARPOOL_FORBIDDEN'; end if;
    insert into public.carpool_comments(ride_id,author_id,body) values(ride.id,actor,payload->>'body');
    perform private.carpool_notify(ride.id,'comment'); return;
  end if;
  raise exception 'CARPOOL_INVALID';
end $$;
create function public.carpool_command(command_id uuid, operation text, payload jsonb) returns void
language sql security invoker set search_path='' as $$ select private.carpool_command(command_id,operation,payload); $$;

-- Snapshot gibt nur explizite UI-Felder zurück. Eltern bekommen ausschließlich
-- Fahrten und Buchungen ihrer Kinder, niemals das vollständige Terminobjekt.
create function private.carpool_snapshot(target_event uuid default null,target_ride uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid();
begin
  if actor is null or not private.account_is_active(actor) then raise exception 'CARPOOL_FORBIDDEN'; end if;
  select jsonb_build_object(
    'asOf',now(),'userId',actor,'canOffer',not exists(select 1 from public.guardian_approval_requests where minor_user_id=actor and guardian_required_until>current_date),
    'canUseEvent',private.carpool_event(target_event),
    'rides',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object(
      'driver_name',(select display_name from public.profiles where id=r.driver_id),
      'confirmed_count',(select count(*) from public.carpool_requests q where q.ride_id=r.id and q.status='confirmed'),
      'can_request',private.carpool_event(r.event_id),'can_comment',private.carpool_related(r.id,true),
      'requests',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('passenger_name',(select display_name from public.profiles where id=q.passenger_id)))
        from public.carpool_requests q where q.ride_id=r.id and (r.driver_id=actor or q.passenger_id=actor or private.carpool_guardian(q.passenger_id))),'[]'::jsonb),
      'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('author_name',(select display_name from public.profiles where id=c.author_id)) order by c.created_at)
        from public.carpool_comments c where c.ride_id=r.id and private.carpool_related(r.id,true)),'[]'::jsonb)
    ) order by r.departure_at) from public.carpool_rides r
      where ((target_ride is not null and r.id=target_ride) or (target_ride is null and r.event_id=target_event)) and private.carpool_visible(r.id)),'[]'::jsonb),
    'wanted',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('user_name',(select display_name from public.profiles where id=w.user_id)))
      from public.carpool_wanted w where w.event_id=target_event and private.carpool_event(w.event_id)),'[]'::jsonb),
    'preferences',coalesce((select to_jsonb(p) from public.carpool_preferences p where p.user_id=actor),jsonb_build_object('own_app',true,'own_email',true,'guardian_app',true,'guardian_email',true,'locale','de'))
  ) into result;
  return result;
end $$;
create function public.carpool_snapshot(target_event uuid default null,target_ride uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.carpool_snapshot(target_event,target_ride); $$;

-- Terminänderungen laufen auch bei direkten SQL/API-Änderungen durch diesen Trigger.
create function private.carpool_event_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if tg_op='UPDATE' and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at
    and new.location is not distinct from old.location and new.type is not distinct from old.type then return new; end if;
  for r in select id from public.carpool_rides where event_id=old.id and status<>'cancelled' order by id for update loop
    if tg_op='DELETE' or new.type not in ('training','contest') then
      perform private.carpool_notify(r.id,'cancelled');
      update public.carpool_rides set status='cancelled' where id=r.id;
      update public.carpool_requests set status='cancelled' where ride_id=r.id and status in ('pending','confirmed');
    else
      update public.carpool_rides set status='review',revision=revision+1 where id=r.id;
      perform private.carpool_notify(r.id,'review');
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger carpool_event_changed before update or delete on public.events for each row execute function private.carpool_event_changed();

-- Versand-Leases verhindern parallele Verarbeitung; nach 23 Stunden wird bei
-- unklarem Versandstatus nicht erneut gesendet (Resend-Idempotenzfenster: 24 h).
create function public.carpool_claim_mail() returns table(id uuid,email text,subject text,body text,link text,lease_id uuid)
language plpgsql security invoker set search_path='' as $$
begin
  update private.carpool_mail set failed_at=now() where sent_at is null and failed_at is null
    and (attempts>=8 or first_attempt_at<now()-interval '23 hours');
  return query with batch as (
    select m.id from private.carpool_mail m where m.sent_at is null and m.failed_at is null and m.available_at<=now()
      and private.account_is_active(m.user_id)
      and (m.guardian_for is null or exists(select 1 from public.relationships r where r.active and r.relationship_type='guardian' and r.guardian_user_id=m.user_id and r.athlete_user_id=m.guardian_for))
      and coalesce((select case when m.guardian_for is null then p.own_email else p.guardian_email end from public.carpool_preferences p where p.user_id=m.user_id),true)
    order by m.created_at for update skip locked limit 20
  ), claimed as (
    update private.carpool_mail m set attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),available_at=now()+interval '5 minutes',lease_id=gen_random_uuid()
    from batch b where m.id=b.id returning m.*
  ) select c.id,p.email,c.subject,c.body,c.link,c.lease_id from claimed c join public.profiles p on p.id=c.user_id;
end $$;
create function public.carpool_finish_mail(target uuid,lease uuid,success boolean) returns void
language sql security invoker set search_path='' as $$
  update private.carpool_mail set sent_at=case when success then now() else null end,
    available_at=now()+interval '5 minutes',lease_id=null where id=target and lease_id=lease;
$$;

-- Private Funktionen sind nur über geprüfte Wrapper / RLS erreichbar.
revoke all on private.carpool_commands,private.carpool_mail from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant select,update on private.carpool_mail to service_role;
grant select on public.carpool_preferences to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') and p.proname like 'carpool_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
grant execute on function private.carpool_guardian(uuid),private.carpool_event(uuid),private.carpool_related(uuid,boolean),private.carpool_visible(uuid),
  private.carpool_command(uuid,text,jsonb),private.carpool_snapshot(uuid,uuid),public.carpool_command(uuid,text,jsonb),public.carpool_snapshot(uuid,uuid) to authenticated;
grant execute on function public.carpool_claim_mail(),public.carpool_finish_mail(uuid,uuid,boolean) to service_role;
