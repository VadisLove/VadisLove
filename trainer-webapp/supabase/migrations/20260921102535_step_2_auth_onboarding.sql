-- Roadmap-Schritt 2: Der fachliche Onboarding-Status ist eine geschützte
-- Serverentscheidung. Auth-Metadaten bleiben deshalb ausschließlich
-- Eingabedaten und sind niemals ein Berechtigungsnachweis.
create type public.onboarding_status as enum (
  'incomplete',
  'awaiting_email_verification',
  'awaiting_guardian_approval',
  'personal_active',
  'deletion_due'
);

create table public.onboarding_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.onboarding_status not null default 'personal_active',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Der Zeitpunkt ist absichtlich an die Kontoerstellung gebunden: Login und
  -- Seitenaufrufe verlängern die 30-Tage-Frist nicht.
  cleanup_due_at timestamptz not null default (now() + interval '30 days'),
  check ((status = 'personal_active') = (completed_at is not null))
);

revoke all on table public.onboarding_accounts from anon, authenticated;
grant select on table public.onboarding_accounts to authenticated;
grant all on table public.onboarding_accounts to service_role;
alter table public.onboarding_accounts enable row level security;
create policy "onboarding_accounts_read_self"
  on public.onboarding_accounts for select to authenticated
  using (user_id = (select auth.uid()));

