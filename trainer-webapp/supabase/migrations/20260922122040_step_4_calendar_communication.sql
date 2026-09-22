-- Schritt 4: Verbindliche Kalenderkommunikation.
-- Alle neuen exponierten Tabellen erhalten explizite Grants und RLS. Geheimnisse
-- und Versand-Leases bleiben im privaten Schema und sind nur dem Worker zugänglich.

alter type public.notification_type add value if not exists 'calendar_communication';

alter table public.events
  add column series_id uuid,
  add column series_position integer,
  add column response_deadline timestamptz,
  add column communication_revision integer not null default 0,
  add column status text not null default 'scheduled',
  add column cancelled_at timestamptz,
  add column cancelled_feed_until timestamptz,
  add constraint events_series_position_check check (
    (series_id is null and series_position is null)
    or (series_id is not null and series_position >= 0)
  ),
  add constraint events_response_deadline_check check (
    response_deadline is null or response_deadline < starts_at
  ),
  add constraint events_status_check check (status in ('scheduled', 'cancelled')),
  add constraint events_cancellation_check check (
    (status = 'scheduled' and cancelled_at is null and cancelled_feed_until is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_feed_until is not null)
  );
create unique index events_series_position_unique
  on public.events(series_id, series_position) where series_id is not null;
create index events_series_future_idx on public.events(series_id, starts_at)
  where series_id is not null;

alter table public.event_participants
  add column reminder_enabled boolean not null default false,
  add column reminder_enabled_at timestamptz,
  add column response_is_late boolean not null default false,
  add column acknowledged_revision integer not null default 0,
  add constraint event_participants_reminder_timestamp_check check (
    reminder_enabled = (reminder_enabled_at is not null)
  ),
  add constraint event_participants_ack_revision_check check (acknowledged_revision >= 0);

create table public.event_information_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sort_order integer not null check (sort_order between 0 and 9),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  url text not null check (
    char_length(url) between 8 and 1000
    and url ~* '^https?://[^/?#@[:space:]]+([/?#]|$)'
    and url !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  unique(event_id, sort_order)
);
create index event_information_links_event_idx
  on public.event_information_links(event_id, sort_order);

create table public.event_communication_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  revision integer not null check (revision > 0),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  created_at timestamptz not null default now(),
  unique(event_id, revision)
);
create index event_communication_revisions_event_idx
  on public.event_communication_revisions(event_id, revision desc);

create table public.event_revision_acknowledgements (
  revision_id uuid not null references public.event_communication_revisions(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  acknowledged_by uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key(revision_id, participant_id)
);
create index event_revision_ack_participant_idx
  on public.event_revision_acknowledgements(participant_id, acknowledged_at desc);

create table public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create unique index calendar_feed_one_active_token
  on public.calendar_feed_tokens(user_id) where revoked_at is null;
create index calendar_feed_tokens_user_idx
  on public.calendar_feed_tokens(user_id);

create table private.calendar_communication_mail (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  guardian_for uuid references public.profiles(id) on delete cascade,
  recipient_email text,
  kind text not null check (kind in ('invitation','reminder','changed','cancelled')),
  reminder_stage integer check (reminder_stage in (24,72)),
  revision integer not null default 0,
  dedupe_key text not null unique,
  subject text not null check (char_length(subject) between 1 and 160),
  body text not null check (char_length(body) between 1 and 2000),
  link text not null check (
    link = '/postfach' or link ~ '^/kalender\?event=[0-9a-f-]{36}$'
  ),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (recipient_email is null)),
  check (guardian_for is null or user_id is not null)
);
create index calendar_communication_mail_pending_idx
  on private.calendar_communication_mail(available_at, created_at)
  where sent_at is null and failed_at is null;
create index calendar_communication_mail_event_idx
  on private.calendar_communication_mail(event_id);
create index calendar_communication_mail_user_idx
  on private.calendar_communication_mail(user_id) where user_id is not null;
create index calendar_communication_mail_guardian_idx
  on private.calendar_communication_mail(guardian_for) where guardian_for is not null;

alter table public.event_information_links enable row level security;
alter table public.event_communication_revisions enable row level security;
alter table public.event_revision_acknowledgements enable row level security;
alter table public.calendar_feed_tokens enable row level security;
alter table private.calendar_communication_mail enable row level security;

revoke all on public.event_information_links, public.event_communication_revisions,
  public.event_revision_acknowledgements, public.calendar_feed_tokens
  from public, anon, authenticated;
grant select on public.event_information_links, public.event_communication_revisions,
  public.event_revision_acknowledgements to authenticated;
