-- Minderjaehrige ab 13 Jahren duerfen ihr Konto selbst anlegen. Bis zum
-- 18. Geburtstag bleibt der fachliche Zugriff jedoch gesperrt, bis eine
-- erziehungsberechtigte Person die Registrierung ueber einen Einmallink
-- bestaetigt hat. Das Geburtsdatum wird bewusst nicht gespeichert; dauerhaft
-- benoetigt wird nur das Datum, ab dem keine Elternfreigabe mehr erforderlich ist.

create table public.guardian_approval_requests (
  id uuid primary key default gen_random_uuid(),
  minor_user_id uuid not null unique references public.profiles(id) on delete cascade,
  guardian_email text not null,
  guardian_user_id uuid references public.profiles(id) on delete set null,
  guardian_required_until date not null,
  status public.request_status not null default 'pending',
  token_hash text not null unique,
  guardian_display_name text,
  terms_version text not null,
  privacy_version text not null,
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  token_issued_at timestamptz,
  check (guardian_email = lower(btrim(guardian_email))),
  check (char_length(guardian_email) between 3 and 320),
  check (char_length(token_hash) = 64 and token_hash ~ '^[0-9a-f]+$'),
  check (guardian_required_until > created_at::date),
  check (guardian_display_name is null or char_length(btrim(guardian_display_name)) between 2 and 120),
  check (
    (status = 'pending' and responded_at is null)
    or (status in ('approved', 'rejected') and responded_at is not null)
    or status = 'withdrawn'
  )
);

create index guardian_approvals_guardian_pending_idx
  on public.guardian_approval_requests(guardian_email, created_at desc)
  where status = 'pending';
create index guardian_approvals_guardian_user_idx
  on public.guardian_approval_requests(guardian_user_id, created_at desc)
  where guardian_user_id is not null;
create index guardian_approvals_expiry_idx
  on public.guardian_approval_requests(expires_at)
  where status = 'pending';

-- Dokumentversionen und die handelnde Person werden getrennt protokolliert.
-- Eine Datenschutzinformation wird nur zur Kenntnis genommen; sie wird nicht
-- faelschlich als pauschale Einwilligung in Datenverarbeitungen behandelt.
create table public.legal_document_acceptances (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text not null,
  document_type text not null,
  acceptance_kind text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  check (actor_email = lower(btrim(actor_email))),
  check (char_length(actor_email) between 3 and 320),
  check (document_type in ('terms', 'privacy_notice')),
  check (acceptance_kind in ('accepted', 'acknowledged')),
  check (
    (document_type = 'terms' and acceptance_kind = 'accepted')
    or (document_type = 'privacy_notice' and acceptance_kind = 'acknowledged')
  ),
  check (char_length(document_version) between 1 and 80)
);