-- Neue Profile aus dem bestehenden vollständigen Registrierungsformular sind
-- persönlich aktiv; die unten erneuerte Aktivitätsprüfung sperrt Personen
-- unter 16 trotzdem bis zur Elternfreigabe. OAuth ohne Pflichtdaten wird erst
-- mit der später aktivierten Provider-Konfiguration als `incomplete` angelegt.
create or replace function private.create_initial_onboarding_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.onboarding_accounts (user_id, status, completed_at)
  values (new.id, 'personal_active', now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_initial_onboarding_account() from public, anon, authenticated;

drop trigger if exists create_initial_onboarding_account on public.profiles;
create trigger create_initial_onboarding_account
  after insert on public.profiles
  for each row execute function private.create_initial_onboarding_account();

-- Der Onboardingstatus folgt der Elternfreigabe transaktional. So kann weder
-- ein Netzwerkfehler noch ein noch gültiger Browser-Token den Fachzugriff vor
-- der bestätigten Freigabe öffnen.
create or replace function private.sync_guardian_onboarding_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.onboarding_accounts
  set
    status = case
      when new.status = 'approved' then 'personal_active'::public.onboarding_status
      else 'awaiting_guardian_approval'::public.onboarding_status
    end,
    completed_at = case when new.status = 'approved' then now() else null end
  where user_id = new.minor_user_id
    -- Sobald die Bereinigung atomar beansprucht wurde, darf eine parallel
    -- eintreffende Freigabe das Konto nicht wieder aktivieren.
    and status <> 'deletion_due';
  return new;
end;
$$;
revoke all on function private.sync_guardian_onboarding_state() from public, anon, authenticated;

drop trigger if exists sync_guardian_onboarding_state on public.guardian_approval_requests;
create trigger sync_guardian_onboarding_state
  after insert or update of status on public.guardian_approval_requests
  for each row execute function private.sync_guardian_onboarding_state();

-- Bestehende Konten werden bewusst nicht pauschal in eine neue Sperre
-- überführt. Für sie fehlen die für eine rückwirkende Altersentscheidung
-- erforderlichen Geburtsdaten; der belegbare Übergang ist daher der bisherige
-- Status. Neue Profile werden über den Trigger erfasst.

-- Die 16-Jahres-Grenze gilt ab dieser Migration für neue Registrierungen.
-- Das Geburtsdatum bleibt nur während der Triggertransaktion vorhanden.
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
    raise exception 'Current legal documents must be acknowledged.' using errcode = '22023';
  end if;
  begin
    declared_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
  exception when others then
    raise exception 'A valid birth date is required.' using errcode = '22007';
  end;
  if declared_birth_date is null or declared_birth_date > current_date
    or declared_birth_date < current_date - interval '110 years' then
    raise exception 'The supplied birth date is not plausible.' using errcode = '22023';
  end if;
  selected_account_type := case new.raw_user_meta_data ->> 'account_type'
    when 'athlete' then 'athlete'::public.account_type when 'trainer' then 'trainer'::public.account_type
    when 'medical' then 'medical'::public.account_type when 'guardian' then 'guardian'::public.account_type
    when 'organization_staff' then 'organization_staff'::public.account_type else 'unspecified'::public.account_type end;
  if selected_account_type = 'unspecified' then raise exception 'A valid account type is required.' using errcode = '22023'; end if;
  selected_display_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
  insert into public.profiles (id, display_name, first_name, email, account_type)
  values (new.id, selected_display_name, selected_display_name, coalesce(new.email, ''), selected_account_type);
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.legal_document_acceptances (subject_user_id, actor_user_id, actor_email, document_type, acceptance_kind, document_version)
  values (new.id, new.id, lower(coalesce(new.email, '')), 'terms', 'accepted', terms_version_constant),
         (new.id, new.id, lower(coalesce(new.email, '')), 'privacy_notice', 'acknowledged', privacy_version_constant);

  guardian_required_until := (declared_birth_date + interval '16 years')::date;
  if guardian_required_until > current_date then
    normalized_guardian_email := lower(btrim(coalesce(new.raw_user_meta_data ->> 'guardian_email', '')));
    supplied_token_hash := encode(extensions.gen_random_bytes(32), 'hex');
    if normalized_guardian_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or normalized_guardian_email = lower(coalesce(new.email, '')) then
      raise exception 'A different guardian email address is required.' using errcode = '22023';
    end if;
    insert into public.guardian_approval_requests (minor_user_id, guardian_email, guardian_user_id, guardian_required_until, token_hash, terms_version, privacy_version)
    select new.id, normalized_guardian_email, guardian.id, guardian_required_until, supplied_token_hash, terms_version_constant, privacy_version_constant
    from (values (1)) singleton(value) left join lateral (
      select profile.id from public.profiles profile where lower(profile.email) = normalized_guardian_email and profile.account_type = 'guardian' limit 1
    ) guardian on true;
  end if;

  -- Organisation ist freiwillig. Falls sie gewählt wurde, entsteht nur eine
  -- offene Anfrage; eine Rolle wird erst über den Einladungs-/Freigabeprozess
  -- vergeben.
  organization_value := new.raw_user_meta_data ->> 'registration_organization_id';
  if organization_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then selected_organization_id := organization_value::uuid; end if;
  if selected_organization_id is not null then
    select organization.level into selected_organization_level from public.organizations organization where organization.id = selected_organization_id;
    selected_role := case when selected_account_type = 'athlete' and selected_organization_level = 'club' then 'athlete'::public.member_role
      when selected_account_type = 'trainer' and selected_organization_level = 'club' then 'club_trainer'::public.member_role
      when selected_account_type = 'medical' and selected_organization_level = 'club' then 'medical'::public.member_role
      when selected_account_type = 'guardian' and selected_organization_level = 'club' then 'guardian'::public.member_role
      when selected_account_type = 'organization_staff' and selected_organization_level = 'state' then 'specialist'::public.member_role else null end;
    if selected_role is not null then insert into public.membership_requests (organization_id, user_id, requested_role, note)
      values (selected_organization_id, new.id, selected_role, 'Bei der Registrierung ausgewählt; Freigabe ausstehend.') on conflict do nothing; end if;
  end if;
  if selected_account_type = 'guardian' then
    update public.guardian_approval_requests approval set guardian_user_id = new.id, updated_at = now()
      where approval.guardian_email = lower(coalesce(new.email, '')) and approval.guardian_user_id is null;

    -- Eine bereits bestätigte Freigabe begründet erst mit dieser geprüften
    -- Beziehung Elternrechte. Die E-Mail allein bleibt ohne Berechtigung.
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
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - array['birth_date','guardian_email','guardian_approval_token_hash','legal_terms_accepted']::text[] where id = new.id;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Dieser Check ist die RLS-Sperre für neue Zustände. Ein gültiger Cookie oder
-- UI-Redirect genügt damit nie für Fachzugriff.
create or replace function private.account_is_active(target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user_id is not null
    and not exists (select 1 from public.account_deletion_requests deletion where deletion.user_id = target_user_id and deletion.status in ('scheduled', 'finalized'))
    and not exists (select 1 from public.onboarding_accounts onboarding where onboarding.user_id = target_user_id and onboarding.status <> 'personal_active')
    and not exists (select 1 from public.guardian_approval_requests approval where approval.minor_user_id = target_user_id and approval.guardian_required_until > current_date and approval.status <> 'approved');
$$;
revoke execute on function private.account_is_active(uuid) from public, anon, authenticated;
grant execute on function private.account_is_active(uuid) to service_role;

-- Der Worker beansprucht fällige Konten atomar. Bereits beanspruchte Konten
-- werden erneut geliefert, damit ein vorübergehender Auth-API-Fehler beim
-- nächsten Lauf sicher wiederholt werden kann. Fachzugriff ist ab dem Claim
-- auch für bereits ausgegebene JWTs per RLS gesperrt.
create or replace function public.claim_due_onboarding_cleanup(batch_size integer default 25)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select onboarding.user_id
    from public.onboarding_accounts onboarding
    where (
      onboarding.status = 'deletion_due'
      or (
        onboarding.status in (
          'incomplete',
          'awaiting_email_verification',
          'awaiting_guardian_approval'
        )
        and onboarding.cleanup_due_at <= now()
      )
    )
    order by onboarding.cleanup_due_at, onboarding.user_id
    for update skip locked
    limit least(greatest(coalesce(batch_size, 25), 1), 100)
  )
  update public.onboarding_accounts onboarding
  set status = 'deletion_due', completed_at = null
  from candidates
  where onboarding.user_id = candidates.user_id
  returning onboarding.user_id;
end;
$$;
revoke all on function public.claim_due_onboarding_cleanup(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_onboarding_cleanup(integer)
  to service_role;

select pg_notify('pgrst', 'reload schema');