grant insert, update, delete on public.event_information_links to authenticated;
grant insert, update on public.calendar_feed_tokens to authenticated;
grant select on public.calendar_feed_tokens to authenticated;
grant all on public.event_information_links, public.event_communication_revisions,
  public.event_revision_acknowledgements, public.calendar_feed_tokens to service_role;
revoke all on private.calendar_communication_mail from public, anon, authenticated;
grant select, insert, update on private.calendar_communication_mail to service_role;

-- Nur diese nicht-kommunikativen Teilnehmerfelder bleiben direkt änderbar.
-- Erinnerung und Kenntnisnahme laufen ausschließlich über geprüfte RPCs.
revoke update on public.event_participants from authenticated;
grant update(user_id, invited_email, invited_by, status, responded_at,
  reminder_enabled, reminder_enabled_at, acknowledged_revision)
  on public.event_participants to authenticated;

create function private.calendar_event_visible(target uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select actor is not null and private.account_is_active(actor) and exists (
    select 1 from public.events event
    where event.id = target and (
      event.created_by = actor
      or private.is_organization_member(event.organization_id)
      or private.can_view_event_organization(event.organization_id)
      or private.can_view_social_activity(event.created_by)
      or exists (
        select 1 from public.event_participants participant
        join public.profiles profile on profile.id = actor
        where participant.event_id = event.id
          and (participant.user_id = actor or lower(participant.invited_email) = lower(profile.email))
      )
    )
  );
$$;

create function private.calendar_event_owner(target uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select actor is not null and private.account_is_active(actor) and exists (
    select 1 from public.events event where event.id = target and event.created_by = actor
  );
$$;

create policy event_information_links_read on public.event_information_links
  for select to authenticated using (private.calendar_event_visible(event_id));
create policy event_information_links_owner_write on public.event_information_links
  for all to authenticated using (private.calendar_event_owner(event_id))
  with check (private.calendar_event_owner(event_id));

create policy event_revisions_related_read on public.event_communication_revisions
  for select to authenticated using (private.calendar_event_visible(event_id));

create policy event_ack_related_read on public.event_revision_acknowledgements
  for select to authenticated using (
    acknowledged_by = (select auth.uid())
    or exists (
      select 1 from public.event_communication_revisions revision
      where revision.id = revision_id and private.calendar_event_owner(revision.event_id)
    )
  );
create policy event_ack_self_insert on public.event_revision_acknowledgements
  for insert to authenticated with check (
    acknowledged_by = (select auth.uid())
    and exists (
      select 1 from public.event_participants participant
      join public.event_communication_revisions revision on revision.id = revision_id
      join public.events event on event.id = revision.event_id
      where participant.id = participant_id
        and participant.event_id = event.id
        and participant.user_id = (select auth.uid())
        and participant.status in ('open','confirmed')
        and revision.revision = event.communication_revision
    )
  );
grant insert on public.event_revision_acknowledgements to authenticated;

create policy calendar_feed_tokens_self_read on public.calendar_feed_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy calendar_feed_tokens_self_insert on public.calendar_feed_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy calendar_feed_tokens_self_update on public.calendar_feed_tokens
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Tokens dürfen trotz der für Security-Invoker-RPCs notwendigen Tabellenrechte
-- nicht durch direkte API-Schreibzugriffe reaktiviert oder frei erzeugt werden.
create function private.calendar_feed_token_write_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'service_role'
    and coalesce(current_setting('app.calendar_feed_rpc', true), '') <> 'on'
  then
    raise exception 'CALENDAR_FORBIDDEN';
  end if;
  return new;
end;
$$;
create trigger calendar_feed_token_write_guard
  before insert or update on public.calendar_feed_tokens
  for each row execute function private.calendar_feed_token_write_guard();

-- Die frühere Organisations-Manager-Policy bleibt für andere Operationen
-- bestehen. Dieser restriktive Filter begrenzt Updates auf den Teilnehmer
-- selbst oder den tatsächlichen Ersteller des Termins.
create policy calendar_participants_update_scope on public.event_participants
  as restrictive for update to authenticated
  using (
    user_id = (select auth.uid())
    or invited_email = private.current_profile_email()
    or exists (
      select 1 from public.events event
      where event.id = event_id and event.created_by = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    or invited_email = private.current_profile_email()
    or exists (
      select 1 from public.events event
      where event.id = event_id and event.created_by = (select auth.uid())
    )
  );
-- Direkte Teilnehmerantworten erhalten serverseitig ihre Verspätungsmarkierung.
-- Ein Einladender kann die standardmäßig ausgeschaltete Erinnerung nicht setzen.
create function private.calendar_participant_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz; current_revision integer; event_status text; actor_email text;
begin
  select event.response_deadline, event.communication_revision, event.status
    into deadline, current_revision, event_status
    from public.events event where event.id = new.event_id;
  if tg_op = 'INSERT' then
    if event_status <> 'scheduled' then raise exception 'CALENDAR_EVENT_CLOSED'; end if;
    new.acknowledged_revision := current_revision;
    if auth.uid() is null or new.user_id is distinct from auth.uid()
      or new.invited_by is distinct from auth.uid() then
      new.reminder_enabled := false;
      new.reminder_enabled_at := null;
    end if;
  else
    select lower(profile.email) into actor_email from public.profiles profile where profile.id = auth.uid();
    if (new.reminder_enabled is distinct from old.reminder_enabled
      or new.reminder_enabled_at is distinct from old.reminder_enabled_at)
      and not (new.user_id = auth.uid() or lower(new.invited_email) = actor_email) then
      raise exception 'CALENDAR_FORBIDDEN';
    end if;
    if new.acknowledged_revision is distinct from old.acknowledged_revision
      and coalesce(current_setting('app.calendar_ack_rpc', true), 'off') <> 'on' then
      raise exception 'CALENDAR_FORBIDDEN';
    end if;
  end if;
  if new.status in ('confirmed','declined') and (
    tg_op = 'INSERT' or new.status is distinct from old.status
      or new.responded_at is distinct from old.responded_at
  ) then
    if event_status <> 'scheduled' then raise exception 'CALENDAR_EVENT_CLOSED'; end if;
    new.response_is_late := deadline is not null and coalesce(new.responded_at, now()) > deadline;
  end if;
  return new;
end;
$$;
create trigger calendar_participant_guard
  before insert or update on public.event_participants
  for each row execute function private.calendar_participant_guard();

-- Benachrichtigungen und E-Mails teilen einen fachlichen Deduplizierungsschlüssel.
-- Eltern erhalten nur einen knappen Hinweis und niemals ein Antwortrecht.
alter table public.notifications add column if not exists dedupe_key text;
create unique index notifications_dedupe_key_unique
  on public.notifications(dedupe_key) where dedupe_key is not null;

create function private.calendar_queue_recipient(
  target_event public.events,
  recipient uuid,
  recipient_email text,
  guardian_child uuid,
  notice_kind text,
  notice_revision integer,
  notice_subject text,
  notice_body text,
  notice_dedupe text
) returns void language plpgsql security definer set search_path = '' as $$
declare target_link text := case when guardian_child is null
  then '/kalender?event=' || target_event.id else '/postfach' end;
begin
  if recipient is not null and private.account_is_active(recipient) then
    insert into public.notifications(user_id, actor_user_id, type, title, message, link, dedupe_key)
    values(recipient, auth.uid(), 'calendar_communication', notice_subject, notice_body, target_link, notice_dedupe)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if recipient is not null or recipient_email is not null then
    insert into private.calendar_communication_mail(
      event_id, user_id, guardian_for, recipient_email, kind, revision,
      dedupe_key, subject, body, link
    ) values(
      target_event.id, recipient, guardian_child, recipient_email, notice_kind,
      notice_revision, notice_dedupe, notice_subject, notice_body, target_link
    ) on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

create function private.calendar_notify_event(
  target public.events,
  notice_kind text,
  notice_revision integer
) returns void language plpgsql security definer set search_path = '' as $$
declare participant record; guardian record; subject_text text; body_text text; base_key text;
begin
  subject_text := case notice_kind
    when 'cancelled' then 'Termin abgesagt'
    when 'changed' then 'Wichtige Terminänderung'
    else 'Termineinladung'
  end;
  body_text := case notice_kind
    when 'cancelled' then target.title || ' wurde abgesagt.'
    when 'changed' then target.title || ' wurde wichtig geändert. Bitte bestätige die Kenntnisnahme.'
    else 'Du wurdest zu ' || target.title || ' eingeladen.'
  end;
  for participant in
    select row.id, row.user_id, row.invited_email
    from public.event_participants row
    where row.event_id = target.id
      and row.status in ('open','confirmed')
      and row.user_id is distinct from target.created_by
  loop
    base_key := 'calendar:' || notice_kind || ':' || target.id || ':' || notice_revision || ':participant:' || participant.id;
    perform private.calendar_queue_recipient(
      target, participant.user_id,
      case when participant.user_id is null then participant.invited_email else null end,
      null, notice_kind, notice_revision, subject_text, body_text, base_key
    );
    if participant.user_id is not null and exists (
      select 1 from public.guardian_approval_requests approval
      where approval.minor_user_id = participant.user_id
        and approval.guardian_required_until > current_date
        and approval.status = 'approved'
    ) then
      for guardian in
        select relationship.guardian_user_id
        from public.relationships relationship
        where relationship.active
          and relationship.relationship_type = 'guardian'
          and relationship.athlete_user_id = participant.user_id
          and relationship.guardian_user_id is not null
      loop
        perform private.calendar_queue_recipient(
          target, guardian.guardian_user_id, null, participant.user_id,
          notice_kind, notice_revision,
          case when notice_kind = 'cancelled' then 'Termin eines verknüpften Athleten abgesagt'
            else 'Termin eines verknüpften Athleten geändert' end,
          case when notice_kind = 'cancelled' then 'Ein Termin des verknüpften Athleten wurde abgesagt.'
            else 'Ein wichtiger Termin des verknüpften Athleten wurde geändert.' end,
          'calendar:' || notice_kind || ':' || target.id || ':' || notice_revision || ':guardian:' || guardian.guardian_user_id || ':' || participant.user_id
        );
      end loop;
    end if;
  end loop;
end;
$$;

create function private.calendar_event_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fields text[] := '{}'; force_ack boolean := coalesce(current_setting('app.calendar_force_ack', true), 'off') = 'on'; revision_id uuid;
begin
  if new.starts_at is distinct from old.starts_at then fields := array_append(fields, 'date_time'); end if;
  if new.ends_at is distinct from old.ends_at then fields := array_append(fields, 'end_time'); end if;
  if new.location is distinct from old.location then fields := array_append(fields, 'location'); end if;
  if new.status is distinct from old.status then fields := array_append(fields, 'cancellation'); end if;
  if force_ack and new.title is distinct from old.title then fields := array_append(fields, 'title'); end if;
  if force_ack and new.description is distinct from old.description then fields := array_append(fields, 'description'); end if;
  if force_ack and new.capacity is distinct from old.capacity then fields := array_append(fields, 'capacity'); end if;
  if force_ack and coalesce(current_setting('app.calendar_links_changed', true), 'off') = 'on' then fields := array_append(fields, 'information_links'); end if;
  if cardinality(fields) = 0 then return new; end if;
  new.communication_revision := old.communication_revision + 1;
  insert into public.event_communication_revisions(event_id, revision, changed_by, changed_fields)
  values(new.id, new.communication_revision, auth.uid(), fields) returning id into revision_id;
  -- Zum Änderungszeitpunkt bereits abgesagte Personen gehören ausdrücklich
  -- nicht zum Kenntnisnahmekreis, auch wenn sie später wieder zusagen.
  perform set_config('app.calendar_ack_rpc', 'on', true);
  update public.event_participants set acknowledged_revision = new.communication_revision
    where event_id = new.id and status = 'declined'
      and acknowledged_revision < new.communication_revision;
  perform private.calendar_notify_event(new, case when new.status = 'cancelled' then 'cancelled' else 'changed' end, new.communication_revision);
  return new;
end;
$$;
create trigger calendar_event_revision
  before update on public.events
  for each row execute function private.calendar_event_revision();

create function private.calendar_invitation_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target public.events; guardian record;
begin
  select * into target from public.events where id = new.event_id;
  if new.user_id is distinct from target.created_by then
    perform private.calendar_queue_recipient(
      target, new.user_id, case when new.user_id is null then new.invited_email else null end,
      null, 'invitation', target.communication_revision, 'Termineinladung',
      'Du wurdest zu ' || target.title || ' eingeladen.',
      'calendar:invitation:' || target.id || ':participant:' || new.id
    );
    if new.user_id is not null and exists (
      select 1 from public.guardian_approval_requests approval
      where approval.minor_user_id = new.user_id
        and approval.guardian_required_until > current_date
        and approval.status = 'approved'
    ) then
      for guardian in
        select relationship.guardian_user_id
        from public.relationships relationship
        where relationship.active and relationship.relationship_type = 'guardian'
          and relationship.athlete_user_id = new.user_id
          and relationship.guardian_user_id is not null
      loop
        perform private.calendar_queue_recipient(
          target, guardian.guardian_user_id, null, new.user_id, 'invitation',
          target.communication_revision, 'Termineinladung eines verknüpften Athleten',
          'Der verknüpfte Athlet wurde zu einem Termin eingeladen.',
          'calendar:invitation:' || target.id || ':guardian:' || guardian.guardian_user_id || ':' || new.user_id
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;
create trigger calendar_invitation_notice
  after insert on public.event_participants
  for each row execute function private.calendar_invitation_notice();

create function private.calendar_validate_links(links jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare item jsonb; item_count integer;
begin
  if jsonb_typeof(coalesce(links, '[]'::jsonb)) <> 'array' then raise exception 'CALENDAR_INVALID_LINK'; end if;
  item_count := jsonb_array_length(coalesce(links, '[]'::jsonb));
  if item_count > 10 then raise exception 'CALENDAR_INVALID_LINK'; end if;
  for item in select value from jsonb_array_elements(coalesce(links, '[]'::jsonb)) loop
    if char_length(btrim(coalesce(item->>'label',''))) not between 1 and 80
      or char_length(coalesce(item->>'url','')) not between 8 and 1000
      or coalesce(item->>'url','') !~* '^https?://[^/?#@[:space:]]+([/?#]|$)'
      or coalesce(item->>'url','') ~ '[[:cntrl:]]' then
      raise exception 'CALENDAR_INVALID_LINK';
    end if;
  end loop;
end;
$$;

-- Serientermine werden in einer Transaktion mit stabiler Serien-ID und den
-- zugehörigen Informationslinks angelegt.
create function public.create_calendar_events(
  payload jsonb,
  repeat_count integer default 1,
  links jsonb default '[]'::jsonb
) returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); item_index integer; created_event uuid;
  series uuid := case when repeat_count > 1 then gen_random_uuid() else null end;
  initial_start timestamptz := (payload->>'starts_at')::timestamptz;
  initial_end timestamptz := (payload->>'ends_at')::timestamptz;
  initial_deadline timestamptz := nullif(payload->>'response_deadline','')::timestamptz;
begin
  if actor is null or not private.current_account_is_active() or repeat_count not between 1 and 26 then
    raise exception 'CALENDAR_FORBIDDEN';
  end if;
  if initial_end <= initial_start or (initial_deadline is not null and initial_deadline >= initial_start) then
    raise exception 'CALENDAR_INVALID';
  end if;
  perform private.calendar_validate_links(links);
  for item_index in 0..repeat_count - 1 loop
    insert into public.events(
      organization_id, created_by, title, description, type, starts_at, ends_at,
      location, state_code, region_name, capacity, response_deadline,
      series_id, series_position
    ) values(
      (payload->>'organization_id')::uuid, actor, btrim(payload->>'title'),
      coalesce(payload->>'description',''), (payload->>'type')::public.event_type,
      initial_start + make_interval(days => item_index * 7),
      initial_end + make_interval(days => item_index * 7), btrim(payload->>'location'),
      nullif(payload->>'state_code',''), nullif(payload->>'region_name',''),
      (payload->>'capacity')::integer,
      case when initial_deadline is null then null
        else initial_deadline + make_interval(days => item_index * 7) end,
      series, case when series is null then null else item_index end
    ) returning id into created_event;
    insert into public.event_information_links(event_id, sort_order, label, url)
      select created_event, (ordinality - 1)::integer, btrim(item->>'label'), item->>'url'
      from jsonb_array_elements(links) with ordinality as listed(item, ordinality);
    return next created_event;
  end loop;
end;
$$;

-- Atomare Eigentümermutation. Die Serienauswahl aktualisiert nur den einzelnen
-- Termin oder diesen und spätere, noch nicht vergangene Vorkommen derselben Serie.
create function public.update_calendar_event(
  target_event uuid,
  payload jsonb,
  update_scope text default 'single',
  require_acknowledgement boolean default false
) returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); original public.events; candidate record; links jsonb := coalesce(payload->'links','[]'::jsonb); links_changed boolean; deadline timestamptz;
  start_delta interval; end_delta interval; deadline_offset interval;
begin
  if actor is null or update_scope not in ('single','future') then raise exception 'CALENDAR_FORBIDDEN'; end if;
  select * into original from public.events where id = target_event for update;
  if original.id is null or original.created_by <> actor or not private.current_account_is_active() then raise exception 'CALENDAR_FORBIDDEN'; end if;
  perform private.calendar_validate_links(links);
  deadline := nullif(payload->>'response_deadline','')::timestamptz;
  if deadline is not null and deadline >= (payload->>'starts_at')::timestamptz then raise exception 'CALENDAR_INVALID_DEADLINE'; end if;
  start_delta := (payload->>'starts_at')::timestamptz - original.starts_at;
  end_delta := (payload->>'ends_at')::timestamptz - original.ends_at;
  deadline_offset := case when deadline is null then null else deadline - (payload->>'starts_at')::timestamptz end;
  select exists(
    (select label, url, sort_order from public.event_information_links where event_id = original.id)
    except
    (select item->>'label', item->>'url', (ordinality - 1)::integer from jsonb_array_elements(links) with ordinality as listed(item, ordinality))
  ) or exists(
    (select item->>'label', item->>'url', (ordinality - 1)::integer from jsonb_array_elements(links) with ordinality as listed(item, ordinality))
    except
    (select label, url, sort_order from public.event_information_links where event_id = original.id)
  ) into links_changed;
  perform set_config('app.calendar_force_ack', case when require_acknowledgement then 'on' else 'off' end, true);
  perform set_config('app.calendar_links_changed', case when links_changed then 'on' else 'off' end, true);
  for candidate in
    select event.id from public.events event
    where event.created_by = actor and (
      event.id = original.id
      or (update_scope = 'future' and original.series_id is not null
        and event.series_id = original.series_id
        and event.starts_at >= original.starts_at and event.starts_at >= now())
    ) order by event.starts_at for update
  loop
    update public.events set
      organization_id = (payload->>'organization_id')::uuid,
      title = btrim(payload->>'title'), description = coalesce(payload->>'description',''),
      type = (payload->>'type')::public.event_type,
      starts_at = starts_at + start_delta,
      ends_at = ends_at + end_delta,
      location = btrim(payload->>'location'), state_code = nullif(payload->>'state_code',''),
      region_name = nullif(payload->>'region_name',''), capacity = (payload->>'capacity')::integer,
      response_deadline = case when deadline_offset is null then null else starts_at + start_delta + deadline_offset end,
      updated_at = now()
    where id = candidate.id;
    delete from public.event_information_links where event_id = candidate.id;
    insert into public.event_information_links(event_id, sort_order, label, url)
      select candidate.id, (ordinality - 1)::integer, btrim(item->>'label'), item->>'url'
      from jsonb_array_elements(links) with ordinality as listed(item, ordinality);
    return next candidate.id;
  end loop;
end;
$$;

create function public.set_event_reminder(target_event uuid, enabled boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); actor_email text;
begin
  if actor is null or not private.current_account_is_active() then raise exception 'CALENDAR_FORBIDDEN'; end if;
  actor_email := private.current_profile_email();
  update public.event_participants participant set
    reminder_enabled = enabled,
    reminder_enabled_at = case when enabled then now() else null end
  where participant.event_id = target_event
    and (participant.user_id = actor or lower(participant.invited_email) = actor_email);
  if not found then raise exception 'CALENDAR_FORBIDDEN'; end if;
end;
$$;

create function public.acknowledge_event_revision(target_event uuid, target_revision integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); actor_email text; participant public.event_participants; revision_id uuid;
begin
  if actor is null or not private.current_account_is_active() then raise exception 'CALENDAR_FORBIDDEN'; end if;
  actor_email := private.current_profile_email();
  select row.* into participant from public.event_participants row
  where row.event_id = target_event
    and row.status in ('open','confirmed')
    and (row.user_id = actor or lower(row.invited_email) = actor_email)
  for update;
  select revision.id into revision_id from public.event_communication_revisions revision
  join public.events event on event.id = revision.event_id
  where revision.event_id = target_event and revision.revision = target_revision
    and event.communication_revision = target_revision;
  if participant.id is null or revision_id is null then raise exception 'CALENDAR_FORBIDDEN'; end if;
  insert into public.event_revision_acknowledgements(revision_id, participant_id, acknowledged_by)
  values(revision_id, participant.id, actor) on conflict do nothing;
  perform set_config('app.calendar_ack_rpc', 'on', true);
  update public.event_participants set acknowledged_revision = target_revision where id = participant.id;
end;
$$;

create function private.calendar_event_was_communicated(target public.events)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.event_participants row where row.event_id = target.id and row.user_id is distinct from target.created_by)
    or exists(select 1 from public.event_communication_revisions revision where revision.event_id = target.id)
    or exists(select 1 from private.calendar_communication_mail mail where mail.event_id = target.id)
    or exists(select 1 from public.calendar_feed_tokens token where token.user_id = target.created_by and token.revoked_at is null)
    or exists(select 1 from public.carpool_rides ride where ride.event_id = target.id);
$$;

create function public.delete_or_cancel_calendar_event(target_event uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); target public.events; communicated boolean;
begin
  select * into target from public.events where id = target_event for update;
  if actor is null or target.created_by <> actor or not private.current_account_is_active() then raise exception 'CALENDAR_FORBIDDEN'; end if;
  communicated := private.calendar_event_was_communicated(target);
  if communicated then
    if target.status <> 'cancelled' then
      update public.events set status = 'cancelled', cancelled_at = now(),
        cancelled_feed_until = now() + interval '30 days', updated_at = now()
      where id = target.id;
    end if;
    return 'cancelled';
  end if;
  delete from public.events where id = target.id;
  return 'deleted';
end;
$$;

create function public.rotate_calendar_feed_token(new_token_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); created_token uuid;
begin
  if actor is null or not private.current_account_is_active()
    or new_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'CALENDAR_FORBIDDEN'; end if;
  perform set_config('app.calendar_feed_rpc', 'on', true);
  update public.calendar_feed_tokens set revoked_at = now()
    where user_id = actor and revoked_at is null;
  insert into public.calendar_feed_tokens(user_id, token_hash)
    values(actor, new_token_hash) returning id into created_token;
  return created_token;
end;
$$;

create function public.revoke_calendar_feed_token()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_account_is_active() then
    raise exception 'CALENDAR_FORBIDDEN';
  end if;
  perform set_config('app.calendar_feed_rpc', 'on', true);
  update public.calendar_feed_tokens set revoked_at = now()
  where user_id = auth.uid() and revoked_at is null;
end;
$$;

-- Terminabsagen übernehmen die vorhandene Fahrgemeinschaftslogik, ohne deren
-- bewusst eng begrenzten Mail-Worker oder Linkprüfung zu verallgemeinern.
create function private.calendar_cancel_carpools() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ride record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for ride in select id from public.carpool_rides where event_id = new.id and status <> 'cancelled' order by id for update loop
      perform private.carpool_notify(ride.id, 'cancelled');
      update public.carpool_rides set status = 'cancelled' where id = ride.id;
      update public.carpool_requests set status = 'cancelled'
        where ride_id = ride.id and status in ('pending','confirmed');
    end loop;
  end if;
  return new;
end;
$$;
create trigger calendar_cancel_carpools
  after update of status on public.events
  for each row execute function private.calendar_cancel_carpools();

-- Fällige Reminder werden erst beim Claim materialisiert. Unique Dedupe-Keys,
-- SKIP LOCKED und stabile Resend-Keys verhindern doppelte Zustellungen.
create function public.calendar_claim_mail()
returns table(id uuid, email text, subject text, body text, link text, lease_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.notifications(user_id, actor_user_id, type, title, message, link, dedupe_key)
  select participant.user_id, null, 'calendar_communication',
    'Rückmeldung zum Termin offen',
    'Bitte antworte auf die Einladung zu ' || event.title || ' bis zur Rückmeldefrist.',
    '/kalender?event=' || event.id,
    'calendar:reminder:' || event.id || ':participant:' || participant.id || ':' || stage.hours
  from public.events event
  join public.event_participants participant on participant.event_id = event.id
  cross join (values (72), (24)) as stage(hours)
  where event.status = 'scheduled'
    and event.response_deadline > now()
    and event.response_deadline <= now() + make_interval(hours => stage.hours)
    and participant.status = 'open' and participant.reminder_enabled
    and participant.user_id is not null
    and private.account_is_active(participant.user_id)
    and participant.reminder_enabled_at <= event.response_deadline - make_interval(hours => stage.hours)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  insert into private.calendar_communication_mail(
    event_id, user_id, kind, reminder_stage, revision, dedupe_key, subject, body, link
  )
  select event.id, participant.user_id, 'reminder', stage.hours, event.communication_revision,
    'calendar:reminder:' || event.id || ':participant:' || participant.id || ':' || stage.hours,
    'Rückmeldung zum Termin offen',
    'Bitte antworte auf die Einladung zu ' || event.title || ' bis zur Rückmeldefrist.',
    '/kalender?event=' || event.id
  from public.events event
  join public.event_participants participant on participant.event_id = event.id
  cross join (values (72), (24)) as stage(hours)
  where event.status = 'scheduled'
    and event.response_deadline > now()
    and event.response_deadline <= now() + make_interval(hours => stage.hours)
    and participant.status = 'open' and participant.reminder_enabled
    and participant.user_id is not null
    and private.account_is_active(participant.user_id)
    and participant.reminder_enabled_at <= event.response_deadline - make_interval(hours => stage.hours)
  on conflict (dedupe_key) do nothing;

  update private.calendar_communication_mail set failed_at = now()
  where sent_at is null and failed_at is null
    and (attempts >= 8 or first_attempt_at < now() - interval '23 hours');

  return query with batch as (
    select mail.id from private.calendar_communication_mail mail
    where mail.sent_at is null and mail.failed_at is null and mail.available_at <= now()
      and (mail.user_id is null or private.account_is_active(mail.user_id))
      and (mail.guardian_for is null or exists (
        select 1 from public.relationships relationship
        join public.guardian_approval_requests approval on approval.minor_user_id = mail.guardian_for
        where relationship.active and relationship.relationship_type = 'guardian'
          and relationship.guardian_user_id = mail.user_id
          and relationship.athlete_user_id = mail.guardian_for
          and approval.guardian_required_until > current_date
          and approval.status = 'approved'
      ))
      and (mail.kind <> 'reminder' or exists (
        select 1 from public.event_participants participant
        join public.events event on event.id = participant.event_id
        where participant.event_id = mail.event_id and participant.user_id = mail.user_id
          and participant.status = 'open' and participant.reminder_enabled
          and event.status = 'scheduled' and event.response_deadline > now()
      ))
    order by mail.created_at for update skip locked limit 20
  ), claimed as (
    update private.calendar_communication_mail mail set attempts = attempts + 1,
      first_attempt_at = coalesce(first_attempt_at, now()),
      available_at = now() + interval '5 minutes', lease_id = gen_random_uuid()
    from batch where mail.id = batch.id returning mail.*
  )
  select claimed.id, coalesce(claimed.recipient_email, profile.email), claimed.subject,
    claimed.body, claimed.link, claimed.lease_id
  from claimed left join public.profiles profile on profile.id = claimed.user_id;
end;
$$;

create function public.calendar_finish_mail(target uuid, lease uuid, success boolean)
returns void language sql security invoker set search_path = '' as $$
  update private.calendar_communication_mail set
    sent_at = case when success then now() else null end,
    available_at = now() + interval '5 minutes', lease_id = null
  where id = target and lease_id = lease;
$$;

-- Funktionsrechte werden nach dem Erstellen vollständig zurückgenommen und nur
-- den benötigten Rollen wieder erteilt.
do $$ declare function_row record; begin
  for function_row in
    select procedure.oid::regprocedure signature
    from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('private','public')
      and (procedure.proname like 'calendar_%' or procedure.proname in ('create_calendar_events','update_calendar_event','set_event_reminder','acknowledge_event_revision','delete_or_cancel_calendar_event','rotate_calendar_feed_token','revoke_calendar_feed_token'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', function_row.signature);
  end loop;
end $$;
grant usage on schema private to authenticated, service_role;
grant execute on function private.calendar_event_visible(uuid,uuid),
  private.calendar_event_owner(uuid,uuid), private.calendar_validate_links(jsonb),
  private.calendar_event_was_communicated(public.events) to authenticated;
grant execute on function public.create_calendar_events(jsonb,integer,jsonb),
  public.update_calendar_event(uuid,jsonb,text,boolean),
  public.set_event_reminder(uuid,boolean), public.acknowledge_event_revision(uuid,integer),
  public.delete_or_cancel_calendar_event(uuid), public.rotate_calendar_feed_token(text),
  public.revoke_calendar_feed_token() to authenticated;
grant execute on function public.calendar_claim_mail(),
  public.calendar_finish_mail(uuid,uuid,boolean) to service_role;

-- Bestehender Vault-/Cron-Aufbau wird wiederverwendet; ohne Konfiguration bleibt
-- der Scheduler sicher inaktiv. Der eigene Endpunkt verwässert nicht die enge
-- Fahrten-Linkprüfung des Carpool-Workers.
create function private.calendar_dispatch_mail_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare carpool_url text; worker_url text; worker_secret text;
begin
  select decrypted_secret into carpool_url from vault.decrypted_secrets where name = 'carpool_worker_url';
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'carpool_cron_secret';
  if carpool_url is null or worker_secret is null then
    raise warning 'Calendar mail scheduler is not configured'; return;
  end if;
  worker_url := regexp_replace(carpool_url, '/api/carpools/mail$', '/api/calendar-communications/mail');
  if worker_url !~ '^https://[^/]+/api/calendar-communications/mail$' then raise exception 'Invalid calendar worker URL'; end if;
  perform net.http_get(url := worker_url,
    headers := jsonb_build_object('Authorization','Bearer ' || worker_secret),
    timeout_milliseconds := 60000);
end;
$$;
revoke all on function private.calendar_dispatch_mail_worker() from public, anon, authenticated;
select cron.schedule('calendar-communication-mail-every-minute','* * * * *',
  'select private.calendar_dispatch_mail_worker()');