create unique index legal_acceptances_actor_document_idx
  on public.legal_document_acceptances(
    subject_user_id,
    coalesce(actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    actor_email,
    document_type,
    document_version
  );
create index legal_acceptances_subject_idx
  on public.legal_document_acceptances(subject_user_id, accepted_at desc);

revoke all on table public.guardian_approval_requests from anon, authenticated;
revoke all on table public.legal_document_acceptances from anon, authenticated;
grant select on table public.guardian_approval_requests to authenticated;
grant select on table public.legal_document_acceptances to authenticated;
grant all on table public.guardian_approval_requests to service_role;
grant all on table public.legal_document_acceptances to service_role;

alter table public.guardian_approval_requests enable row level security;
alter table public.legal_document_acceptances enable row level security;

create policy "guardian_approvals_read_related"
  on public.guardian_approval_requests
  for select
  to authenticated
  using (
    minor_user_id = (select auth.uid())
    or guardian_user_id = (select auth.uid())
  );

create policy "legal_acceptances_read_related"
  on public.legal_document_acceptances
  for select
  to authenticated
  using (
    subject_user_id = (select auth.uid())
    or actor_user_id = (select auth.uid())
  );

-- Der zentrale Aktivitaetscheck sperrt nicht freigegebene Minderjaehrige auch
-- innerhalb der RLS-Helfer. Nach dem 18. Geburtstag endet diese Sperre
-- automatisch, selbst wenn eine alte Anfrage noch offen ist.
create or replace function private.account_is_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and not exists (
      select 1
      from public.account_deletion_requests deletion
      where deletion.user_id = target_user_id
        and deletion.status in ('scheduled', 'finalized')
    )
    and not exists (
      select 1
      from public.guardian_approval_requests approval
      where approval.minor_user_id = target_user_id
        and approval.guardian_required_until > current_date
        and approval.status <> 'approved'
    );
$$;

revoke execute on function private.account_is_active(uuid)
  from public, anon, authenticated;
grant execute on function private.account_is_active(uuid) to service_role;

-- Ein UI-Redirect allein waere keine ausreichende Sperre: Ein angemeldetes
-- Konto koennte die REST-Schnittstelle sonst direkt ansprechen. Die
-- restriktive Policy wird zusaetzlich zu den bestehenden Fach-Policies
-- ausgewertet und sperrt alle Anwendungsdaten bis zur Elternfreigabe. Die
-- drei Workflow-Tabellen bleiben ausgenommen, damit Status, Freigabe und eine
-- bereits angestossene Kontoloeschung weiterhin bearbeitet werden koennen.
do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'account_invitations',
    'athlete_evaluation_contest_overrides',
    'athlete_evaluation_skill_ratings',
    'athlete_evaluations',
    'athlete_federation_affiliations',
    'athlete_personal_goals',
    'evaluation_skill_settings',
    'event_participants',
    'events',
    'group_invitations',
    'group_memberships',
    'membership_requests',
    'notification_preferences',
    'notifications',
    'organization_memberships',
    'organizations',
    'profile_audit_events',
    'profiles',
    'relationship_requests',
    'relationships',
    'social_groups',
    'trainer_athlete_assignments',
    'trainer_evaluation_settings',
    'training_exercise_demo_videos',
    'training_plan_shares',
    'training_plan_snapshot_shares',
    'training_plan_social_shares',
    'training_plan_versions',
    'training_plans',
    'training_trick_progress',
    'training_video_evidence'
  ]
  loop
    -- Ältere Installationen enthalten optionale Einladungstabellen noch nicht.
    if to_regclass(format('public.%I', protected_table)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', protected_table);
    execute format(
      'create policy "active_accounts_only" on public.%I as restrictive for all to authenticated using ((select private.current_account_is_active())) with check ((select private.current_account_is_active()))',
      protected_table
    );
  end loop;
end;
$$;

-- Die letzte Version des Auth-Triggers wird vollstaendig ersetzt, damit
-- Organisationsbeitritt, Benachrichtigungseinstellungen, Rechtsdokumente und
-- Elternfreigabe in derselben Transaktion entstehen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_account_type public.account_type;
  selected_organization_id uuid;
  selected_organization_level public.organization_level;
  selected_role public.member_role;
  organization_value text;
  selected_display_name text;
  declared_birth_date date;
  guardian_required_until date;
  normalized_guardian_email text;
  supplied_token_hash text;
  terms_version_constant constant text := 'draft-2026-09-01';
  privacy_version_constant constant text := 'draft-2026-09-01';
begin
  if coalesce(new.raw_user_meta_data ->> 'legal_terms_accepted', '') <> 'true'
    or (new.raw_user_meta_data ->> 'terms_version') is distinct from terms_version_constant
    or (new.raw_user_meta_data ->> 'privacy_version') is distinct from privacy_version_constant then
    raise exception 'Current legal documents must be acknowledged.'
      using errcode = '22023';
  end if;

  begin
    declared_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
  exception when others then
    raise exception 'A valid birth date is required.' using errcode = '22007';
  end;

  if declared_birth_date is null then
    raise exception 'A valid birth date is required.' using errcode = '22007';
  end if;

  if declared_birth_date > current_date - interval '13 years' then
    raise exception 'Registration is available from age 13.' using errcode = '22023';
  end if;
  if declared_birth_date < current_date - interval '110 years' then
    raise exception 'The supplied birth date is not plausible.' using errcode = '22023';
  end if;

  selected_account_type := case new.raw_user_meta_data ->> 'account_type'
    when 'athlete' then 'athlete'::public.account_type
    when 'trainer' then 'trainer'::public.account_type
    when 'medical' then 'medical'::public.account_type
    when 'guardian' then 'guardian'::public.account_type
    when 'organization_staff' then 'organization_staff'::public.account_type
    else 'unspecified'::public.account_type
  end;
  selected_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  insert into public.profiles (
    id,
    display_name,
    first_name,
    email,
    account_type
  )
  values (
    new.id,
    selected_display_name,
    selected_display_name,
    coalesce(new.email, ''),
    selected_account_type
  );

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.legal_document_acceptances (
    subject_user_id,
    actor_user_id,
    actor_email,
    document_type,
    acceptance_kind,
    document_version
  )
  values
    (new.id, new.id, lower(coalesce(new.email, '')), 'terms', 'accepted', terms_version_constant),
    (new.id, new.id, lower(coalesce(new.email, '')), 'privacy_notice', 'acknowledged', privacy_version_constant);

  guardian_required_until := (declared_birth_date + interval '18 years')::date;
  if guardian_required_until > current_date then
    normalized_guardian_email := lower(btrim(
      coalesce(new.raw_user_meta_data ->> 'guardian_email', '')
    ));
    -- Niemals einen vom registrierenden Konto gewählten Freigabetoken verwenden.
    -- Der Versandserver erhält später einen neuen, ausschließlich dort sichtbaren Token.
    supplied_token_hash := encode(extensions.gen_random_bytes(32), 'hex');

    if normalized_guardian_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or normalized_guardian_email = lower(coalesce(new.email, '')) then
      raise exception 'A different guardian email address is required.'
        using errcode = '22023';
    end if;
    if supplied_token_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'A guardian approval token is required.' using errcode = '22023';
    end if;

    insert into public.guardian_approval_requests (
      minor_user_id,
      guardian_email,
      guardian_user_id,
      guardian_required_until,
      token_hash,
      terms_version,
      privacy_version
    )
    select
      new.id,
      normalized_guardian_email,
      guardian.id,
      guardian_required_until,
      supplied_token_hash,
      terms_version_constant,
      privacy_version_constant
    from (values (1)) singleton(value)
    left join lateral (
      select profile.id
      from public.profiles profile
      where lower(profile.email) = normalized_guardian_email
        and profile.account_type = 'guardian'
      limit 1
    ) guardian on true;
  end if;

  organization_value := new.raw_user_meta_data ->> 'registration_organization_id';
  if organization_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    selected_organization_id := organization_value::uuid;
  end if;

  if selected_organization_id is not null then
    select organization.level
    into selected_organization_level
    from public.organizations organization
    where organization.id = selected_organization_id;

    selected_role := case
      when selected_account_type = 'athlete' and selected_organization_level = 'club'
        then 'athlete'::public.member_role
      when selected_account_type = 'trainer' and selected_organization_level = 'club'
        then 'club_trainer'::public.member_role
      when selected_account_type = 'medical' and selected_organization_level = 'club'
        then 'medical'::public.member_role
      when selected_account_type = 'guardian' and selected_organization_level = 'club'
        then 'guardian'::public.member_role
      when selected_account_type = 'organization_staff' and selected_organization_level = 'state'
        then 'specialist'::public.member_role
      else null
    end;

    if selected_role is not null then
      insert into public.membership_requests (
        organization_id,
        user_id,
        requested_role,
        note
      )
      values (
        selected_organization_id,
        new.id,
        selected_role,
        case
          when guardian_required_until > current_date
            then 'Bei der Registrierung ausgewählt; Elternfreigabe erforderlich.'
          else 'Bei der Registrierung ausgewählt.'
        end
      )
      on conflict do nothing;
    end if;
  end if;

  -- Registriert sich eine bereits angegebene erziehungsberechtigte Person
  -- spaeter, wird sie ohne Offenlegung weiterer Kinderdaten zugeordnet.
  if selected_account_type = 'guardian' then
    update public.guardian_approval_requests approval
    set
      guardian_user_id = new.id,
      updated_at = now()
    where approval.guardian_email = lower(coalesce(new.email, ''))
      and approval.guardian_user_id is null;

    insert into public.relationships (
      user_one_id,
      user_two_id,
      relationship_type,
      athlete_user_id,
      guardian_user_id
    )
    select
      least(approval.minor_user_id, new.id),
      greatest(approval.minor_user_id, new.id),
      'guardian'::public.relationship_type,
      approval.minor_user_id,
      new.id
    from public.guardian_approval_requests approval
    where approval.guardian_user_id = new.id
      and approval.status = 'approved'
    on conflict do nothing;
  end if;

  -- Einmalige Formulardaten werden nach der transaktionalen Auswertung aus
  -- den Auth-Metadaten entfernt. Insbesondere bleibt kein Geburtsdatum oder
  -- Klartext-/Hashmaterial des Freigabelinks am Auth-Nutzer gespeichert.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - array[
    'birth_date',
    'guardian_email',
    'guardian_approval_token_hash',
    'legal_terms_accepted'
  ]::text[]
  where id = new.id;

  return new;
end;
$$;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

-- Der Bearer-Token gibt nur den Namen des Kindes und den Anfragezustand frei.
-- E-Mail-Adresse oder weitere Profildaten werden niemals ausgegeben.
create or replace function public.get_guardian_approval(approval_token text)
returns table (
  minor_display_name text,
  approval_status public.request_status,
  approval_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.display_name,
    approval.status,
    approval.expires_at
  from public.guardian_approval_requests approval
  join public.profiles profile on profile.id = approval.minor_user_id
  where char_length(approval_token) between 32 and 256
    and approval.token_hash = encode(
      extensions.digest(approval_token, 'sha256'),
      'hex'
    )
  limit 1;
$$;

revoke all on function public.get_guardian_approval(text)
  from public, anon, authenticated;
grant execute on function public.get_guardian_approval(text)
  to anon, authenticated;

create or replace function public.respond_guardian_approval(
  approval_token text,
  response_status public.request_status,
  guardian_name text,
  accepted_terms_version text,
  acknowledged_privacy_version text
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval public.guardian_approval_requests%rowtype;
  linked_guardian_id uuid;
begin
  if response_status is null or response_status not in ('approved', 'rejected') then
    raise exception 'Invalid approval response.' using errcode = '22023';
  end if;
  if guardian_name is null or char_length(btrim(guardian_name)) not between 2 and 120 then
    raise exception 'A guardian name is required.' using errcode = '22023';
  end if;

  select request.*
  into approval
  from public.guardian_approval_requests request
  where char_length(approval_token) between 32 and 256
    and request.token_hash = encode(
      extensions.digest(approval_token, 'sha256'),
      'hex'
    )
  for update;

  if not found then
    raise exception 'Approval link not found.' using errcode = 'P0002';
  end if;
  if approval.status <> 'pending' then
    return approval.status;
  end if;
  if approval.expires_at <= now() then
    raise exception 'Approval link expired.' using errcode = '22023';
  end if;
  if accepted_terms_version is distinct from approval.terms_version
    or acknowledged_privacy_version is distinct from approval.privacy_version then
    raise exception 'Legal document version mismatch.' using errcode = '22023';
  end if;

  select profile.id
  into linked_guardian_id
  from public.profiles profile
  where lower(profile.email) = approval.guardian_email
    and profile.account_type = 'guardian'
  limit 1;

  update public.guardian_approval_requests request
  set
    status = response_status,
    guardian_user_id = coalesce(request.guardian_user_id, linked_guardian_id),
    guardian_display_name = btrim(guardian_name),
    responded_at = now(),
    updated_at = now()
  where request.id = approval.id;

  if response_status = 'approved' then
    insert into public.legal_document_acceptances (
      subject_user_id,
      actor_user_id,
      actor_email,
      document_type,
      acceptance_kind,
      document_version
    )
    values
      (
        approval.minor_user_id,
        linked_guardian_id,
        approval.guardian_email,
        'terms',
        'accepted',
        approval.terms_version
      ),
      (
        approval.minor_user_id,
        linked_guardian_id,
        approval.guardian_email,
        'privacy_notice',
        'acknowledged',
        approval.privacy_version
      )
    on conflict do nothing;

    if linked_guardian_id is not null then
      insert into public.relationships (
        user_one_id,
        user_two_id,
        relationship_type,
        athlete_user_id,
        guardian_user_id
      )
      values (
        least(approval.minor_user_id, linked_guardian_id),
        greatest(approval.minor_user_id, linked_guardian_id),
        'guardian'::public.relationship_type,
        approval.minor_user_id,
        linked_guardian_id
      )
      on conflict do nothing;
    end if;
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  values (
    approval.minor_user_id,
    linked_guardian_id,
    'guardian_activity'::public.notification_type,
    case
      when response_status = 'approved' then 'Registrierung freigegeben'
      else 'Registrierung nicht freigegeben'
    end,
    case
      when response_status = 'approved'
        then 'Deine erziehungsberechtigte Person hat die Registrierung bestätigt.'
      else 'Deine erziehungsberechtigte Person hat die Registrierung abgelehnt.'
    end,
    case when response_status = 'approved' then '/' else '/freigabe-ausstehend' end
  );

  return response_status;
end;
$$;

revoke all on function public.respond_guardian_approval(
  text,
  public.request_status,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.respond_guardian_approval(
  text,
  public.request_status,
  text,
  text,
  text
) to anon, authenticated;

-- Ausschließlich der vertrauenswürdige Versandserver darf einen Token erhalten.
-- Der Server ermittelt die Konto-ID beim Sign-up oder aus der geprüften Sitzung;
-- Browser und Minderjährige können diesen RPC auch direkt nicht ausführen.
create or replace function public.rotate_guardian_approval_token(target_minor_user_id uuid)
returns table (
  approval_token text,
  guardian_email text,
  minor_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text;
begin
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  return query
  update public.guardian_approval_requests approval
  set
    token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    expires_at = now() + interval '14 days',
    token_issued_at = now(),
    updated_at = now()
  where approval.minor_user_id = target_minor_user_id
    and (approval.token_issued_at is null or approval.token_issued_at < now() - interval '1 minute')
    and approval.status = 'pending'
    and approval.guardian_required_until > current_date
  returning
    raw_token,
    approval.guardian_email,
    (
      select profile.display_name
      from public.profiles profile
      where profile.id = approval.minor_user_id
    );
end;
$$;

revoke all on function public.rotate_guardian_approval_token(uuid)
  from public, anon, authenticated;
grant execute on function public.rotate_guardian_approval_token(uuid)
  to service_role;

select pg_notify('pgrst', 'reload schema');
