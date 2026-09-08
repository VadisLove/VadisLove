-- Schemaexport 08.09.2026, Supabase PostgreSQL 17.6.1.127.
-- Nur public/private-DDL, Policies und Grants; keine Nutzerdaten.
-- auth.users/auth.uid und Erweiterungsverträge liefert der Testrunner.
-- Keine produktive Migration: ausschließlich für isolierte Release-Tests.
create type public.account_deletion_status as enum ('scheduled','restored','finalized');
create type public.account_type as enum ('unspecified','athlete','trainer','medical','guardian','organization_staff');
create type public.attendance_status as enum ('open','confirmed','declined');
create type public.event_type as enum ('training','contest','medical','meeting');
create type public.group_member_role as enum ('owner','admin','member');
create type public.member_role as enum ('federal_chair','specialist','federal_trainer','state_trainer','club_trainer','athlete','guardian','medical','club_board');
create type public.notification_type as enum ('relationship_request','relationship_response','membership_request','membership_response','group_invitation','group_activity','event_created','training_plan_shared','guardian_activity','club_joined','club_left','federation_changed','federation_invalidated','account_deletion_scheduled','account_restored','account_finalized');
create type public.organization_level as enum ('federal','state','club');
create type public.profile_visibility as enum ('all_members','contacts','private');
create type public.relationship_type as enum ('friend','trainer_athlete','guardian');
create type public.request_status as enum ('pending','approved','rejected','withdrawn');
create type public.share_target_type as enum ('person','group');
create type public.training_demo_visibility as enum ('assigned','public');
create type public.training_evidence_review_status as enum ('pending','approved','changes_requested');
create type public.trick_progress_status as enum ('not_started','in_progress','awaiting_confirmation','confirmed');
create table public.account_deletion_requests (user_id uuid not null,status account_deletion_status not null default 'scheduled'::account_deletion_status,requested_at timestamp with time zone not null default now(),scheduled_for timestamp with time zone not null default (now() + '30 days'::interval),restored_at timestamp with time zone,finalized_at timestamp with time zone,external_cleanup_completed_at timestamp with time zone,avatar_path_snapshot text,updated_at timestamp with time zone not null default now());
create table public.athlete_evaluation_contest_overrides (evaluation_id uuid not null,event_id uuid not null,excluded boolean not null default false,category text not null default ''::text,placement integer,note text not null default ''::text,updated_at timestamp with time zone not null default now());
create table public.athlete_evaluation_skill_ratings (evaluation_id uuid not null,skill_key text not null,rating smallint not null,note text not null default ''::text,updated_at timestamp with time zone not null default now());
create table public.athlete_evaluations (id uuid not null default gen_random_uuid(),trainer_id uuid not null,athlete_id uuid not null,period_start date not null,period_end date not null,title text not null default ''::text,conversation_on date,squad text not null default ''::text,dalid_status text not null default ''::text,personal_notes text not null default ''::text,measures text not null default ''::text,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.athlete_federation_affiliations (id uuid not null default gen_random_uuid(),athlete_id uuid not null,federation_id uuid not null,active boolean not null default true,selected_at timestamp with time zone not null default now(),ended_at timestamp with time zone,invalidated_at timestamp with time zone,invalidation_reason text,created_at timestamp with time zone not null default now());
create table public.athlete_personal_goals (id uuid not null default gen_random_uuid(),athlete_id uuid not null,created_by uuid not null,title text not null,completed boolean not null default false,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.evaluation_skill_settings (trainer_id uuid not null,skill_key text not null,label text not null,category text not null,visible boolean not null default true,sort_order integer not null default 0,is_custom boolean not null default false,updated_at timestamp with time zone not null default now());
create table public.event_participants (id uuid not null default gen_random_uuid(),event_id uuid not null,user_id uuid,invited_email text not null,invited_by uuid not null,status attendance_status not null default 'open'::attendance_status,responded_at timestamp with time zone,created_at timestamp with time zone not null default now());
create table public.events (id uuid not null default gen_random_uuid(),organization_id uuid not null,created_by uuid not null,title text not null,description text not null default ''::text,type event_type not null,starts_at timestamp with time zone not null,ends_at timestamp with time zone not null,location text not null default ''::text,state_code character(2),region_name text,capacity integer not null default 0,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.group_invitations (id uuid not null default gen_random_uuid(),group_id uuid not null,invited_by uuid not null,invited_user_id uuid not null,status request_status not null default 'pending'::request_status,message text not null default ''::text,responded_at timestamp with time zone,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.group_memberships (id uuid not null default gen_random_uuid(),group_id uuid not null,user_id uuid not null,role group_member_role not null default 'member'::group_member_role,joined_at timestamp with time zone not null default now());
create table public.membership_requests (id uuid not null default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,requested_role member_role not null,status request_status not null default 'pending'::request_status,note text not null default ''::text,reviewed_by uuid,reviewed_at timestamp with time zone,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.notification_preferences (user_id uuid not null,relationship_requests boolean not null default true,request_updates boolean not null default true,group_activity boolean not null default true,new_events boolean not null default true,training_plans boolean not null default true,guardian_activity boolean not null default true,updated_at timestamp with time zone not null default now());
create table public.notifications (id uuid not null default gen_random_uuid(),user_id uuid not null,actor_user_id uuid,type notification_type not null,title text not null,message text not null,link text not null default '/postfach'::text,read_at timestamp with time zone,created_at timestamp with time zone not null default now());
create table public.organization_memberships (id uuid not null default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,role member_role not null,created_at timestamp with time zone not null default now(),assigned_by uuid,updated_at timestamp with time zone not null default now());
create table public.organizations (id uuid not null default gen_random_uuid(),parent_id uuid,name text not null,level organization_level not null,state_code character(2),region_name text,created_at timestamp with time zone not null default now(),created_by uuid,updated_at timestamp with time zone not null default now());
create table public.profile_audit_events (id uuid not null default gen_random_uuid(),event_type text not null,actor_user_id uuid,subject_user_id uuid,organization_id uuid,old_values jsonb not null default '{}'::jsonb,new_values jsonb not null default '{}'::jsonb,created_at timestamp with time zone not null default now());
create table public.profiles (id uuid not null,display_name text not null,email text not null,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now(),account_type account_type not null,first_name text not null default ''::text,last_name text not null default ''::text,phone text,location text,bio text,disciplines text[] not null default '{}'::text[],visibility profile_visibility not null default 'all_members'::profile_visibility,avatar_path text);
create table public.relationship_requests (id uuid not null default gen_random_uuid(),sender_user_id uuid not null,recipient_user_id uuid not null,relationship_type relationship_type not null,trainer_user_id uuid,athlete_user_id uuid,guardian_user_id uuid,status request_status not null default 'pending'::request_status,message text not null default ''::text,responded_at timestamp with time zone,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.relationships (id uuid not null default gen_random_uuid(),user_one_id uuid not null,user_two_id uuid not null,relationship_type relationship_type not null,trainer_user_id uuid,athlete_user_id uuid,guardian_user_id uuid,created_by_request_id uuid,active boolean not null default true,created_at timestamp with time zone not null default now(),ended_at timestamp with time zone);
create table public.social_groups (id uuid not null default gen_random_uuid(),name text not null,description text not null default ''::text,created_by uuid not null,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.trainer_athlete_assignments (id uuid not null default gen_random_uuid(),organization_id uuid not null,trainer_user_id uuid not null,athlete_user_id uuid not null,assigned_by uuid not null,active boolean not null default true,created_at timestamp with time zone not null default now(),ended_at timestamp with time zone);
create table public.trainer_evaluation_settings (trainer_id uuid not null,attendance_weight smallint not null default 40,contest_weight smallint not null default 30,task_weight smallint not null default 20,skill_weight smallint not null default 10,updated_at timestamp with time zone not null default now());
create table public.training_exercise_demo_videos (id uuid not null default gen_random_uuid(),origin_snapshot_share_id uuid not null,source_plan_id text not null,trick_id text not null,created_by uuid not null,provider text not null,video_id text not null,title text not null,trainer_note text not null default ''::text,visibility training_demo_visibility not null default 'assigned'::training_demo_visibility,created_at timestamp with time zone not null default now());
create table public.training_plan_shares (id uuid not null default gen_random_uuid(),training_plan_id uuid not null,target_organization_id uuid not null,shared_by uuid not null,created_at timestamp with time zone not null default now());
create table public.training_plan_snapshot_shares (id uuid not null default gen_random_uuid(),shared_by uuid not null,target_type share_target_type not null,recipient_user_id uuid,group_id uuid,title text not null,plan_snapshot jsonb not null,created_at timestamp with time zone not null default now());
create table public.training_plan_social_shares (id uuid not null default gen_random_uuid(),training_plan_id uuid not null,shared_by uuid not null,target_type share_target_type not null,recipient_user_id uuid,group_id uuid,created_at timestamp with time zone not null default now());
create table public.training_plan_versions (id uuid not null default gen_random_uuid(),training_plan_id uuid not null,version_number integer not null,content jsonb not null default '{}'::jsonb,created_by uuid not null,created_at timestamp with time zone not null default now());
create table public.training_plans (id uuid not null default gen_random_uuid(),organization_id uuid not null,created_by uuid not null,title text not null,category text not null default ''::text,created_at timestamp with time zone not null default now(),updated_at timestamp with time zone not null default now());
create table public.training_trick_progress (id uuid not null default gen_random_uuid(),snapshot_share_id uuid not null,trick_id text not null,athlete_id uuid not null,status trick_progress_status not null default 'not_started'::trick_progress_status,confirmed_by uuid,confirmed_at timestamp with time zone,updated_at timestamp with time zone not null default now());
create table public.training_video_evidence (id uuid not null default gen_random_uuid(),snapshot_share_id uuid not null,trick_id text not null,athlete_id uuid not null,provider text not null,video_id text not null,athlete_comment text not null default ''::text,attempt_count integer not null,self_rating smallint not null,submitted_at timestamp with time zone not null default now(),review_status training_evidence_review_status not null default 'pending'::training_evidence_review_status,trainer_feedback text not null default ''::text,reviewed_by uuid,reviewed_at timestamp with time zone);
CREATE OR REPLACE FUNCTION private.account_is_active(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select target_user_id is not null
    and not exists (
      select 1
      from public.account_deletion_requests deletion
      where deletion.user_id = target_user_id
        and deletion.status in ('scheduled', 'finalized')
    );
$function$
;
CREATE OR REPLACE FUNCTION private.add_event_creator_as_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null
    and new.created_by <> (select auth.uid()) then
    raise exception 'Event creator must match the authenticated account.'
      using errcode = '42501';
  end if;

  insert into public.event_participants (
    event_id,
    user_id,
    invited_email,
    invited_by,
    status,
    responded_at
  )
  select
    new.id,
    profile.id,
    lower(btrim(profile.email)),
    profile.id,
    'confirmed'::public.attendance_status,
    now()
  from public.profiles profile
  where profile.id = new.created_by
  on conflict (event_id, invited_email) do update
    set user_id = excluded.user_id,
        status = 'confirmed'::public.attendance_status,
        responded_at = excluded.responded_at;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.add_group_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.apply_approved_membership_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'pending' and new.status = 'approved' then
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      assigned_by
    )
    values (
      new.organization_id,
      new.user_id,
      new.requested_role,
      new.reviewed_by
    )
    on conflict (organization_id, user_id, role) do nothing;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.apply_relationship_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sender_name text;
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    new.responded_at := coalesce(new.responded_at, now());

    if new.status = 'approved' and not exists (
      select 1
      from public.relationships relationship
      where relationship.user_one_id = least(new.sender_user_id, new.recipient_user_id)
        and relationship.user_two_id = greatest(new.sender_user_id, new.recipient_user_id)
        and relationship.relationship_type = new.relationship_type
        and relationship.active
    ) then
      insert into public.relationships (
        user_one_id,
        user_two_id,
        relationship_type,
        trainer_user_id,
        athlete_user_id,
        guardian_user_id,
        created_by_request_id
      )
      values (
        least(new.sender_user_id, new.recipient_user_id),
        greatest(new.sender_user_id, new.recipient_user_id),
        new.relationship_type,
        new.trainer_user_id,
        new.athlete_user_id,
        new.guardian_user_id,
        new.id
      );
    end if;

    select display_name into sender_name
    from public.profiles where id = new.recipient_user_id;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      link
    )
    select
      new.sender_user_id,
      new.recipient_user_id,
      'relationship_response',
      case when new.status = 'approved' then 'Anfrage angenommen' else 'Anfrage abgelehnt' end,
      sender_name || case
        when new.status = 'approved' then ' hat deine Anfrage angenommen.'
        else ' hat deine Anfrage abgelehnt.'
      end,
      '/postfach'
    where coalesce((
      select preference.request_updates
      from public.notification_preferences preference
      where preference.user_id = new.sender_user_id
    ), true);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.are_connected(first_user_id uuid, second_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and first_user_id is not null
    and second_user_id is not null
    and exists (
      select 1
      from public.relationships relationship
      where relationship.active
        and relationship.user_one_id = least(first_user_id, second_user_id)
        and relationship.user_two_id = greatest(first_user_id, second_user_id)
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_assign_athlete(scope_organization_id uuid, trainer_id uuid, athlete_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select trainer_id = auth.uid()
    and exists (
      select 1
      from public.organization_memberships trainer_membership
      where trainer_membership.user_id = trainer_id
        and trainer_membership.organization_id = scope_organization_id
        and trainer_membership.role in (
          'federal_trainer', 'state_trainer', 'club_trainer'
        )
    )
    and exists (
      select 1
      from public.organization_memberships athlete_membership
      where athlete_membership.user_id = athlete_id
        and athlete_membership.role = 'athlete'
        and private.organization_is_same_or_descendant(
          scope_organization_id,
          athlete_membership.organization_id
        )
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_assign_membership(target_organization_id uuid, target_role member_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organizations target_organization
    join public.organization_memberships actor_membership
      on actor_membership.user_id = (select auth.uid())
    join public.organizations actor_organization
      on actor_organization.id = actor_membership.organization_id
    where target_organization.id = target_organization_id
      and (
        (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'federal_chair'
          and target_role in ('federal_chair', 'federal_trainer', 'medical')
        )
        or (
          target_organization.parent_id = actor_organization.id
          and actor_membership.role = 'federal_chair'
          and target_role in ('specialist', 'state_trainer', 'medical')
        )
        or (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'specialist'
          and target_role in ('specialist', 'state_trainer', 'medical')
        )
        or (
          target_organization.parent_id = actor_organization.id
          and actor_membership.role = 'specialist'
          and target_role in (
            'club_board',
            'club_trainer',
            'athlete',
            'guardian',
            'medical'
          )
        )
        or (
          actor_organization.id = target_organization.id
          and actor_membership.role = 'club_board'
          and target_role in (
            'club_board',
            'club_trainer',
            'athlete',
            'guardian',
            'medical'
          )
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION private.can_create_event(target_organization_id uuid, target_event_type event_type)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.organization_id = target_organization_id
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_create_organization(parent_organization_id uuid, target_level organization_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organizations parent_organization
    join public.organization_memberships membership
      on membership.organization_id = parent_organization.id
    where parent_organization.id = parent_organization_id
      and membership.user_id = auth.uid()
      and (
        (
          parent_organization.level = 'federal'
          and target_level = 'state'
          and membership.role = 'federal_chair'
        )
        or (
          parent_organization.level = 'state'
          and target_level = 'club'
          and membership.role = 'specialist'
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION private.can_manage_group(target_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = auth.uid()
        and membership.role in ('owner', 'admin')
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_manage_organization(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.organizations target_organization
      on target_organization.id = target_organization_id
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and (
        (target_organization.level = 'federal' and membership.role = 'federal_chair')
        or (target_organization.level = 'state' and membership.role = 'specialist')
        or (target_organization.level = 'club' and membership.role = 'club_board')
      )
  )
  or exists (
    select 1
    from public.organization_memberships membership
    join public.organizations source_organization
      on source_organization.id = membership.organization_id
    join public.organizations target_organization
      on target_organization.id = target_organization_id
    where membership.user_id = auth.uid()
      and target_organization.parent_id = source_organization.id
      and (
        (
          source_organization.level = 'federal'
          and target_organization.level = 'state'
          and membership.role = 'federal_chair'
        )
        or (
          source_organization.level = 'state'
          and target_organization.level = 'club'
          and membership.role = 'specialist'
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_event_organization(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
    and (
      -- Beibehaltung der bisherigen Sicht nach unten und für direkte Mitglieder.
      private.can_view_organization(target_organization_id)
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.user_id = auth.uid()
          -- Liegt die eigene Organisation unterhalb des Termin-Verbandes,
          -- darf das Mitglied dessen Termin ebenfalls sehen.
          and private.organization_is_same_or_descendant(
            target_organization_id,
            membership.organization_id
          )
      )
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_organization(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.user_id = auth.uid()
      and private.organization_is_same_or_descendant(
        membership.organization_id,
        target_organization_id
      )
      and membership.role in (
        'federal_chair',
        'specialist',
        'federal_trainer',
        'state_trainer',
        'club_board',
        'club_trainer'
      )
  )
  or private.is_organization_member(target_organization_id);
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_profile(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.current_account_is_active()
    and private.account_is_active(target_user_id)
    and exists (
      select 1
      from public.profiles target_profile
      where target_profile.id = target_user_id
        and (
          target_profile.visibility = 'all_members'
          or (
            target_profile.visibility = 'contacts'
            and private.are_connected((select auth.uid()), target_user_id)
          )
          or exists (
            select 1
            from public.organization_memberships target_membership
            where target_membership.user_id = target_user_id
              and private.can_manage_organization(
                target_membership.organization_id
              )
          )
        )
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_profile_contact_data(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.current_account_is_active()
    and private.account_is_active(target_user_id)
    and (
      target_user_id = (select auth.uid())
      or private.are_connected((select auth.uid()), target_user_id)
      or exists (
        select 1
        from public.organization_memberships target_membership
        where target_membership.user_id = target_user_id
          and private.can_manage_organization(
            target_membership.organization_id
          )
      )
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_shared_training_plan(target_plan_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.training_plan_social_shares social_share
      where social_share.training_plan_id = target_plan_id
        and (
          social_share.recipient_user_id = auth.uid()
          or (
            social_share.group_id is not null
            and exists (
              select 1
              from public.group_memberships membership
              where membership.group_id = social_share.group_id
                and membership.user_id = auth.uid()
            )
          )
        )
    );
$function$
;
CREATE OR REPLACE FUNCTION private.can_view_social_activity(actor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and (
      actor_id = auth.uid()
      or private.are_connected(auth.uid(), actor_id)
      or private.shares_group_with(auth.uid(), actor_id)
    );
$function$
;
CREATE OR REPLACE FUNCTION public.create_club_organization(state_organization_id uuid, club_name text, club_region_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  inherited_state_code char(2);
  normalized_name text := btrim(club_name);
  normalized_region_name text := nullif(btrim(club_region_name), '');
  created_club_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select organization.state_code
  into inherited_state_code
  from public.organizations organization
  where organization.id = state_organization_id
    and organization.level = 'state';

  if not found or inherited_state_code is null then
    raise exception 'State organization was not found.' using errcode = '22023';
  end if;

  -- Nur eine bestätigte Fachwart-Mitgliedschaft im exakt ausgewählten
  -- Landesverband berechtigt zum Anlegen des untergeordneten Vereins.
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = state_organization_id
      and membership.user_id = actor_id
      and membership.role = 'specialist'
  ) then
    raise exception 'Not allowed to create this club organization.'
      using errcode = '42501';
  end if;

  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Invalid club name.' using errcode = '22023';
  end if;

  if normalized_region_name is not null
    and char_length(normalized_region_name) > 120 then
    raise exception 'Invalid club region.' using errcode = '22023';
  end if;

  begin
    insert into public.organizations (
      parent_id,
      name,
      level,
      state_code,
      region_name,
      created_by
    )
    values (
      state_organization_id,
      normalized_name,
      'club',
      inherited_state_code,
      normalized_region_name,
      actor_id
    )
    returning id into created_club_id;
  exception
    when unique_violation then
      raise exception 'Club organization already exists.' using errcode = '23505';
  end;

  return created_club_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_state_organization_with_specialist(parent_organization_id uuid, organization_name text, organization_state_code text, specialist_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  specialist_id uuid;
  created_organization_id uuid;
  normalized_name text := btrim(organization_name);
  normalized_state_code text := upper(btrim(organization_state_code));
  normalized_email text := lower(btrim(specialist_email));
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.can_create_organization(parent_organization_id, 'state') then
    raise exception 'Not allowed to create this state organization.';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 120 then
    raise exception 'Invalid organization name.';
  end if;
  if char_length(normalized_state_code) <> 2 then
    raise exception 'Invalid state code.';
  end if;
  if exists (
    select 1
    from public.organizations organization
    where organization.parent_id = parent_organization_id
      and organization.level = 'state'
      and organization.state_code = normalized_state_code
  ) then
    raise exception 'State organization already exists.';
  end if;

  select profile.id
  into specialist_id
  from public.profiles profile
  where lower(profile.email) = normalized_email
    and profile.account_type = 'organization_staff'
  limit 1;
  if specialist_id is null then
    raise exception 'Specialist profile was not found.';
  end if;

  insert into public.organizations (
    parent_id,
    name,
    level,
    state_code,
    created_by
  )
  values (
    parent_organization_id,
    normalized_name,
    'state',
    normalized_state_code,
    actor_id
  )
  returning id into created_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    assigned_by
  )
  values (
    created_organization_id,
    specialist_id,
    'specialist',
    actor_id
  );
  return created_organization_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.current_account_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
    and private.account_is_active((select auth.uid()));
$function$
;
CREATE OR REPLACE FUNCTION private.current_profile_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select profile.email
  from public.profiles profile
  where profile.id = (select auth.uid())
    and private.current_account_is_active();
$function$
;
CREATE OR REPLACE FUNCTION public.finalize_due_account_deletion(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  deletion public.account_deletion_requests%rowtype;
  former_name text;
  anonymized_email text;
begin
  select request.*
  into deletion
  from public.account_deletion_requests request
  where request.user_id = p_user_id
  for update;

  if not found
    or deletion.status <> 'scheduled'
    or deletion.scheduled_for > now() then
    raise exception 'Account deletion is not due.' using errcode = '22023';
  end if;

  select profile.display_name
  into former_name
  from public.profiles profile
  where profile.id = p_user_id
  for update;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    manager.user_id,
    null,
    'account_finalized'::public.notification_type,
    'Profil anonymisiert',
    'Ein zuvor angekuendigtes Profil wurde nach Ablauf der Wiederherstellungsfrist anonymisiert.',
    '/organisation'
  from public.organization_memberships subject_membership
  join public.organization_memberships manager
    on manager.organization_id = subject_membership.organization_id
  join public.organizations organization
    on organization.id = manager.organization_id
  where subject_membership.user_id = p_user_id
    and manager.user_id <> p_user_id
    and (
      (organization.level = 'federal' and manager.role = 'federal_chair')
      or (organization.level = 'state' and manager.role = 'specialist')
      or (organization.level = 'club' and manager.role = 'club_board')
    );

  insert into public.profile_audit_events (
    event_type,
    subject_user_id,
    old_values,
    new_values
  )
  values (
    'account_finalized',
    p_user_id,
    '{}'::jsonb,
    jsonb_build_object('finalized_at', now(), 'anonymized', true)
  );

  perform set_config(
    'trainer_hub.membership_delete_workflow',
    'account_finalization',
    true
  );

  delete from public.organization_memberships where user_id = p_user_id;
  delete from public.membership_requests where user_id = p_user_id;
  delete from public.relationship_requests
    where sender_user_id = p_user_id or recipient_user_id = p_user_id;
  delete from public.relationships
    where user_one_id = p_user_id or user_two_id = p_user_id;
  delete from public.group_memberships where user_id = p_user_id;
  delete from public.group_invitations
    where invited_user_id = p_user_id or invited_by = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;
  delete from public.notifications
    where user_id = p_user_id or actor_user_id = p_user_id;

  -- Veranstaltungszuordnungen bleiben fuer Auswertungen bestehen, enthalten
  -- nach der Anonymisierung aber keine zusaetzliche Einladungsadresse mehr.
  update public.event_participants
  set invited_email = null
  where user_id = p_user_id;

  anonymized_email :=
    'deleted-' ||
    left(encode(digest(p_user_id::text, 'sha256'), 'hex'), 20) ||
    '@invalid.local';

  update public.profiles
  set
    display_name = 'Geloeschtes Konto',
    first_name = 'Geloeschtes Konto',
    last_name = '',
    email = anonymized_email,
    account_type = 'unspecified',
    phone = null,
    location = null,
    bio = null,
    disciplines = '{}',
    visibility = 'private',
    avatar_path = null,
    updated_at = now()
  where id = p_user_id;

  update public.account_deletion_requests
  set
    status = 'finalized',
    finalized_at = now(),
    updated_at = now()
  where user_id = p_user_id;

  return deletion.avatar_path_snapshot;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_current_profile_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select private.current_profile_email();
$function$
;
CREATE OR REPLACE FUNCTION public.get_own_profile()
 RETURNS TABLE(id uuid, first_name text, last_name text, display_name text, email text, phone text, location text, bio text, disciplines text[], visibility profile_visibility, avatar_path text, account_type account_type)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.display_name,
    profile.email,
    profile.phone,
    profile.location,
    profile.bio,
    profile.disciplines,
    profile.visibility,
    profile.avatar_path,
    profile.account_type
  from public.profiles profile
  where profile.id = (select auth.uid())
    and private.current_account_is_active();
$function$
;
CREATE OR REPLACE FUNCTION public.get_people_directory()
 RETURNS TABLE(id uuid, display_name text, email text, account_type account_type, roles member_role[], states text[], clubs text[], active_relationships relationship_type[], pending_sent relationship_type[], pending_received relationship_type[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    profile.id,
    profile.display_name,
    case
      when private.are_connected((select auth.uid()), profile.id)
      then profile.email
      else ''
    end,
    profile.account_type,
    coalesce((
      select array_agg(distinct membership.role order by membership.role)
      from public.organization_memberships membership
      where membership.user_id = profile.id
    ), '{}'::public.member_role[]),
    coalesce((
      select array_agg(distinct state_organization.name order by state_organization.name)
      from public.organization_memberships membership
      join public.organizations organization
        on organization.id = membership.organization_id
      join public.organizations state_organization on (
        (organization.level = 'state' and state_organization.id = organization.id)
        or (
          organization.level = 'club'
          and state_organization.id = organization.parent_id
          and state_organization.level = 'state'
        )
      )
      where membership.user_id = profile.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(distinct organization.name order by organization.name)
      from public.organization_memberships membership
      join public.organizations organization
        on organization.id = membership.organization_id
      where membership.user_id = profile.id
        and organization.level = 'club'
    ), '{}'::text[]),
    coalesce((
      select array_agg(distinct relationship.relationship_type order by relationship.relationship_type)
      from public.relationships relationship
      where relationship.active
        and (select auth.uid()) in (
          relationship.user_one_id,
          relationship.user_two_id
        )
        and profile.id in (
          relationship.user_one_id,
          relationship.user_two_id
        )
    ), '{}'::public.relationship_type[]),
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.sender_user_id = (select auth.uid())
        and request.recipient_user_id = profile.id
    ), '{}'::public.relationship_type[]),
    coalesce((
      select array_agg(distinct request.relationship_type order by request.relationship_type)
      from public.relationship_requests request
      where request.status = 'pending'
        and request.recipient_user_id = (select auth.uid())
        and request.sender_user_id = profile.id
    ), '{}'::public.relationship_type[])
  from public.profiles profile
  where (select auth.uid()) is not null
    and profile.id <> (select auth.uid())
    and private.can_view_profile(profile.id)
  order by profile.display_name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_registration_organizations()
 RETURNS TABLE(id uuid, name text, level organization_level, state_code character, region_name text, parent_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    organization.id,
    organization.name,
    organization.level,
    organization.state_code,
    organization.region_name,
    parent.name
  from public.organizations organization
  left join public.organizations parent on parent.id = organization.parent_id
  where organization.level in ('state', 'club')
  order by
    case organization.level when 'state' then 1 else 2 end,
    coalesce(organization.region_name, organization.name),
    organization.name;
$function$
;
CREATE OR REPLACE FUNCTION public.get_training_xp_leaderboard()
 RETURNS TABLE(user_id uuid, display_name text, xp_total integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with visible_athletes as (
    select profile.id, profile.display_name
    from public.profiles profile
    where private.current_account_is_active()
      and (
        profile.account_type = 'athlete'
        or exists (
          select 1
          from public.organization_memberships membership
          where membership.user_id = profile.id
            and membership.role = 'athlete'
        )
      )
      and (
        profile.id = (select auth.uid())
        or exists (
          select 1
          from public.relationships relationship
          where relationship.active
            and relationship.relationship_type = 'trainer_athlete'
            and (select auth.uid()) in (
              relationship.user_one_id,
              relationship.user_two_id
            )
            and profile.id in (
              relationship.user_one_id,
              relationship.user_two_id
            )
        )
        or exists (
          select 1
          from public.group_memberships own_membership
          join public.group_memberships athlete_membership
            on athlete_membership.group_id = own_membership.group_id
          where own_membership.user_id = (select auth.uid())
            and athlete_membership.user_id = profile.id
        )
      )
  )
  select
    athlete.id,
    athlete.display_name,
    (count(progress.id) filter (where progress.status = 'confirmed') * 100)::integer
  from visible_athletes athlete
  left join public.training_trick_progress progress
    on progress.athlete_id = athlete.id
  group by athlete.id, athlete.display_name
  order by 3 desc, athlete.display_name;
$function$
;
CREATE OR REPLACE FUNCTION private.guard_membership_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null
    and coalesce(
      current_setting('trainer_hub.membership_delete_workflow', true),
      ''
    ) not in ('leave_club', 'account_finalization') then
    raise exception 'Memberships must be removed through a secured workflow.'
      using errcode = '42501';
  end if;
  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  selected_account_type public.account_type;
  selected_organization_id uuid;
  selected_organization_level public.organization_level;
  selected_role public.member_role;
  organization_value text;
  selected_display_name text;
begin
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
        'Bei der Registrierung ausgewählt.'
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.has_active_trainer_athlete_relationship(p_trainer_id uuid, p_athlete_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_trainer_id = (select auth.uid())
    and private.is_trainer_profile(p_trainer_id)
    and exists (
      select 1
      from public.relationships relationship
      where relationship.active
        and relationship.relationship_type = 'trainer_athlete'
        and p_trainer_id in (relationship.user_one_id, relationship.user_two_id)
        and p_athlete_id in (relationship.user_one_id, relationship.user_two_id)
    );
$function$
;
CREATE OR REPLACE FUNCTION private.initialize_training_trick_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  has_explicit_assignment boolean;
begin
  if new.target_type <> 'person' or new.recipient_user_id is null then
    return new;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(
      coalesce(new.plan_snapshot->'tricks', '[]'::jsonb)
    ) assigned_trick(value)
    where assigned_trick.value->>'athleteId' = new.recipient_user_id::text
  ) into has_explicit_assignment;

  insert into public.training_trick_progress (
    snapshot_share_id,
    trick_id,
    athlete_id,
    status,
    confirmed_by,
    confirmed_at
  )
  select
    new.id,
    trick.value->>'id',
    new.recipient_user_id,
    case
      when not has_explicit_assignment then 'not_started'::public.trick_progress_status
      when trick.value->>'status' in (
        'not_started', 'in_progress', 'awaiting_confirmation', 'confirmed'
      ) then (trick.value->>'status')::public.trick_progress_status
      else 'not_started'::public.trick_progress_status
    end,
    case
      when has_explicit_assignment and trick.value->>'status' = 'confirmed'
        then new.shared_by
      else null
    end,
    case
      when has_explicit_assignment and trick.value->>'status' = 'confirmed'
        then now()
      else null
    end
  from jsonb_array_elements(
    coalesce(new.plan_snapshot->'tricks', '[]'::jsonb)
  ) trick(value)
  where trick.value->>'id' is not null
    and (
      not has_explicit_assignment
      or trick.value->>'athleteId' = new.recipient_user_id::text
    )
  on conflict (snapshot_share_id, trick_id) do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.invalidate_federation_after_membership_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  state_id uuid;
  invalidated_affiliation_id uuid;
  athlete_name text;
  state_name text;
begin
  select club.parent_id
  into state_id
  from public.organizations club
  where club.id = old.organization_id
    and club.level = 'club';

  if state_id is null or exists (
    select 1
    from public.organization_memberships remaining_membership
    join public.organizations remaining_club
      on remaining_club.id = remaining_membership.organization_id
    where remaining_membership.user_id = old.user_id
      and remaining_club.level = 'club'
      and remaining_club.parent_id = state_id
  ) then
    return old;
  end if;

  update public.athlete_federation_affiliations affiliation
  set
    active = false,
    ended_at = now(),
    invalidated_at = now(),
    invalidation_reason = 'last_eligible_club_left'
  where affiliation.athlete_id = old.user_id
    and affiliation.federation_id = state_id
    and affiliation.active
  returning affiliation.id into invalidated_affiliation_id;

  if invalidated_affiliation_id is null then
    return old;
  end if;

  select profile.display_name, federation.name
  into athlete_name, state_name
  from public.profiles profile
  cross join public.organizations federation
  where profile.id = old.user_id
    and federation.id = state_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'federation_invalidated',
    (select auth.uid()),
    old.user_id,
    state_id,
    jsonb_build_object(
      'affiliation_id', invalidated_affiliation_id,
      'federation_id', state_id,
      'active', true
    ),
    jsonb_build_object(
      'active', false,
      'reason', 'last_eligible_club_left',
      'invalidated_at', now()
    )
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    (select auth.uid()),
    'federation_invalidated'::public.notification_type,
    'Startverband nicht mehr gueltig',
    athlete_name || ' hat keine aktive Vereinsmitgliedschaft mehr in ' ||
      state_name || '.',
    '/profil#startverband'
  from (
    select old.user_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    ) or (
      membership.organization_id = old.organization_id
      and membership.role = 'club_board'
    )
  ) recipient
  where recipient.user_id is not null;

  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_group_member(target_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_memberships membership
      where membership.group_id = target_group_id
        and membership.user_id = auth.uid()
    );
$function$
;
CREATE OR REPLACE FUNCTION private.is_organization_member(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$function$
;
CREATE OR REPLACE FUNCTION private.is_trainer_profile(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and (
        profile.account_type = 'trainer'
        or exists (
          select 1
          from public.organization_memberships membership
          where membership.user_id = profile.id
            and membership.role in ('federal_trainer', 'state_trainer', 'club_trainer')
        )
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.leave_club_membership(p_club_id uuid, p_confirmed boolean)
 RETURNS TABLE(federation_became_invalid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  state_id uuid;
  club_name text;
  actor_name text;
  removed_roles public.member_role[];
  had_active_federation boolean;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not p_confirmed then
    raise exception 'Explicit confirmation is required.' using errcode = '22023';
  end if;

  select club.parent_id, club.name
  into state_id, club_name
  from public.organizations club
  where club.id = p_club_id
    and club.level = 'club'
  for update;

  if not found then
    raise exception 'Club not found.' using errcode = '22023';
  end if;

  select array_agg(membership.role order by membership.role)
  into removed_roles
  from public.organization_memberships membership
  where membership.organization_id = p_club_id
    and membership.user_id = actor_id;

  if coalesce(cardinality(removed_roles), 0) = 0 then
    raise exception 'No active club membership found.' using errcode = '22023';
  end if;

  if 'club_board' = any(removed_roles)
    and not exists (
      select 1
      from public.organization_memberships successor
      where successor.organization_id = p_club_id
        and successor.role = 'club_board'
        and successor.user_id <> actor_id
    ) then
    raise exception 'A successor must be assigned before the last club administrator can leave.'
      using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.athlete_federation_affiliations affiliation
    where affiliation.athlete_id = actor_id
      and affiliation.federation_id = state_id
      and affiliation.active
  ) into had_active_federation;

  perform set_config(
    'trainer_hub.membership_delete_workflow',
    'leave_club',
    true
  );

  delete from public.organization_memberships membership
  where membership.organization_id = p_club_id
    and membership.user_id = actor_id;

  select profile.display_name
  into actor_name
  from public.profiles profile
  where profile.id = actor_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'club_left',
    actor_id,
    actor_id,
    p_club_id,
    jsonb_build_object('roles', to_jsonb(removed_roles)),
    jsonb_build_object('left_at', now())
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'club_left'::public.notification_type,
    'Vereinsaustritt',
    actor_name || ' hat ' || club_name || ' verlassen.',
    '/profil'
  from (
    select actor_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = p_club_id
      and membership.role = 'club_board'
    ) or (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    )
  ) recipient
  where recipient.user_id is not null;

  return query
  select had_active_federation and not exists (
    select 1
    from public.athlete_federation_affiliations affiliation
    where affiliation.athlete_id = actor_id
      and affiliation.active
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_club_membership_joined()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  club_name text;
  state_id uuid;
  member_name text;
begin
  select club.name, club.parent_id
  into club_name, state_id
  from public.organizations club
  where club.id = new.organization_id
    and club.level = 'club';

  if not found then
    return new;
  end if;

  select profile.display_name
  into member_name
  from public.profiles profile
  where profile.id = new.user_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    new_values
  )
  values (
    'club_joined',
    new.assigned_by,
    new.user_id,
    new.organization_id,
    jsonb_build_object('role', new.role, 'joined_at', new.created_at)
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    new.user_id,
    'club_joined'::public.notification_type,
    'Vereinsbeitritt bestaetigt',
    member_name || ' ist ' || club_name || ' beigetreten.',
    '/profil'
  from (
    select new.user_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    where (
      membership.organization_id = new.organization_id
      and membership.role = 'club_board'
    ) or (
      membership.organization_id = state_id
      and membership.role = 'specialist'
    )
  ) recipient
  where recipient.user_id is not null;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_membership_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_name text;
  organization_name text;
begin
  if tg_op = 'INSERT' then
    select display_name
    into actor_name
    from public.profiles
    where id = new.user_id;

    select name
    into organization_name
    from public.organizations
    where id = new.organization_id;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      link
    )
    select distinct
      manager.user_id,
      new.user_id,
      'membership_request'::public.notification_type,
      'Neue Beitrittsanfrage',
      actor_name || ' moechte ' || organization_name || ' beitreten.',
      '/postfach'
    from public.organization_memberships manager
    left join public.notification_preferences preference
      on preference.user_id = manager.user_id
    where manager.organization_id = new.organization_id
      and manager.role in ('federal_chair', 'specialist', 'club_board')
      and coalesce(preference.relationship_requests, true);

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      link
    )
    select
      relationship.guardian_user_id,
      new.user_id,
      'guardian_activity'::public.notification_type,
      'Neue Beitrittsanfrage',
      actor_name || ' hat eine Anfrage an ' || organization_name || ' gestellt.',
      '/postfach'
    from public.relationships relationship
    left join public.notification_preferences preference
      on preference.user_id = relationship.guardian_user_id
    where relationship.relationship_type = 'guardian'
      and relationship.active
      and relationship.athlete_user_id = new.user_id
      and coalesce(preference.guardian_activity, true);
  elsif old.status = 'pending' and new.status in ('approved', 'rejected') then
    select name
    into organization_name
    from public.organizations
    where id = new.organization_id;

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      message,
      link
    )
    select
      new.user_id,
      new.reviewed_by,
      'membership_response'::public.notification_type,
      case
        when new.status = 'approved' then 'Beitritt bestaetigt'
        else 'Beitritt abgelehnt'
      end,
      organization_name || case
        when new.status = 'approved' then ' hat deine Anfrage angenommen.'
        else ' hat deine Anfrage abgelehnt.'
      end,
      '/postfach'
    where coalesce((
      select preference.request_updates
      from public.notification_preferences preference
      where preference.user_id = new.user_id
    ), true);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_new_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_name text;
begin
  select display_name
  into actor_name
  from public.profiles
  where id = new.created_by;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    new.created_by,
    'event_created'::public.notification_type,
    'Neuer Termin von ' || actor_name,
    actor_name || ' hat „' || new.title || '“ angelegt.',
    '/kalender'
  from (
    select case
      when relationship.user_one_id = new.created_by
        then relationship.user_two_id
      else relationship.user_one_id
    end as user_id
    from public.relationships relationship
    where relationship.active
      and new.created_by in (
        relationship.user_one_id,
        relationship.user_two_id
      )

    union

    select member.user_id
    from public.group_memberships actor_membership
    join public.group_memberships member
      on member.group_id = actor_membership.group_id
    where actor_membership.user_id = new.created_by
      and member.user_id <> new.created_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id <> new.created_by
    and coalesce(preference.new_events, true);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_relationship_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sender_name text;
begin
  select display_name into sender_name
  from public.profiles where id = new.sender_user_id;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select
    new.recipient_user_id,
    new.sender_user_id,
    'relationship_request',
    case new.relationship_type
      when 'friend' then 'Neue Freundschaftsanfrage'
      when 'trainer_athlete' then 'Neue Trainer-Anfrage'
      else 'Neue Elternverknuepfung'
    end,
    sender_name || ' moechte sich mit dir vernetzen.',
    '/postfach'
  where coalesce((
    select preference.relationship_requests
    from public.notification_preferences preference
    where preference.user_id = new.recipient_user_id
  ), true);

  -- Verknuepfte Eltern werden informiert, ohne die Aktion des Athleten zu
  -- blockieren oder eine zusaetzliche Zustimmung zu verlangen.
  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select
    relationship.guardian_user_id,
    new.sender_user_id,
    'guardian_activity',
    'Aktivitaet deines Athleten',
    sender_name || ' hat eine neue Kontaktanfrage verschickt.',
    '/postfach'
  from public.relationships relationship
  left join public.notification_preferences preference
    on preference.user_id = relationship.guardian_user_id
  where relationship.relationship_type = 'guardian'
    and relationship.active
    and relationship.athlete_user_id = new.sender_user_id
    and coalesce(preference.guardian_activity, true);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_training_plan_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_name text;
  plan_title text;
begin
  select display_name into actor_name
  from public.profiles
  where id = new.shared_by;

  select title into plan_title
  from public.training_plans
  where id = new.training_plan_id;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.shared_by,
    'training_plan_shared'::public.notification_type,
    'Trainingsplan geteilt',
    actor_name || ' hat „' || plan_title || '“ mit dir geteilt.',
    '/trainingsplaene'
  from (
    select new.recipient_user_id as user_id
    where new.target_type = 'person'

    union

    select membership.user_id
    from public.group_memberships membership
    where new.target_type = 'group'
      and membership.group_id = new.group_id
      and membership.user_id <> new.shared_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id is not null
    and coalesce(preference.training_plans, true);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.notify_training_plan_snapshot_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_name text;
begin
  select display_name into actor_name
  from public.profiles
  where id = new.shared_by;

  insert into public.notifications (
    user_id, actor_user_id, type, title, message, link
  )
  select distinct
    recipient.user_id,
    new.shared_by,
    'training_plan_shared'::public.notification_type,
    'Trainingsplan geteilt',
    actor_name || ' hat „' || new.title || '“ mit dir geteilt.',
    '/trainingsplaene'
  from (
    select new.recipient_user_id as user_id
    where new.target_type = 'person'

    union

    select membership.user_id
    from public.group_memberships membership
    where new.target_type = 'group'
      and membership.group_id = new.group_id
      and membership.user_id <> new.shared_by
  ) recipient
  left join public.notification_preferences preference
    on preference.user_id = recipient.user_id
  where recipient.user_id is not null
    and coalesce(preference.training_plans, true);

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.organization_is_same_or_descendant(ancestor_organization_id uuid, candidate_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive descendants as (
    select organization.id
    from public.organizations organization
    where organization.id = ancestor_organization_id

    union all

    select child.id
    from public.organizations child
    join descendants parent on child.parent_id = parent.id
  )
  select exists (
    select 1
    from descendants
    where id = candidate_organization_id
  );
$function$
;
CREATE OR REPLACE FUNCTION private.process_group_invitation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  group_name text;
  actor_name text;
begin
  if tg_op = 'INSERT' then
    select name into group_name from public.social_groups where id = new.group_id;
    select display_name into actor_name from public.profiles where id = new.invited_by;

    insert into public.notifications (
      user_id, actor_user_id, type, title, message, link
    )
    select
      new.invited_user_id,
      new.invited_by,
      'group_invitation',
      'Einladung in ' || group_name,
      actor_name || ' hat dich in die Gruppe eingeladen.',
      '/postfach'
    where coalesce((
      select preference.group_activity
      from public.notification_preferences preference
      where preference.user_id = new.invited_user_id
    ), true);

    return new;
  end if;

  if new.group_id <> old.group_id
    or new.invited_by <> old.invited_by
    or new.invited_user_id <> old.invited_user_id
    or new.message <> old.message then
    raise exception 'Invitation participants cannot be changed.';
  end if;

  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    new.responded_at := coalesce(new.responded_at, now());
    new.updated_at := now();

    if new.status = 'approved' then
      insert into public.group_memberships (group_id, user_id, role)
      values (new.group_id, new.invited_user_id, 'member')
      on conflict (group_id, user_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.protect_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is not null then
    if new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.account_type is distinct from old.account_type then
      raise exception 'Protected profile fields cannot be changed here.'
        using errcode = '42501';
    end if;

    if new.display_name is distinct from old.display_name
      and new.first_name is not distinct from old.first_name
      and new.last_name is not distinct from old.last_name then
      raise exception 'Update first_name and last_name instead of display_name.'
        using errcode = '42501';
    end if;
  end if;

  new.first_name := btrim(new.first_name);
  new.last_name := btrim(new.last_name);
  new.phone := nullif(btrim(new.phone), '');
  new.location := nullif(btrim(new.location), '');
  new.bio := nullif(btrim(new.bio), '');
  new.disciplines := coalesce((
    select array_agg(distinct btrim(value) order by btrim(value))
    from unnest(new.disciplines) value
    where btrim(value) <> ''
  ), '{}'::text[]);

  if exists (
    select 1
    from unnest(new.disciplines) discipline
    where char_length(discipline) > 60
  ) then
    raise exception 'A discipline must not exceed 60 characters.'
      using errcode = '22023';
  end if;

  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name then
    new.display_name := btrim(concat_ws(' ', new.first_name, new.last_name));
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_event_participant_profile(p_event_id uuid, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  resolved_profile_id uuid;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and (
        event.created_by = actor_id
        or private.can_manage_organization(event.organization_id)
      )
  ) then
    raise exception 'Not allowed to manage this event.' using errcode = '42501';
  end if;

  select profile.id
  into resolved_profile_id
  from public.profiles profile
  where lower(profile.email) = normalized_email
    and private.can_view_profile_contact_data(profile.id)
  limit 1;

  return resolved_profile_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.restore_account()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.account_deletion_requests deletion
  set
    status = 'restored',
    restored_at = now(),
    updated_at = now()
  where deletion.user_id = actor_id
    and deletion.status = 'scheduled'
    and deletion.scheduled_for > now();

  if not found then
    raise exception 'The recovery period has expired or no deletion is scheduled.'
      using errcode = '22023';
  end if;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    new_values
  )
  values (
    'account_restored',
    actor_id,
    actor_id,
    jsonb_build_object('restored_at', now())
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  values (
    actor_id,
    actor_id,
    'account_restored'::public.notification_type,
    'Profil wiederhergestellt',
    'Dein Profil und deine Berechtigungen sind wieder aktiv.',
    '/profil'
  );

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.role_allowed_for_level(target_level organization_level, target_role member_role)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case target_level
    when 'federal' then target_role in (
      'federal_chair', 'federal_trainer', 'medical'
    )
    when 'state' then target_role in (
      'specialist', 'state_trainer', 'medical'
    )
    when 'club' then target_role in (
      'club_board', 'club_trainer', 'athlete', 'guardian', 'medical'
    )
    else false
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.schedule_account_deletion(p_confirmation text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  deletion_date timestamptz := now() + interval '30 days';
  actor_name text;
  avatar_snapshot text;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_confirmation <> 'LÖSCHEN' then
    raise exception 'The deletion confirmation is invalid.' using errcode = '22023';
  end if;

  -- Bundesvorsitz, Fachwart und Vereinsvorstand sind je Ebene die Rollen,
  -- deren letzter Inhaber nicht ohne geregelte Nachfolge verschwinden darf.
  if exists (
    select 1
    from public.organization_memberships own_membership
    join public.organizations organization
      on organization.id = own_membership.organization_id
    where own_membership.user_id = actor_id
      and (
        (organization.level = 'federal' and own_membership.role = 'federal_chair')
        or (organization.level = 'state' and own_membership.role = 'specialist')
        or (organization.level = 'club' and own_membership.role = 'club_board')
      )
      and not exists (
        select 1
        from public.organization_memberships successor
        where successor.organization_id = own_membership.organization_id
          and successor.role = own_membership.role
          and successor.user_id <> actor_id
      )
  ) then
    raise exception 'A successor must be assigned before the last organization administrator can delete the account.'
      using errcode = '23514';
  end if;

  select profile.display_name, profile.avatar_path
  into actor_name, avatar_snapshot
  from public.profiles profile
  where profile.id = actor_id
  for update;

  insert into public.account_deletion_requests (
    user_id,
    status,
    requested_at,
    scheduled_for,
    restored_at,
    finalized_at,
    external_cleanup_completed_at,
    avatar_path_snapshot,
    updated_at
  )
  values (
    actor_id,
    'scheduled',
    now(),
    deletion_date,
    null,
    null,
    null,
    avatar_snapshot,
    now()
  )
  on conflict (user_id) do update
  set
    status = 'scheduled',
    requested_at = excluded.requested_at,
    scheduled_for = excluded.scheduled_for,
    restored_at = null,
    finalized_at = null,
    external_cleanup_completed_at = null,
    avatar_path_snapshot = excluded.avatar_path_snapshot,
    updated_at = now();

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    new_values
  )
  values (
    'account_deletion_scheduled',
    actor_id,
    actor_id,
    jsonb_build_object('scheduled_for', deletion_date)
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'account_deletion_scheduled'::public.notification_type,
    'Profil-Loeschung geplant',
    case
      when recipient.user_id = actor_id then
        'Dein Profil wird am ' || to_char(deletion_date, 'DD.MM.YYYY') ||
        ' endgueltig anonymisiert.'
      else
        actor_name || ' hat die Profil-Loeschung zum ' ||
        to_char(deletion_date, 'DD.MM.YYYY') || ' geplant.'
    end,
    case
      when recipient.user_id = actor_id then '/konto-wiederherstellen'
      else '/organisation'
    end
  from (
    select actor_id as user_id
    union
    select manager.user_id
    from public.organization_memberships subject_membership
    join public.organization_memberships manager
      on manager.organization_id = subject_membership.organization_id
    join public.organizations organization
      on organization.id = manager.organization_id
    where subject_membership.user_id = actor_id
      and manager.user_id <> actor_id
      and (
        (organization.level = 'federal' and manager.role = 'federal_chair')
        or (organization.level = 'state' and manager.role = 'specialist')
        or (organization.level = 'club' and manager.role = 'club_board')
      )
  ) recipient;

  return deletion_date;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_active_athlete_federation(p_federation_id uuid, p_confirmed boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  old_affiliation public.athlete_federation_affiliations%rowtype;
  new_affiliation_id uuid;
  athlete_name text;
  old_federation_name text;
  new_federation_name text;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not p_confirmed then
    raise exception 'Explicit confirmation is required.' using errcode = '22023';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = actor_id
    and profile.account_type = 'athlete'
  for update;

  if not found then
    raise exception 'Only athlete accounts can select a federation.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations federation
    where federation.id = p_federation_id
      and federation.level = 'state'
  ) then
    raise exception 'Federation not found.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    join public.organizations club
      on club.id = membership.organization_id
    where membership.user_id = actor_id
      and club.level = 'club'
      and club.parent_id = p_federation_id
  ) then
    raise exception 'The athlete is not eligible for this federation.'
      using errcode = '23514';
  end if;

  select affiliation.*
  into old_affiliation
  from public.athlete_federation_affiliations affiliation
  where affiliation.athlete_id = actor_id
    and affiliation.active
  for update;

  if found and old_affiliation.federation_id = p_federation_id then
    return old_affiliation.id;
  end if;

  if old_affiliation.id is not null then
    update public.athlete_federation_affiliations
    set active = false, ended_at = now()
    where id = old_affiliation.id;
  end if;

  insert into public.athlete_federation_affiliations (
    athlete_id,
    federation_id
  )
  values (actor_id, p_federation_id)
  returning id into new_affiliation_id;

  select
    profile.display_name,
    old_federation.name,
    new_federation.name
  into athlete_name, old_federation_name, new_federation_name
  from public.profiles profile
  join public.organizations new_federation
    on new_federation.id = p_federation_id
  left join public.organizations old_federation
    on old_federation.id = old_affiliation.federation_id
  where profile.id = actor_id;

  insert into public.profile_audit_events (
    event_type,
    actor_user_id,
    subject_user_id,
    organization_id,
    old_values,
    new_values
  )
  values (
    'federation_changed',
    actor_id,
    actor_id,
    p_federation_id,
    jsonb_build_object(
      'affiliation_id', old_affiliation.id,
      'federation_id', old_affiliation.federation_id
    ),
    jsonb_build_object(
      'affiliation_id', new_affiliation_id,
      'federation_id', p_federation_id,
      'selected_at', now()
    )
  );

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    message,
    link
  )
  select distinct
    recipient.user_id,
    actor_id,
    'federation_changed'::public.notification_type,
    'Startverband geaendert',
    athlete_name || ' faehrt jetzt offiziell fuer ' ||
      new_federation_name ||
      case
        when old_federation_name is null then '.'
        else ' (vorher: ' || old_federation_name || ').'
      end,
    '/profil#startverband'
  from (
    select actor_id as user_id
    union
    select membership.user_id
    from public.organization_memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where (
      organization.id in (
        p_federation_id,
        old_affiliation.federation_id
      )
      and membership.role = 'specialist'
    ) or (
      organization.level = 'club'
      and organization.parent_id in (
        p_federation_id,
        old_affiliation.federation_id
      )
      and membership.role = 'club_board'
    )
  ) recipient
  where recipient.user_id is not null;

  return new_affiliation_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.shares_group_with(first_user_id uuid, second_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null
    and first_user_id is not null
    and second_user_id is not null
    and exists (
      select 1
      from public.group_memberships first_membership
      join public.group_memberships second_membership
        on second_membership.group_id = first_membership.group_id
      where first_membership.user_id = first_user_id
        and second_membership.user_id = second_user_id
    );
$function$
;
CREATE OR REPLACE FUNCTION private.sync_training_video_evidence_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    perform public.update_training_trick_progress(
      new.snapshot_share_id,
      new.trick_id,
      'awaiting_confirmation'::public.trick_progress_status
    );
  elsif new.review_status is distinct from old.review_status then
    perform public.update_training_trick_progress(
      new.snapshot_share_id,
      new.trick_id,
      case
        when new.review_status = 'approved'
          then 'confirmed'::public.trick_progress_status
        else 'in_progress'::public.trick_progress_status
      end
    );
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_training_trick_progress(p_snapshot_share_id uuid, p_trick_id text, p_status trick_progress_status)
 RETURNS TABLE(athlete_user_id uuid, current_status trick_progress_status, xp_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  progress_row public.training_trick_progress%rowtype;
  actor_is_athlete boolean;
  actor_is_assigned_trainer boolean;
  athlete_has_trainer boolean;
begin
  if actor_id is null or not private.current_account_is_active() then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  select progress.*
  into progress_row
  from public.training_trick_progress progress
  where progress.snapshot_share_id = p_snapshot_share_id
    and progress.trick_id = p_trick_id
  for update;
  if not found then
    raise exception 'Trick-Fortschritt wurde nicht gefunden.'
      using errcode = 'P0002';
  end if;

  actor_is_athlete := actor_id = progress_row.athlete_id;
  actor_is_assigned_trainer := private.has_active_trainer_athlete_relationship(
    actor_id,
    progress_row.athlete_id
  );
  select exists (
    select 1
    from public.relationships relationship
    where relationship.active
      and relationship.relationship_type = 'trainer_athlete'
      and progress_row.athlete_id in (
        relationship.user_one_id,
        relationship.user_two_id
      )
      and private.is_trainer_profile(
        case
          when relationship.user_one_id = progress_row.athlete_id
            then relationship.user_two_id
          else relationship.user_one_id
        end
      )
  ) into athlete_has_trainer;

  if p_status = progress_row.status then
    null;
  elsif actor_is_athlete and (
    (progress_row.status = 'not_started' and p_status = 'in_progress')
    or (progress_row.status = 'in_progress' and p_status = 'awaiting_confirmation')
    or (
      progress_row.status = 'awaiting_confirmation'
      and p_status = 'confirmed'
      and not athlete_has_trainer
    )
  ) then
    null;
  elsif actor_is_assigned_trainer
    and progress_row.status = 'awaiting_confirmation'
    and p_status in ('confirmed', 'in_progress') then
    null;
  else
    raise exception 'Dieser Statuswechsel ist fuer das Konto nicht erlaubt.'
      using errcode = '42501';
  end if;

  update public.training_trick_progress progress
  set
    status = p_status,
    confirmed_by = case when p_status = 'confirmed' then actor_id else null end,
    confirmed_at = case when p_status = 'confirmed' then now() else null end,
    updated_at = now()
  where progress.id = progress_row.id;

  return query
  select
    progress_row.athlete_id,
    p_status,
    (count(*) filter (where progress.status = 'confirmed') * 100)::integer
  from public.training_trick_progress progress
  where progress.athlete_id = progress_row.athlete_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_athlete_federation_affiliation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.active then
    if not exists (
      select 1
      from public.profiles profile
      where profile.id = new.athlete_id
        and profile.account_type = 'athlete'
    ) then
      raise exception 'Only athlete accounts can select a federation.'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.organization_memberships membership
      join public.organizations club
        on club.id = membership.organization_id
      where membership.user_id = new.athlete_id
        and club.level = 'club'
        and club.parent_id = new.federation_id
    ) then
      raise exception 'The athlete is not eligible for this federation.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_membership_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  organization_level public.organization_level;
  membership_role public.member_role;
begin
  select organization.level
  into organization_level
  from public.organizations organization
  where organization.id = new.organization_id;

  if tg_table_name = 'membership_requests' then
    membership_role := new.requested_role;
  else
    membership_role := new.role;
  end if;

  if not private.role_allowed_for_level(organization_level, membership_role) then
    raise exception 'The selected role is not valid for this organization level.';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_organization_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  parent_level public.organization_level;
begin
  if new.level = 'federal' then
    if new.parent_id is not null then
      raise exception 'A federal organization cannot have a parent.';
    end if;
    return new;
  end if;

  if new.parent_id is null then
    raise exception 'State and club organizations require a parent.';
  end if;

  select organization.level
  into parent_level
  from public.organizations organization
  where organization.id = new.parent_id;

  if parent_level is null then
    raise exception 'The parent organization does not exist.';
  end if;

  if new.level = 'state' and parent_level <> 'federal' then
    raise exception 'A state organization must belong to a federal organization.';
  end if;

  if new.level = 'club' and parent_level <> 'state' then
    raise exception 'A club must belong to a state organization.';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_relationship_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  trainer_type public.account_type;
  athlete_type public.account_type;
  guardian_type public.account_type;
begin
  if tg_op = 'UPDATE' then
    if new.sender_user_id <> old.sender_user_id
      or new.recipient_user_id <> old.recipient_user_id
      or new.relationship_type <> old.relationship_type
      or new.trainer_user_id is distinct from old.trainer_user_id
      or new.athlete_user_id is distinct from old.athlete_user_id
      or new.guardian_user_id is distinct from old.guardian_user_id
      or new.message <> old.message then
      raise exception 'Request participants and type cannot be changed.';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or new.sender_user_id <> auth.uid() then
    raise exception 'Authentication required.';
  end if;

  if new.relationship_type = 'trainer_athlete' then
    if array[new.sender_user_id, new.recipient_user_id]
      @> array[new.trainer_user_id, new.athlete_user_id] is not true then
      raise exception 'Trainer and athlete must be request participants.';
    end if;

    select account_type into trainer_type
    from public.profiles where id = new.trainer_user_id;
    select account_type into athlete_type
    from public.profiles where id = new.athlete_user_id;

    if trainer_type <> 'trainer' or athlete_type <> 'athlete' then
      raise exception 'Trainer-athlete requests require matching account types.';
    end if;
  elsif new.relationship_type = 'guardian' then
    if array[new.sender_user_id, new.recipient_user_id]
      @> array[new.guardian_user_id, new.athlete_user_id] is not true then
      raise exception 'Guardian and athlete must be request participants.';
    end if;

    select account_type into guardian_type
    from public.profiles where id = new.guardian_user_id;
    select account_type into athlete_type
    from public.profiles where id = new.athlete_user_id;

    if guardian_type <> 'guardian' or athlete_type <> 'athlete' then
      raise exception 'Guardian requests require matching account types.';
    end if;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.validate_training_video_evidence_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich.' using errcode = '42501';
  end if;

  if new.snapshot_share_id is distinct from old.snapshot_share_id
    or new.trick_id is distinct from old.trick_id
    or new.athlete_id is distinct from old.athlete_id
    or new.provider is distinct from old.provider
    or new.video_id is distinct from old.video_id
    or new.athlete_comment is distinct from old.athlete_comment
    or new.attempt_count is distinct from old.attempt_count
    or new.self_rating is distinct from old.self_rating
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Einreichungsdaten duerfen nachtraeglich nicht veraendert werden.'
      using errcode = '42501';
  end if;

  if old.review_status <> 'pending'
    or new.review_status not in ('approved', 'changes_requested')
    or new.reviewed_by is distinct from auth.uid()
    or new.reviewed_at is null then
    raise exception 'Diese Pruefentscheidung ist nicht erlaubt.' using errcode = '42501';
  end if;

  return new;
end;
$function$
;
alter table public.account_deletion_requests add constraint account_deletion_requests_check CHECK ((scheduled_for = (requested_at + '30 days'::interval)));
alter table public.account_deletion_requests add constraint account_deletion_requests_check1 CHECK ((((status = 'scheduled'::account_deletion_status) AND (restored_at IS NULL) AND (finalized_at IS NULL)) OR ((status = 'restored'::account_deletion_status) AND (restored_at IS NOT NULL) AND (finalized_at IS NULL)) OR ((status = 'finalized'::account_deletion_status) AND (finalized_at IS NOT NULL))));
alter table public.account_deletion_requests add constraint account_deletion_requests_pkey PRIMARY KEY (user_id);
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_category_check CHECK ((char_length(category) <= 120));
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_note_check CHECK ((char_length(note) <= 2000));
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_pkey PRIMARY KEY (evaluation_id, event_id);
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_placement_check CHECK (((placement IS NULL) OR (placement > 0)));
alter table public.athlete_evaluation_skill_ratings add constraint athlete_evaluation_skill_ratings_note_check CHECK ((char_length(note) <= 3000));
alter table public.athlete_evaluation_skill_ratings add constraint athlete_evaluation_skill_ratings_pkey PRIMARY KEY (evaluation_id, skill_key);
alter table public.athlete_evaluation_skill_ratings add constraint athlete_evaluation_skill_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.athlete_evaluation_skill_ratings add constraint athlete_evaluation_skill_ratings_skill_key_check CHECK (((char_length(btrim(skill_key)) >= 1) AND (char_length(btrim(skill_key)) <= 80)));
alter table public.athlete_evaluations add constraint athlete_evaluations_check CHECK ((period_end >= period_start));
alter table public.athlete_evaluations add constraint athlete_evaluations_dalid_status_check CHECK ((char_length(dalid_status) <= 240));
alter table public.athlete_evaluations add constraint athlete_evaluations_measures_check CHECK ((char_length(measures) <= 5000));
alter table public.athlete_evaluations add constraint athlete_evaluations_personal_notes_check CHECK ((char_length(personal_notes) <= 10000));
alter table public.athlete_evaluations add constraint athlete_evaluations_pkey PRIMARY KEY (id);
alter table public.athlete_evaluations add constraint athlete_evaluations_squad_check CHECK ((char_length(squad) <= 120));
alter table public.athlete_evaluations add constraint athlete_evaluations_title_check CHECK ((char_length(title) <= 200));
alter table public.athlete_evaluations add constraint athlete_evaluations_trainer_id_athlete_id_period_start_peri_key UNIQUE (trainer_id, athlete_id, period_start, period_end);
alter table public.athlete_federation_affiliations add constraint athlete_federation_affiliations_check CHECK (((active AND (ended_at IS NULL) AND (invalidated_at IS NULL)) OR ((NOT active) AND (ended_at IS NOT NULL))));
alter table public.athlete_federation_affiliations add constraint athlete_federation_affiliations_pkey PRIMARY KEY (id);
alter table public.athlete_personal_goals add constraint athlete_personal_goals_pkey PRIMARY KEY (id);
alter table public.athlete_personal_goals add constraint athlete_personal_goals_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 240)));
alter table public.evaluation_skill_settings add constraint evaluation_skill_settings_category_check CHECK ((category = ANY (ARRAY['skateboarding'::text, 'mental'::text, 'athletic'::text])));
alter table public.evaluation_skill_settings add constraint evaluation_skill_settings_label_check CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 160)));
alter table public.evaluation_skill_settings add constraint evaluation_skill_settings_pkey PRIMARY KEY (trainer_id, skill_key);
alter table public.evaluation_skill_settings add constraint evaluation_skill_settings_skill_key_check CHECK (((char_length(btrim(skill_key)) >= 1) AND (char_length(btrim(skill_key)) <= 80)));
alter table public.event_participants add constraint event_participants_event_id_invited_email_key UNIQUE (event_id, invited_email);
alter table public.event_participants add constraint event_participants_pkey PRIMARY KEY (id);
alter table public.events add constraint events_capacity_check CHECK ((capacity >= 0));
alter table public.events add constraint events_check CHECK ((ends_at > starts_at));
alter table public.events add constraint events_pkey PRIMARY KEY (id);
alter table public.group_invitations add constraint group_invitations_check CHECK ((invited_by <> invited_user_id));
alter table public.group_invitations add constraint group_invitations_message_check CHECK ((char_length(message) <= 500));
alter table public.group_invitations add constraint group_invitations_pkey PRIMARY KEY (id);
alter table public.group_memberships add constraint group_memberships_group_id_user_id_key UNIQUE (group_id, user_id);
alter table public.group_memberships add constraint group_memberships_pkey PRIMARY KEY (id);
alter table public.membership_requests add constraint membership_requests_pkey PRIMARY KEY (id);
alter table public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id);
alter table public.notifications add constraint notifications_link_check CHECK (("left"(link, 1) = '/'::text));
alter table public.notifications add constraint notifications_message_check CHECK (((char_length(message) >= 1) AND (char_length(message) <= 500)));
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)));
alter table public.organization_memberships add constraint organization_memberships_organization_id_user_id_role_key UNIQUE (organization_id, user_id, role);
alter table public.organization_memberships add constraint organization_memberships_pkey PRIMARY KEY (id);
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.profile_audit_events add constraint profile_audit_events_event_type_check CHECK ((event_type = ANY (ARRAY['club_joined'::text, 'club_left'::text, 'federation_changed'::text, 'federation_invalidated'::text, 'account_deletion_scheduled'::text, 'account_restored'::text, 'account_finalized'::text])));
alter table public.profile_audit_events add constraint profile_audit_events_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_avatar_path_format CHECK (((avatar_path IS NULL) OR (avatar_path ~ (('^'::text || (id)::text) || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|webp)$'::text))));
alter table public.profiles add constraint profiles_bio_length CHECK (((bio IS NULL) OR (char_length(bio) <= 1000)));
alter table public.profiles add constraint profiles_disciplines_count CHECK ((cardinality(disciplines) <= 20));
alter table public.profiles add constraint profiles_disciplines_total_length CHECK ((char_length(array_to_string(disciplines, ''::text)) <= 1200));
alter table public.profiles add constraint profiles_first_name_length CHECK (((char_length(btrim(first_name)) >= 1) AND (char_length(btrim(first_name)) <= 80)));
alter table public.profiles add constraint profiles_last_name_length CHECK ((char_length(btrim(last_name)) <= 80));
alter table public.profiles add constraint profiles_location_length CHECK (((location IS NULL) OR (char_length(location) <= 120)));
alter table public.profiles add constraint profiles_phone_length CHECK (((phone IS NULL) OR (char_length(phone) <= 40)));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.relationship_requests add constraint relationship_requests_check CHECK ((sender_user_id <> recipient_user_id));
alter table public.relationship_requests add constraint relationship_requests_check1 CHECK ((((relationship_type = 'friend'::relationship_type) AND (trainer_user_id IS NULL) AND (athlete_user_id IS NULL) AND (guardian_user_id IS NULL)) OR ((relationship_type = 'trainer_athlete'::relationship_type) AND (trainer_user_id IS NOT NULL) AND (athlete_user_id IS NOT NULL) AND (guardian_user_id IS NULL) AND (trainer_user_id <> athlete_user_id)) OR ((relationship_type = 'guardian'::relationship_type) AND (trainer_user_id IS NULL) AND (athlete_user_id IS NOT NULL) AND (guardian_user_id IS NOT NULL) AND (athlete_user_id <> guardian_user_id))));
alter table public.relationship_requests add constraint relationship_requests_message_check CHECK ((char_length(message) <= 500));
alter table public.relationship_requests add constraint relationship_requests_pkey PRIMARY KEY (id);
alter table public.relationships add constraint relationships_check CHECK ((user_one_id < user_two_id));
alter table public.relationships add constraint relationships_check1 CHECK (((active AND (ended_at IS NULL)) OR (NOT active)));
alter table public.relationships add constraint relationships_check2 CHECK ((((relationship_type = 'friend'::relationship_type) AND (trainer_user_id IS NULL) AND (athlete_user_id IS NULL) AND (guardian_user_id IS NULL)) OR ((relationship_type = 'trainer_athlete'::relationship_type) AND (trainer_user_id IS NOT NULL) AND (athlete_user_id IS NOT NULL) AND (guardian_user_id IS NULL)) OR ((relationship_type = 'guardian'::relationship_type) AND (trainer_user_id IS NULL) AND (athlete_user_id IS NOT NULL) AND (guardian_user_id IS NOT NULL))));
alter table public.relationships add constraint relationships_pkey PRIMARY KEY (id);
alter table public.social_groups add constraint social_groups_description_check CHECK ((char_length(description) <= 500));
alter table public.social_groups add constraint social_groups_name_check CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 80)));
alter table public.social_groups add constraint social_groups_pkey PRIMARY KEY (id);
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_check CHECK ((trainer_user_id <> athlete_user_id));
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_check1 CHECK (((active AND (ended_at IS NULL)) OR (NOT active)));
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_pkey PRIMARY KEY (id);
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_attendance_weight_check CHECK (((attendance_weight >= 0) AND (attendance_weight <= 100)));
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_check CHECK (((((attendance_weight + contest_weight) + task_weight) + skill_weight) = 100));
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_contest_weight_check CHECK (((contest_weight >= 0) AND (contest_weight <= 100)));
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_pkey PRIMARY KEY (trainer_id);
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_skill_weight_check CHECK (((skill_weight >= 0) AND (skill_weight <= 100)));
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_task_weight_check CHECK (((task_weight >= 0) AND (task_weight <= 100)));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_pkey PRIMARY KEY (id);
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_provider_check CHECK ((provider = 'youtube'::text));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_source_plan_id_check CHECK (((char_length(btrim(source_plan_id)) >= 1) AND (char_length(btrim(source_plan_id)) <= 160)));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_source_plan_id_trick_id_creat_key UNIQUE (source_plan_id, trick_id, created_by, provider, video_id);
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_trainer_note_check CHECK ((char_length(trainer_note) <= 2000));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_trick_id_check CHECK (((char_length(btrim(trick_id)) >= 1) AND (char_length(btrim(trick_id)) <= 160)));
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_video_id_check CHECK ((video_id ~ '^[A-Za-z0-9_-]{11}$'::text));
alter table public.training_plan_shares add constraint training_plan_shares_pkey PRIMARY KEY (id);
alter table public.training_plan_shares add constraint training_plan_shares_training_plan_id_target_organization_i_key UNIQUE (training_plan_id, target_organization_id);
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_check CHECK ((((target_type = 'person'::share_target_type) AND (recipient_user_id IS NOT NULL) AND (group_id IS NULL)) OR ((target_type = 'group'::share_target_type) AND (recipient_user_id IS NULL) AND (group_id IS NOT NULL))));
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_pkey PRIMARY KEY (id);
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_plan_snapshot_check CHECK ((jsonb_typeof(plan_snapshot) = 'object'::text));
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_plan_snapshot_check1 CHECK ((octet_length((plan_snapshot)::text) <= 262144));
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 160)));
alter table public.training_plan_social_shares add constraint training_plan_social_shares_check CHECK ((((target_type = 'person'::share_target_type) AND (recipient_user_id IS NOT NULL) AND (group_id IS NULL)) OR ((target_type = 'group'::share_target_type) AND (recipient_user_id IS NULL) AND (group_id IS NOT NULL))));
alter table public.training_plan_social_shares add constraint training_plan_social_shares_pkey PRIMARY KEY (id);
alter table public.training_plan_versions add constraint training_plan_versions_pkey PRIMARY KEY (id);
alter table public.training_plan_versions add constraint training_plan_versions_training_plan_id_version_number_key UNIQUE (training_plan_id, version_number);
alter table public.training_plan_versions add constraint training_plan_versions_version_number_check CHECK ((version_number > 0));
alter table public.training_plans add constraint training_plans_pkey PRIMARY KEY (id);
alter table public.training_trick_progress add constraint training_trick_progress_check CHECK ((((status = 'confirmed'::trick_progress_status) AND (confirmed_by IS NOT NULL) AND (confirmed_at IS NOT NULL)) OR ((status <> 'confirmed'::trick_progress_status) AND (confirmed_by IS NULL) AND (confirmed_at IS NULL))));
alter table public.training_trick_progress add constraint training_trick_progress_pkey PRIMARY KEY (id);
alter table public.training_trick_progress add constraint training_trick_progress_snapshot_share_id_trick_id_key UNIQUE (snapshot_share_id, trick_id);
alter table public.training_trick_progress add constraint training_trick_progress_trick_id_check CHECK (((char_length(btrim(trick_id)) >= 1) AND (char_length(btrim(trick_id)) <= 160)));
alter table public.training_video_evidence add constraint training_video_evidence_athlete_comment_check CHECK ((char_length(athlete_comment) <= 2000));
alter table public.training_video_evidence add constraint training_video_evidence_attempt_count_check CHECK (((attempt_count >= 1) AND (attempt_count <= 100000)));
alter table public.training_video_evidence add constraint training_video_evidence_check CHECK ((((review_status = 'pending'::training_evidence_review_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((review_status = 'approved'::training_evidence_review_status) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL)) OR ((review_status = 'changes_requested'::training_evidence_review_status) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (char_length(btrim(trainer_feedback)) > 0))));
alter table public.training_video_evidence add constraint training_video_evidence_pkey PRIMARY KEY (id);
alter table public.training_video_evidence add constraint training_video_evidence_provider_check CHECK ((provider = 'youtube'::text));
alter table public.training_video_evidence add constraint training_video_evidence_self_rating_check CHECK (((self_rating >= 1) AND (self_rating <= 5)));
alter table public.training_video_evidence add constraint training_video_evidence_trainer_feedback_check CHECK ((char_length(trainer_feedback) <= 2000));
alter table public.training_video_evidence add constraint training_video_evidence_trick_id_check CHECK (((char_length(btrim(trick_id)) >= 1) AND (char_length(btrim(trick_id)) <= 160)));
alter table public.training_video_evidence add constraint training_video_evidence_video_id_check CHECK ((video_id ~ '^[A-Za-z0-9_-]{11}$'::text));
alter table public.account_deletion_requests add constraint account_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES athlete_evaluations(id) ON DELETE CASCADE;
alter table public.athlete_evaluation_contest_overrides add constraint athlete_evaluation_contest_overrides_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public.athlete_evaluation_skill_ratings add constraint athlete_evaluation_skill_ratings_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES athlete_evaluations(id) ON DELETE CASCADE;
alter table public.athlete_evaluations add constraint athlete_evaluations_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.athlete_evaluations add constraint athlete_evaluations_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.athlete_federation_affiliations add constraint athlete_federation_affiliations_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.athlete_federation_affiliations add constraint athlete_federation_affiliations_federation_id_fkey FOREIGN KEY (federation_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.athlete_personal_goals add constraint athlete_personal_goals_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.athlete_personal_goals add constraint athlete_personal_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.evaluation_skill_settings add constraint evaluation_skill_settings_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.event_participants add constraint event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public.event_participants add constraint event_participants_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.event_participants add constraint event_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.events add constraint events_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.events add constraint events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.group_invitations add constraint group_invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES social_groups(id) ON DELETE CASCADE;
alter table public.group_invitations add constraint group_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.group_invitations add constraint group_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.group_memberships add constraint group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES social_groups(id) ON DELETE CASCADE;
alter table public.group_memberships add constraint group_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.membership_requests add constraint membership_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.membership_requests add constraint membership_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.membership_requests add constraint membership_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.organization_memberships add constraint organization_memberships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.organization_memberships add constraint organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.organization_memberships add constraint organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.organizations add constraint organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.organizations add constraint organizations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.profile_audit_events add constraint profile_audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profile_audit_events add constraint profile_audit_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.profile_audit_events add constraint profile_audit_events_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.relationship_requests add constraint relationship_requests_athlete_user_id_fkey FOREIGN KEY (athlete_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationship_requests add constraint relationship_requests_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationship_requests add constraint relationship_requests_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationship_requests add constraint relationship_requests_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationship_requests add constraint relationship_requests_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationships add constraint relationships_athlete_user_id_fkey FOREIGN KEY (athlete_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationships add constraint relationships_created_by_request_id_fkey FOREIGN KEY (created_by_request_id) REFERENCES relationship_requests(id) ON DELETE SET NULL;
alter table public.relationships add constraint relationships_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationships add constraint relationships_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationships add constraint relationships_user_one_id_fkey FOREIGN KEY (user_one_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.relationships add constraint relationships_user_two_id_fkey FOREIGN KEY (user_two_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.social_groups add constraint social_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_athlete_user_id_fkey FOREIGN KEY (athlete_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.trainer_athlete_assignments add constraint trainer_athlete_assignments_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.trainer_evaluation_settings add constraint trainer_evaluation_settings_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_exercise_demo_videos add constraint training_exercise_demo_videos_origin_snapshot_share_id_fkey FOREIGN KEY (origin_snapshot_share_id) REFERENCES training_plan_snapshot_shares(id) ON DELETE CASCADE;
alter table public.training_plan_shares add constraint training_plan_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.training_plan_shares add constraint training_plan_shares_target_organization_id_fkey FOREIGN KEY (target_organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.training_plan_shares add constraint training_plan_shares_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES training_plans(id) ON DELETE CASCADE;
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_group_id_fkey FOREIGN KEY (group_id) REFERENCES social_groups(id) ON DELETE CASCADE;
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_plan_snapshot_shares add constraint training_plan_snapshot_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_plan_social_shares add constraint training_plan_social_shares_group_id_fkey FOREIGN KEY (group_id) REFERENCES social_groups(id) ON DELETE CASCADE;
alter table public.training_plan_social_shares add constraint training_plan_social_shares_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_plan_social_shares add constraint training_plan_social_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_plan_social_shares add constraint training_plan_social_shares_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES training_plans(id) ON DELETE CASCADE;
alter table public.training_plan_versions add constraint training_plan_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.training_plan_versions add constraint training_plan_versions_training_plan_id_fkey FOREIGN KEY (training_plan_id) REFERENCES training_plans(id) ON DELETE CASCADE;
alter table public.training_plans add constraint training_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table public.training_plans add constraint training_plans_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
alter table public.training_trick_progress add constraint training_trick_progress_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_trick_progress add constraint training_trick_progress_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.training_trick_progress add constraint training_trick_progress_snapshot_share_id_fkey FOREIGN KEY (snapshot_share_id) REFERENCES training_plan_snapshot_shares(id) ON DELETE CASCADE;
alter table public.training_video_evidence add constraint training_video_evidence_athlete_id_fkey FOREIGN KEY (athlete_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.training_video_evidence add constraint training_video_evidence_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.training_video_evidence add constraint training_video_evidence_snapshot_share_id_fkey FOREIGN KEY (snapshot_share_id) REFERENCES training_plan_snapshot_shares(id) ON DELETE CASCADE;
CREATE INDEX account_deletion_cleanup_idx ON public.account_deletion_requests USING btree (finalized_at) WHERE ((status = 'finalized'::account_deletion_status) AND (external_cleanup_completed_at IS NULL));
CREATE INDEX account_deletion_due_idx ON public.account_deletion_requests USING btree (scheduled_for) WHERE (status = 'scheduled'::account_deletion_status);
CREATE INDEX athlete_evaluation_contest_overrides_event_idx ON public.athlete_evaluation_contest_overrides USING btree (event_id);
CREATE INDEX athlete_evaluations_athlete_period_idx ON public.athlete_evaluations USING btree (athlete_id, period_end DESC);
CREATE INDEX athlete_evaluations_trainer_period_idx ON public.athlete_evaluations USING btree (trainer_id, period_end DESC, athlete_id);
CREATE INDEX athlete_federation_athlete_history_idx ON public.athlete_federation_affiliations USING btree (athlete_id, selected_at DESC);
CREATE INDEX athlete_federation_federation_idx ON public.athlete_federation_affiliations USING btree (federation_id, active);
CREATE UNIQUE INDEX athlete_federation_one_active_idx ON public.athlete_federation_affiliations USING btree (athlete_id) WHERE active;
CREATE INDEX athlete_personal_goals_athlete_idx ON public.athlete_personal_goals USING btree (athlete_id, completed, created_at DESC);
CREATE INDEX athlete_personal_goals_created_by_idx ON public.athlete_personal_goals USING btree (created_by);
CREATE INDEX evaluation_skill_settings_trainer_sort_idx ON public.evaluation_skill_settings USING btree (trainer_id, category, sort_order);
CREATE INDEX event_participants_event_idx ON public.event_participants USING btree (event_id);
CREATE INDEX event_participants_invited_by_idx ON public.event_participants USING btree (invited_by);
CREATE INDEX event_participants_user_idx ON public.event_participants USING btree (user_id);
CREATE INDEX events_created_by_idx ON public.events USING btree (created_by);
CREATE INDEX events_organization_idx ON public.events USING btree (organization_id);
CREATE INDEX group_invitations_invited_by_idx ON public.group_invitations USING btree (invited_by, status, created_at DESC);
CREATE INDEX group_invitations_invited_user_idx ON public.group_invitations USING btree (invited_user_id, status, created_at DESC);
CREATE UNIQUE INDEX group_invitations_one_pending_idx ON public.group_invitations USING btree (group_id, invited_user_id) WHERE (status = 'pending'::request_status);
CREATE INDEX group_memberships_group_role_idx ON public.group_memberships USING btree (group_id, role);
CREATE INDEX group_memberships_user_idx ON public.group_memberships USING btree (user_id, joined_at DESC);
CREATE UNIQUE INDEX membership_requests_one_pending_idx ON public.membership_requests USING btree (organization_id, user_id, requested_role) WHERE (status = 'pending'::request_status);
CREATE INDEX membership_requests_organization_idx ON public.membership_requests USING btree (organization_id, status);
CREATE INDEX membership_requests_reviewed_by_idx ON public.membership_requests USING btree (reviewed_by);
CREATE INDEX membership_requests_user_idx ON public.membership_requests USING btree (user_id);
CREATE INDEX memberships_assigned_by_idx ON public.organization_memberships USING btree (assigned_by);
CREATE INDEX memberships_organization_id_idx ON public.organization_memberships USING btree (organization_id);
CREATE INDEX memberships_user_id_idx ON public.organization_memberships USING btree (user_id);
CREATE INDEX notifications_actor_idx ON public.notifications USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);
CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX organizations_club_name_per_state_idx ON public.organizations USING btree (parent_id, lower(btrim(name))) WHERE (level = 'club'::organization_level);
CREATE INDEX organizations_created_by_idx ON public.organizations USING btree (created_by);
CREATE INDEX organizations_parent_idx ON public.organizations USING btree (parent_id);
CREATE INDEX profile_audit_actor_idx ON public.profile_audit_events USING btree (actor_user_id);
CREATE INDEX profile_audit_organization_idx ON public.profile_audit_events USING btree (organization_id, created_at DESC);
CREATE INDEX profile_audit_subject_idx ON public.profile_audit_events USING btree (subject_user_id, created_at DESC);
CREATE INDEX relationship_requests_athlete_idx ON public.relationship_requests USING btree (athlete_user_id) WHERE (athlete_user_id IS NOT NULL);
CREATE INDEX relationship_requests_guardian_idx ON public.relationship_requests USING btree (guardian_user_id) WHERE (guardian_user_id IS NOT NULL);
CREATE UNIQUE INDEX relationship_requests_one_pending_pair_idx ON public.relationship_requests USING btree (LEAST(sender_user_id, recipient_user_id), GREATEST(sender_user_id, recipient_user_id), relationship_type) WHERE (status = 'pending'::request_status);
CREATE INDEX relationship_requests_recipient_status_idx ON public.relationship_requests USING btree (recipient_user_id, status, created_at DESC);
CREATE INDEX relationship_requests_sender_status_idx ON public.relationship_requests USING btree (sender_user_id, status, created_at DESC);
CREATE INDEX relationship_requests_trainer_idx ON public.relationship_requests USING btree (trainer_user_id) WHERE (trainer_user_id IS NOT NULL);
CREATE INDEX relationships_athlete_active_idx ON public.relationships USING btree (athlete_user_id, active) WHERE (athlete_user_id IS NOT NULL);
CREATE INDEX relationships_guardian_active_idx ON public.relationships USING btree (guardian_user_id, active) WHERE (guardian_user_id IS NOT NULL);
CREATE UNIQUE INDEX relationships_one_active_pair_idx ON public.relationships USING btree (user_one_id, user_two_id, relationship_type) WHERE active;
CREATE INDEX relationships_request_idx ON public.relationships USING btree (created_by_request_id) WHERE (created_by_request_id IS NOT NULL);
CREATE INDEX relationships_trainer_active_idx ON public.relationships USING btree (trainer_user_id, active) WHERE (trainer_user_id IS NOT NULL);
CREATE INDEX relationships_user_one_active_idx ON public.relationships USING btree (user_one_id, active);
CREATE INDEX relationships_user_two_active_idx ON public.relationships USING btree (user_two_id, active);
CREATE INDEX trainer_athlete_assigned_by_idx ON public.trainer_athlete_assignments USING btree (assigned_by);
CREATE INDEX trainer_athlete_athlete_idx ON public.trainer_athlete_assignments USING btree (athlete_user_id, active);
CREATE UNIQUE INDEX trainer_athlete_one_active_idx ON public.trainer_athlete_assignments USING btree (organization_id, trainer_user_id, athlete_user_id) WHERE active;
CREATE INDEX trainer_athlete_organization_idx ON public.trainer_athlete_assignments USING btree (organization_id, active);
CREATE INDEX trainer_athlete_trainer_idx ON public.trainer_athlete_assignments USING btree (trainer_user_id, active);
CREATE INDEX training_exercise_demo_videos_creator_idx ON public.training_exercise_demo_videos USING btree (created_by, created_at DESC);
CREATE INDEX training_exercise_demo_videos_origin_share_idx ON public.training_exercise_demo_videos USING btree (origin_snapshot_share_id);
CREATE INDEX training_exercise_demo_videos_plan_trick_idx ON public.training_exercise_demo_videos USING btree (source_plan_id, trick_id, created_at DESC);
CREATE INDEX training_plan_shares_shared_by_idx ON public.training_plan_shares USING btree (shared_by);
CREATE INDEX training_plan_shares_target_organization_idx ON public.training_plan_shares USING btree (target_organization_id);
CREATE INDEX training_plan_snapshot_group_idx ON public.training_plan_snapshot_shares USING btree (group_id, created_at DESC) WHERE (group_id IS NOT NULL);
CREATE INDEX training_plan_snapshot_recipient_idx ON public.training_plan_snapshot_shares USING btree (recipient_user_id, created_at DESC) WHERE (recipient_user_id IS NOT NULL);
CREATE INDEX training_plan_snapshot_sender_idx ON public.training_plan_snapshot_shares USING btree (shared_by, created_at DESC);
CREATE UNIQUE INDEX training_plan_social_shares_group_idx ON public.training_plan_social_shares USING btree (training_plan_id, group_id) WHERE (target_type = 'group'::share_target_type);
CREATE INDEX training_plan_social_shares_group_lookup_idx ON public.training_plan_social_shares USING btree (group_id, created_at DESC) WHERE (group_id IS NOT NULL);
CREATE UNIQUE INDEX training_plan_social_shares_person_idx ON public.training_plan_social_shares USING btree (training_plan_id, recipient_user_id) WHERE (target_type = 'person'::share_target_type);
CREATE INDEX training_plan_social_shares_recipient_idx ON public.training_plan_social_shares USING btree (recipient_user_id, created_at DESC) WHERE (recipient_user_id IS NOT NULL);
CREATE INDEX training_plan_social_shares_shared_by_idx ON public.training_plan_social_shares USING btree (shared_by, created_at DESC);
CREATE INDEX training_plan_versions_created_by_idx ON public.training_plan_versions USING btree (created_by);
CREATE INDEX training_plan_versions_plan_idx ON public.training_plan_versions USING btree (training_plan_id, version_number DESC);
CREATE INDEX training_plans_created_by_idx ON public.training_plans USING btree (created_by);
CREATE INDEX training_plans_organization_idx ON public.training_plans USING btree (organization_id);
CREATE INDEX training_trick_progress_athlete_idx ON public.training_trick_progress USING btree (athlete_id, status, updated_at DESC);
CREATE INDEX training_trick_progress_confirmer_idx ON public.training_trick_progress USING btree (confirmed_by) WHERE (confirmed_by IS NOT NULL);
CREATE INDEX training_trick_progress_share_idx ON public.training_trick_progress USING btree (snapshot_share_id);
CREATE INDEX training_video_evidence_athlete_history_idx ON public.training_video_evidence USING btree (athlete_id, submitted_at DESC);
CREATE UNIQUE INDEX training_video_evidence_one_pending_idx ON public.training_video_evidence USING btree (snapshot_share_id, trick_id, athlete_id) WHERE (review_status = 'pending'::training_evidence_review_status);
CREATE INDEX training_video_evidence_review_queue_idx ON public.training_video_evidence USING btree (review_status, submitted_at) WHERE (review_status = 'pending'::training_evidence_review_status);
CREATE INDEX training_video_evidence_share_trick_idx ON public.training_video_evidence USING btree (snapshot_share_id, trick_id, submitted_at DESC);
CREATE TRIGGER athlete_federation_validate BEFORE INSERT OR UPDATE OF athlete_id, federation_id, active ON public.athlete_federation_affiliations FOR EACH ROW EXECUTE FUNCTION private.validate_athlete_federation_affiliation();
CREATE TRIGGER events_add_creator_as_participant AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION private.add_event_creator_as_participant();
CREATE TRIGGER events_notify_social_circle AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION private.notify_new_event();
CREATE TRIGGER group_invitations_process BEFORE INSERT OR UPDATE ON public.group_invitations FOR EACH ROW EXECUTE FUNCTION private.process_group_invitation();
CREATE TRIGGER membership_requests_apply_approval AFTER UPDATE OF status ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION private.apply_approved_membership_request();
CREATE TRIGGER membership_requests_notify_insert AFTER INSERT ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION private.notify_membership_request();
CREATE TRIGGER membership_requests_notify_update AFTER UPDATE OF status ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION private.notify_membership_request();
CREATE TRIGGER membership_requests_validate_role BEFORE INSERT OR UPDATE OF organization_id, requested_role ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION private.validate_membership_role();
CREATE TRIGGER memberships_guard_delete BEFORE DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.guard_membership_delete();
CREATE TRIGGER memberships_invalidate_federation AFTER DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.invalidate_federation_after_membership_delete();
CREATE TRIGGER memberships_notify_club_joined AFTER INSERT ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.notify_club_membership_joined();
CREATE TRIGGER memberships_validate_role BEFORE INSERT OR UPDATE OF organization_id, role ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION private.validate_membership_role();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER organizations_validate_hierarchy BEFORE INSERT OR UPDATE OF parent_id, level ON public.organizations FOR EACH ROW EXECUTE FUNCTION private.validate_organization_hierarchy();
CREATE TRIGGER profiles_protect_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.protect_profile_update();
CREATE TRIGGER relationship_requests_apply_response BEFORE UPDATE OF status ON public.relationship_requests FOR EACH ROW EXECUTE FUNCTION private.apply_relationship_response();
CREATE TRIGGER relationship_requests_notify AFTER INSERT ON public.relationship_requests FOR EACH ROW EXECUTE FUNCTION private.notify_relationship_request();
CREATE TRIGGER relationship_requests_validate BEFORE INSERT OR UPDATE ON public.relationship_requests FOR EACH ROW EXECUTE FUNCTION private.validate_relationship_request();
CREATE TRIGGER social_groups_add_owner AFTER INSERT ON public.social_groups FOR EACH ROW EXECUTE FUNCTION private.add_group_owner();
CREATE TRIGGER training_plan_snapshot_initialize_progress AFTER INSERT ON public.training_plan_snapshot_shares FOR EACH ROW EXECUTE FUNCTION private.initialize_training_trick_progress();
CREATE TRIGGER training_plan_snapshot_shares_notify AFTER INSERT ON public.training_plan_snapshot_shares FOR EACH ROW EXECUTE FUNCTION private.notify_training_plan_snapshot_share();
CREATE TRIGGER training_plan_social_shares_notify AFTER INSERT ON public.training_plan_social_shares FOR EACH ROW EXECUTE FUNCTION private.notify_training_plan_share();
CREATE TRIGGER training_video_evidence_sync_progress AFTER INSERT OR UPDATE ON public.training_video_evidence FOR EACH ROW EXECUTE FUNCTION private.sync_training_video_evidence_progress();
CREATE TRIGGER training_video_evidence_validate_review BEFORE UPDATE ON public.training_video_evidence FOR EACH ROW EXECUTE FUNCTION private.validate_training_video_evidence_review();
alter table public.account_deletion_requests enable row level security;
alter table public.athlete_evaluation_contest_overrides enable row level security;
alter table public.athlete_evaluation_skill_ratings enable row level security;
alter table public.athlete_evaluations enable row level security;
alter table public.athlete_federation_affiliations enable row level security;
alter table public.athlete_personal_goals enable row level security;
alter table public.evaluation_skill_settings enable row level security;
alter table public.event_participants enable row level security;
alter table public.events enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_memberships enable row level security;
alter table public.membership_requests enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.profile_audit_events enable row level security;
alter table public.profiles enable row level security;
alter table public.relationship_requests enable row level security;
alter table public.relationships enable row level security;
alter table public.social_groups enable row level security;
alter table public.trainer_athlete_assignments enable row level security;
alter table public.trainer_evaluation_settings enable row level security;
alter table public.training_exercise_demo_videos enable row level security;
alter table public.training_plan_shares enable row level security;
alter table public.training_plan_snapshot_shares enable row level security;
alter table public.training_plan_social_shares enable row level security;
alter table public.training_plan_versions enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_trick_progress enable row level security;
alter table public.training_video_evidence enable row level security;
create policy account_deletion_read_self on public.account_deletion_requests as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy active_account_required on public.athlete_evaluation_contest_overrides as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.athlete_evaluation_skill_ratings as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.athlete_evaluations as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.athlete_federation_affiliations as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.athlete_personal_goals as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.evaluation_skill_settings as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.event_participants as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.events as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.group_invitations as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.group_memberships as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.membership_requests as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.notification_preferences as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.notifications as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.organization_memberships as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.organizations as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.profile_audit_events as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.relationship_requests as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.relationships as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.social_groups as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.trainer_athlete_assignments as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.trainer_evaluation_settings as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_exercise_demo_videos as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_plan_shares as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_plan_snapshot_shares as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_plan_social_shares as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_plan_versions as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_plans as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_trick_progress as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy active_account_required on public.training_video_evidence as RESTRICTIVE for ALL to authenticated using (private.current_account_is_active()) with check (private.current_account_is_active());
create policy athlete_evaluations_create_connected_trainer on public.athlete_evaluations as PERMISSIVE for INSERT to authenticated with check (((trainer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.has_active_trainer_athlete_relationship(athlete_evaluations.trainer_id, athlete_evaluations.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy athlete_evaluations_delete_connected_trainer on public.athlete_evaluations as PERMISSIVE for DELETE to authenticated using (((trainer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.has_active_trainer_athlete_relationship(athlete_evaluations.trainer_id, athlete_evaluations.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy athlete_evaluations_read_related on public.athlete_evaluations as PERMISSIVE for SELECT to authenticated using (((trainer_id = ( SELECT auth.uid() AS uid)) OR (athlete_id = ( SELECT auth.uid() AS uid))));
create policy athlete_evaluations_update_connected_trainer on public.athlete_evaluations as PERMISSIVE for UPDATE to authenticated using (((trainer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.has_active_trainer_athlete_relationship(athlete_evaluations.trainer_id, athlete_evaluations.athlete_id) AS has_active_trainer_athlete_relationship))) with check (((trainer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.has_active_trainer_athlete_relationship(athlete_evaluations.trainer_id, athlete_evaluations.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy athlete_federations_read_related on public.athlete_federation_affiliations as PERMISSIVE for SELECT to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(federation_id)));
create policy athlete_personal_goals_create_related on public.athlete_personal_goals as PERMISSIVE for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND ((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), athlete_personal_goals.athlete_id) AS has_active_trainer_athlete_relationship))));
create policy athlete_personal_goals_delete_related on public.athlete_personal_goals as PERMISSIVE for DELETE to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), athlete_personal_goals.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy athlete_personal_goals_read_related on public.athlete_personal_goals as PERMISSIVE for SELECT to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), athlete_personal_goals.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy athlete_personal_goals_update_related on public.athlete_personal_goals as PERMISSIVE for UPDATE to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), athlete_personal_goals.athlete_id) AS has_active_trainer_athlete_relationship))) with check (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), athlete_personal_goals.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy evaluation_contest_overrides_create_trainer on public.athlete_evaluation_contest_overrides as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_contest_overrides.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_contest_overrides_delete_trainer on public.athlete_evaluation_contest_overrides as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_contest_overrides.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_contest_overrides_read_related on public.athlete_evaluation_contest_overrides as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_contest_overrides.evaluation_id) AND ((evaluation.trainer_id = ( SELECT auth.uid() AS uid)) OR (evaluation.athlete_id = ( SELECT auth.uid() AS uid)))))));
create policy evaluation_contest_overrides_update_trainer on public.athlete_evaluation_contest_overrides as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_contest_overrides.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_contest_overrides.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_skill_ratings_create_trainer on public.athlete_evaluation_skill_ratings as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_skill_ratings.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_skill_ratings_delete_trainer on public.athlete_evaluation_skill_ratings as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_skill_ratings.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_skill_ratings_read_related on public.athlete_evaluation_skill_ratings as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_skill_ratings.evaluation_id) AND ((evaluation.trainer_id = ( SELECT auth.uid() AS uid)) OR (evaluation.athlete_id = ( SELECT auth.uid() AS uid)))))));
create policy evaluation_skill_ratings_update_trainer on public.athlete_evaluation_skill_ratings as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_skill_ratings.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM athlete_evaluations evaluation
  WHERE ((evaluation.id = athlete_evaluation_skill_ratings.evaluation_id) AND (evaluation.trainer_id = ( SELECT auth.uid() AS uid))))));
create policy evaluation_skill_settings_own on public.evaluation_skill_settings as PERMISSIVE for ALL to authenticated using ((trainer_id = ( SELECT auth.uid() AS uid))) with check ((trainer_id = ( SELECT auth.uid() AS uid)));
create policy events_create_as_author on public.events as PERMISSIVE for INSERT to authenticated with check (((created_by = auth.uid()) AND private.can_create_event(organization_id, type)));
create policy events_manage_for_authorized_roles on public.events as PERMISSIVE for ALL to authenticated using (private.can_manage_organization(organization_id)) with check ((private.can_manage_organization(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy events_read_for_members on public.events as PERMISSIVE for SELECT to authenticated using (private.is_organization_member(organization_id));
create policy events_read_for_visible_organizations on public.events as PERMISSIVE for SELECT to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) OR private.can_view_event_organization(organization_id) OR private.can_view_social_activity(created_by)));
create policy events_update_author on public.events as PERMISSIVE for UPDATE to authenticated using ((created_by = auth.uid())) with check (((created_by = auth.uid()) AND private.can_create_event(organization_id, type)));
create policy group_invitations_create_manager on public.group_invitations as PERMISSIVE for INSERT to authenticated with check (((invited_by = ( SELECT auth.uid() AS uid)) AND private.can_manage_group(group_id) AND (invited_user_id <> ( SELECT auth.uid() AS uid)) AND (status = 'pending'::request_status)));
create policy group_invitations_read_related on public.group_invitations as PERMISSIVE for SELECT to authenticated using (((invited_user_id = ( SELECT auth.uid() AS uid)) OR (invited_by = ( SELECT auth.uid() AS uid)) OR private.can_manage_group(group_id)));
create policy group_invitations_respond_or_withdraw on public.group_invitations as PERMISSIVE for UPDATE to authenticated using (((status = 'pending'::request_status) AND ((invited_user_id = ( SELECT auth.uid() AS uid)) OR (invited_by = ( SELECT auth.uid() AS uid))))) with check ((((invited_user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['approved'::request_status, 'rejected'::request_status]))) OR ((invited_by = ( SELECT auth.uid() AS uid)) AND (status = 'withdrawn'::request_status))));
create policy group_memberships_read_group on public.group_memberships as PERMISSIVE for SELECT to authenticated using (private.is_group_member(group_id));
create policy group_memberships_remove_self_or_manager on public.group_memberships as PERMISSIVE for DELETE to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_group(group_id)));
create policy membership_requests_create_self on public.membership_requests as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::request_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (requested_role = ANY (ARRAY['federal_chair'::member_role, 'specialist'::member_role, 'federal_trainer'::member_role, 'state_trainer'::member_role, 'club_trainer'::member_role, 'club_board'::member_role, 'athlete'::member_role, 'guardian'::member_role, 'medical'::member_role]))));
create policy membership_requests_read_related on public.membership_requests as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id)));
create policy membership_requests_review_managers on public.membership_requests as PERMISSIVE for UPDATE to authenticated using (private.can_manage_organization(organization_id)) with check ((private.can_manage_organization(organization_id) AND (reviewed_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['approved'::request_status, 'rejected'::request_status]))));
create policy memberships_assign_downward on public.organization_memberships as PERMISSIVE for INSERT to authenticated with check (((assigned_by = ( SELECT auth.uid() AS uid)) AND private.can_assign_membership(organization_id, role)));
create policy memberships_read_own_organizations on public.organization_memberships as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR private.can_view_organization(organization_id)));
create policy memberships_remove_downward on public.organization_memberships as PERMISSIVE for DELETE to authenticated using (private.can_assign_membership(organization_id, role));
create policy notification_preferences_create_self on public.notification_preferences as PERMISSIVE for INSERT to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy notification_preferences_read_self on public.notification_preferences as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy notification_preferences_update_self on public.notification_preferences as PERMISSIVE for UPDATE to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy notifications_read_self on public.notifications as PERMISSIVE for SELECT to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));
create policy notifications_update_self on public.notifications as PERMISSIVE for UPDATE to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy organizations_create_downward on public.organizations as PERMISSIVE for INSERT to authenticated with check (((parent_id IS NOT NULL) AND (created_by = ( SELECT auth.uid() AS uid)) AND private.can_create_organization(parent_id, level) AND ((level <> 'club'::organization_level) OR (state_code = ( SELECT parent.state_code
   FROM organizations parent
  WHERE ((parent.id = organizations.parent_id) AND (parent.level = 'state'::organization_level)))))));
create policy organizations_read_authenticated on public.organizations as PERMISSIVE for SELECT to authenticated using (true);
create policy organizations_read_registration_directory on public.organizations as PERMISSIVE for SELECT to anon using ((level = ANY (ARRAY['state'::organization_level, 'club'::organization_level])));
create policy organizations_update_managers on public.organizations as PERMISSIVE for UPDATE to authenticated using (private.can_manage_organization(id)) with check (private.can_manage_organization(id));
create policy participants_insert_self on public.event_participants as PERMISSIVE for INSERT to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (invited_by = ( SELECT auth.uid() AS uid)) AND (invited_email = private.current_profile_email()) AND (EXISTS ( SELECT 1
   FROM events event
  WHERE ((event.id = event_participants.event_id) AND private.can_view_event_organization(event.organization_id))))));
create policy participants_manage_event on public.event_participants as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM events event
  WHERE ((event.id = event_participants.event_id) AND ((event.created_by = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(event.organization_id)))))) with check ((EXISTS ( SELECT 1
   FROM events event
  WHERE ((event.id = event_participants.event_id) AND ((event.created_by = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(event.organization_id))))));
create policy participants_read_related on public.event_participants as PERMISSIVE for SELECT to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR (invited_email = private.current_profile_email()) OR (EXISTS ( SELECT 1
   FROM events event
  WHERE ((event.id = event_participants.event_id) AND private.can_view_event_organization(event.organization_id))))));
create policy participants_update_self on public.event_participants as PERMISSIVE for UPDATE to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR (invited_email = private.current_profile_email()))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (invited_email = private.current_profile_email())));
create policy plan_shares_manage_parent on public.training_plan_shares as PERMISSIVE for ALL to authenticated using (((shared_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_shares.training_plan_id) AND private.can_manage_organization(plan.organization_id)))))) with check (((shared_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_shares.training_plan_id) AND private.can_manage_organization(plan.organization_id))))));
create policy plan_shares_read_related on public.training_plan_shares as PERMISSIVE for SELECT to authenticated using ((private.is_organization_member(target_organization_id) OR (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_shares.training_plan_id) AND private.is_organization_member(plan.organization_id))))));
create policy plan_versions_manage_parent on public.training_plan_versions as PERMISSIVE for ALL to authenticated using (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_versions.training_plan_id) AND private.can_manage_organization(plan.organization_id)))))) with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_versions.training_plan_id) AND private.can_manage_organization(plan.organization_id))))));
create policy plan_versions_read_parent on public.training_plan_versions as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE (plan.id = training_plan_versions.training_plan_id))));
create policy plans_manage_authorized on public.training_plans as PERMISSIVE for ALL to authenticated using (private.can_manage_organization(organization_id)) with check ((private.can_manage_organization(organization_id) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy plans_read_owner_or_shared on public.training_plans as PERMISSIVE for SELECT to authenticated using ((private.is_organization_member(organization_id) OR private.can_view_shared_training_plan(id) OR (EXISTS ( SELECT 1
   FROM training_plan_shares share
  WHERE ((share.training_plan_id = share.id) AND private.is_organization_member(share.target_organization_id))))));
create policy profile_audit_read_related on public.profile_audit_events as PERMISSIVE for SELECT to authenticated using (((subject_user_id = ( SELECT auth.uid() AS uid)) OR ((organization_id IS NOT NULL) AND private.can_manage_organization(organization_id))));
create policy profiles_read_by_visibility on public.profiles as PERMISSIVE for SELECT to authenticated using ((((id = ( SELECT auth.uid() AS uid)) AND private.current_account_is_active()) OR private.can_view_profile(id)));
create policy profiles_update_active_self on public.profiles as PERMISSIVE for UPDATE to authenticated using (((id = ( SELECT auth.uid() AS uid)) AND private.current_account_is_active())) with check (((id = ( SELECT auth.uid() AS uid)) AND private.current_account_is_active()));
create policy relationship_requests_create_self on public.relationship_requests as PERMISSIVE for INSERT to authenticated with check (((sender_user_id = ( SELECT auth.uid() AS uid)) AND (recipient_user_id <> ( SELECT auth.uid() AS uid)) AND (status = 'pending'::request_status) AND (responded_at IS NULL)));
create policy relationship_requests_read_related on public.relationship_requests as PERMISSIVE for SELECT to authenticated using (((( SELECT auth.uid() AS uid) = sender_user_id) OR (( SELECT auth.uid() AS uid) = recipient_user_id)));
create policy relationship_requests_respond_or_withdraw on public.relationship_requests as PERMISSIVE for UPDATE to authenticated using (((status = 'pending'::request_status) AND ((( SELECT auth.uid() AS uid) = sender_user_id) OR (( SELECT auth.uid() AS uid) = recipient_user_id)))) with check ((((recipient_user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['approved'::request_status, 'rejected'::request_status]))) OR ((sender_user_id = ( SELECT auth.uid() AS uid)) AND (status = 'withdrawn'::request_status))));
create policy relationships_read_participants on public.relationships as PERMISSIVE for SELECT to authenticated using (((( SELECT auth.uid() AS uid) = user_one_id) OR (( SELECT auth.uid() AS uid) = user_two_id)));
create policy social_groups_create_self on public.social_groups as PERMISSIVE for INSERT to authenticated with check ((created_by = ( SELECT auth.uid() AS uid)));
create policy social_groups_read_members on public.social_groups as PERMISSIVE for SELECT to authenticated using (private.is_group_member(id));
create policy social_groups_update_managers on public.social_groups as PERMISSIVE for UPDATE to authenticated using (private.can_manage_group(id)) with check (private.can_manage_group(id));
create policy trainer_assignments_create_self on public.trainer_athlete_assignments as PERMISSIVE for INSERT to authenticated with check (((assigned_by = ( SELECT auth.uid() AS uid)) AND private.can_assign_athlete(organization_id, trainer_user_id, athlete_user_id)));
create policy trainer_assignments_end_self_or_manager on public.trainer_athlete_assignments as PERMISSIVE for UPDATE to authenticated using (((trainer_user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id))) with check (((NOT active) AND (ended_at IS NOT NULL) AND ((trainer_user_id = ( SELECT auth.uid() AS uid)) OR private.can_manage_organization(organization_id))));
create policy trainer_assignments_read_related on public.trainer_athlete_assignments as PERMISSIVE for SELECT to authenticated using (((trainer_user_id = ( SELECT auth.uid() AS uid)) OR (athlete_user_id = ( SELECT auth.uid() AS uid)) OR private.can_view_organization(organization_id)));
create policy trainer_evaluation_settings_own on public.trainer_evaluation_settings as PERMISSIVE for ALL to authenticated using ((trainer_id = ( SELECT auth.uid() AS uid))) with check ((trainer_id = ( SELECT auth.uid() AS uid)));
create policy training_exercise_demo_videos_create_by_sharing_trainer on public.training_exercise_demo_videos as PERMISSIVE for INSERT to authenticated with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plan_snapshot_shares share
  WHERE ((share.id = training_exercise_demo_videos.origin_snapshot_share_id) AND (share.shared_by = ( SELECT auth.uid() AS uid)) AND (share.target_type = 'person'::share_target_type) AND ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), share.recipient_user_id) AS has_active_trainer_athlete_relationship) AND ((share.plan_snapshot ->> 'id'::text) = training_exercise_demo_videos.source_plan_id) AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements(COALESCE((share.plan_snapshot -> 'tricks'::text), '[]'::jsonb)) trick(value)
          WHERE ((trick.value ->> 'id'::text) = training_exercise_demo_videos.trick_id))))))));
create policy training_exercise_demo_videos_read_allowed on public.training_exercise_demo_videos as PERMISSIVE for SELECT to authenticated using (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((visibility = 'public'::training_demo_visibility) OR (created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM training_plan_snapshot_shares share
  WHERE ((share.target_type = 'person'::share_target_type) AND (share.recipient_user_id = ( SELECT auth.uid() AS uid)) AND ((share.plan_snapshot ->> 'id'::text) = training_exercise_demo_videos.source_plan_id) AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements(COALESCE((share.plan_snapshot -> 'tricks'::text), '[]'::jsonb)) trick(value)
          WHERE ((trick.value ->> 'id'::text) = training_exercise_demo_videos.trick_id)))))))));
create policy training_plan_snapshot_shares_create_connected on public.training_plan_snapshot_shares as PERMISSIVE for INSERT to authenticated with check (((shared_by = ( SELECT auth.uid() AS uid)) AND (((target_type = 'person'::share_target_type) AND private.are_connected(( SELECT auth.uid() AS uid), recipient_user_id)) OR ((target_type = 'group'::share_target_type) AND private.can_manage_group(group_id)))));
create policy training_plan_snapshot_shares_read_related on public.training_plan_snapshot_shares as PERMISSIVE for SELECT to authenticated using (((shared_by = ( SELECT auth.uid() AS uid)) OR (recipient_user_id = ( SELECT auth.uid() AS uid)) OR ((group_id IS NOT NULL) AND private.is_group_member(group_id))));
create policy training_plan_social_shares_create_owner on public.training_plan_social_shares as PERMISSIVE for INSERT to authenticated with check (((shared_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM training_plans plan
  WHERE ((plan.id = training_plan_social_shares.training_plan_id) AND (plan.created_by = ( SELECT auth.uid() AS uid))))) AND (((target_type = 'person'::share_target_type) AND private.are_connected(( SELECT auth.uid() AS uid), recipient_user_id)) OR ((target_type = 'group'::share_target_type) AND private.can_manage_group(group_id)))));
create policy training_plan_social_shares_read_related on public.training_plan_social_shares as PERMISSIVE for SELECT to authenticated using (((shared_by = ( SELECT auth.uid() AS uid)) OR (recipient_user_id = ( SELECT auth.uid() AS uid)) OR ((group_id IS NOT NULL) AND private.is_group_member(group_id))));
create policy training_trick_progress_read_related on public.training_trick_progress as PERMISSIVE for SELECT to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), training_trick_progress.athlete_id) AS has_active_trainer_athlete_relationship) OR (EXISTS ( SELECT 1
   FROM training_plan_snapshot_shares share
  WHERE ((share.id = training_trick_progress.snapshot_share_id) AND (share.shared_by = ( SELECT auth.uid() AS uid)))))));
create policy training_video_evidence_create_own_assignment on public.training_video_evidence as PERMISSIVE for INSERT to authenticated with check (((athlete_id = ( SELECT auth.uid() AS uid)) AND (review_status = 'pending'::training_evidence_review_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM (training_trick_progress progress
     JOIN training_plan_snapshot_shares share ON ((share.id = progress.snapshot_share_id)))
  WHERE ((progress.snapshot_share_id = training_video_evidence.snapshot_share_id) AND (progress.trick_id = training_video_evidence.trick_id) AND (progress.athlete_id = ( SELECT auth.uid() AS uid)) AND (progress.status = 'in_progress'::trick_progress_status) AND (share.target_type = 'person'::share_target_type) AND (share.recipient_user_id = ( SELECT auth.uid() AS uid)))))));
create policy training_video_evidence_read_related on public.training_video_evidence as PERMISSIVE for SELECT to authenticated using (((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), training_video_evidence.athlete_id) AS has_active_trainer_athlete_relationship)));
create policy training_video_evidence_review_assigned_trainer on public.training_video_evidence as PERMISSIVE for UPDATE to authenticated using (((review_status = 'pending'::training_evidence_review_status) AND ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), training_video_evidence.athlete_id) AS has_active_trainer_athlete_relationship))) with check (((review_status = ANY (ARRAY['approved'::training_evidence_review_status, 'changes_requested'::training_evidence_review_status])) AND (reviewed_by = ( SELECT auth.uid() AS uid)) AND (reviewed_at IS NOT NULL) AND ( SELECT private.has_active_trainer_athlete_relationship(( SELECT auth.uid() AS uid), training_video_evidence.athlete_id) AS has_active_trainer_athlete_relationship)));
revoke all on table public.account_deletion_requests from public,anon,authenticated,service_role;
revoke all on table public.athlete_evaluation_contest_overrides from public,anon,authenticated,service_role;
revoke all on table public.athlete_evaluation_skill_ratings from public,anon,authenticated,service_role;
revoke all on table public.athlete_evaluations from public,anon,authenticated,service_role;
revoke all on table public.athlete_federation_affiliations from public,anon,authenticated,service_role;
revoke all on table public.athlete_personal_goals from public,anon,authenticated,service_role;
revoke all on table public.evaluation_skill_settings from public,anon,authenticated,service_role;
revoke all on table public.event_participants from public,anon,authenticated,service_role;
revoke all on table public.events from public,anon,authenticated,service_role;
revoke all on table public.group_invitations from public,anon,authenticated,service_role;
revoke all on table public.group_memberships from public,anon,authenticated,service_role;
revoke all on table public.membership_requests from public,anon,authenticated,service_role;
revoke all on table public.notification_preferences from public,anon,authenticated,service_role;
revoke all on table public.notifications from public,anon,authenticated,service_role;
revoke all on table public.organization_memberships from public,anon,authenticated,service_role;
revoke all on table public.organizations from public,anon,authenticated,service_role;
revoke all on table public.profile_audit_events from public,anon,authenticated,service_role;
revoke all on table public.profiles from public,anon,authenticated,service_role;
revoke all on table public.relationship_requests from public,anon,authenticated,service_role;
revoke all on table public.relationships from public,anon,authenticated,service_role;
revoke all on table public.social_groups from public,anon,authenticated,service_role;
revoke all on table public.trainer_athlete_assignments from public,anon,authenticated,service_role;
revoke all on table public.trainer_evaluation_settings from public,anon,authenticated,service_role;
revoke all on table public.training_exercise_demo_videos from public,anon,authenticated,service_role;
revoke all on table public.training_plan_shares from public,anon,authenticated,service_role;
revoke all on table public.training_plan_snapshot_shares from public,anon,authenticated,service_role;
revoke all on table public.training_plan_social_shares from public,anon,authenticated,service_role;
revoke all on table public.training_plan_versions from public,anon,authenticated,service_role;
revoke all on table public.training_plans from public,anon,authenticated,service_role;
revoke all on table public.training_trick_progress from public,anon,authenticated,service_role;
revoke all on table public.training_video_evidence from public,anon,authenticated,service_role;
grant DELETE on table public.account_deletion_requests to anon;
grant DELETE on table public.account_deletion_requests to authenticated;
grant DELETE on table public.account_deletion_requests to service_role;
grant INSERT on table public.account_deletion_requests to anon;
grant INSERT on table public.account_deletion_requests to authenticated;
grant INSERT on table public.account_deletion_requests to service_role;
grant MAINTAIN on table public.account_deletion_requests to anon;
grant MAINTAIN on table public.account_deletion_requests to authenticated;
grant MAINTAIN on table public.account_deletion_requests to service_role;
grant REFERENCES on table public.account_deletion_requests to anon;
grant REFERENCES on table public.account_deletion_requests to authenticated;
grant REFERENCES on table public.account_deletion_requests to service_role;
grant SELECT on table public.account_deletion_requests to anon;
grant SELECT on table public.account_deletion_requests to authenticated;
grant SELECT on table public.account_deletion_requests to service_role;
grant TRIGGER on table public.account_deletion_requests to anon;
grant TRIGGER on table public.account_deletion_requests to authenticated;
grant TRIGGER on table public.account_deletion_requests to service_role;
grant TRUNCATE on table public.account_deletion_requests to anon;
grant TRUNCATE on table public.account_deletion_requests to authenticated;
grant TRUNCATE on table public.account_deletion_requests to service_role;
grant UPDATE on table public.account_deletion_requests to anon;
grant UPDATE on table public.account_deletion_requests to authenticated;
grant UPDATE on table public.account_deletion_requests to service_role;
grant DELETE on table public.athlete_evaluation_contest_overrides to authenticated;
grant DELETE on table public.athlete_evaluation_contest_overrides to service_role;
grant INSERT on table public.athlete_evaluation_contest_overrides to authenticated;
grant INSERT on table public.athlete_evaluation_contest_overrides to service_role;
grant MAINTAIN on table public.athlete_evaluation_contest_overrides to service_role;
grant REFERENCES on table public.athlete_evaluation_contest_overrides to service_role;
grant SELECT on table public.athlete_evaluation_contest_overrides to authenticated;
grant SELECT on table public.athlete_evaluation_contest_overrides to service_role;
grant TRIGGER on table public.athlete_evaluation_contest_overrides to service_role;
grant TRUNCATE on table public.athlete_evaluation_contest_overrides to service_role;
grant UPDATE on table public.athlete_evaluation_contest_overrides to authenticated;
grant UPDATE on table public.athlete_evaluation_contest_overrides to service_role;
grant DELETE on table public.athlete_evaluation_skill_ratings to authenticated;
grant DELETE on table public.athlete_evaluation_skill_ratings to service_role;
grant INSERT on table public.athlete_evaluation_skill_ratings to authenticated;
grant INSERT on table public.athlete_evaluation_skill_ratings to service_role;
grant MAINTAIN on table public.athlete_evaluation_skill_ratings to service_role;
grant REFERENCES on table public.athlete_evaluation_skill_ratings to service_role;
grant SELECT on table public.athlete_evaluation_skill_ratings to authenticated;
grant SELECT on table public.athlete_evaluation_skill_ratings to service_role;
grant TRIGGER on table public.athlete_evaluation_skill_ratings to service_role;
grant TRUNCATE on table public.athlete_evaluation_skill_ratings to service_role;
grant UPDATE on table public.athlete_evaluation_skill_ratings to authenticated;
grant UPDATE on table public.athlete_evaluation_skill_ratings to service_role;
grant DELETE on table public.athlete_evaluations to authenticated;
grant DELETE on table public.athlete_evaluations to service_role;
grant INSERT on table public.athlete_evaluations to authenticated;
grant INSERT on table public.athlete_evaluations to service_role;
grant MAINTAIN on table public.athlete_evaluations to service_role;
grant REFERENCES on table public.athlete_evaluations to service_role;
grant SELECT on table public.athlete_evaluations to authenticated;
grant SELECT on table public.athlete_evaluations to service_role;
grant TRIGGER on table public.athlete_evaluations to service_role;
grant TRUNCATE on table public.athlete_evaluations to service_role;
grant UPDATE on table public.athlete_evaluations to authenticated;
grant UPDATE on table public.athlete_evaluations to service_role;
grant DELETE on table public.athlete_federation_affiliations to anon;
grant DELETE on table public.athlete_federation_affiliations to authenticated;
grant DELETE on table public.athlete_federation_affiliations to service_role;
grant INSERT on table public.athlete_federation_affiliations to anon;
grant INSERT on table public.athlete_federation_affiliations to authenticated;
grant INSERT on table public.athlete_federation_affiliations to service_role;
grant MAINTAIN on table public.athlete_federation_affiliations to anon;
grant MAINTAIN on table public.athlete_federation_affiliations to authenticated;
grant MAINTAIN on table public.athlete_federation_affiliations to service_role;
grant REFERENCES on table public.athlete_federation_affiliations to anon;
grant REFERENCES on table public.athlete_federation_affiliations to authenticated;
grant REFERENCES on table public.athlete_federation_affiliations to service_role;
grant SELECT on table public.athlete_federation_affiliations to anon;
grant SELECT on table public.athlete_federation_affiliations to authenticated;
grant SELECT on table public.athlete_federation_affiliations to service_role;
grant TRIGGER on table public.athlete_federation_affiliations to anon;
grant TRIGGER on table public.athlete_federation_affiliations to authenticated;
grant TRIGGER on table public.athlete_federation_affiliations to service_role;
grant TRUNCATE on table public.athlete_federation_affiliations to anon;
grant TRUNCATE on table public.athlete_federation_affiliations to authenticated;
grant TRUNCATE on table public.athlete_federation_affiliations to service_role;
grant UPDATE on table public.athlete_federation_affiliations to anon;
grant UPDATE on table public.athlete_federation_affiliations to authenticated;
grant UPDATE on table public.athlete_federation_affiliations to service_role;
grant DELETE on table public.athlete_personal_goals to authenticated;
grant DELETE on table public.athlete_personal_goals to service_role;
grant INSERT on table public.athlete_personal_goals to authenticated;
grant INSERT on table public.athlete_personal_goals to service_role;
grant MAINTAIN on table public.athlete_personal_goals to service_role;
grant REFERENCES on table public.athlete_personal_goals to service_role;
grant SELECT on table public.athlete_personal_goals to authenticated;
grant SELECT on table public.athlete_personal_goals to service_role;
grant TRIGGER on table public.athlete_personal_goals to service_role;
grant TRUNCATE on table public.athlete_personal_goals to service_role;
grant UPDATE on table public.athlete_personal_goals to authenticated;
grant UPDATE on table public.athlete_personal_goals to service_role;
grant DELETE on table public.evaluation_skill_settings to authenticated;
grant DELETE on table public.evaluation_skill_settings to service_role;
grant INSERT on table public.evaluation_skill_settings to authenticated;
grant INSERT on table public.evaluation_skill_settings to service_role;
grant MAINTAIN on table public.evaluation_skill_settings to service_role;
grant REFERENCES on table public.evaluation_skill_settings to service_role;
grant SELECT on table public.evaluation_skill_settings to authenticated;
grant SELECT on table public.evaluation_skill_settings to service_role;
grant TRIGGER on table public.evaluation_skill_settings to service_role;
grant TRUNCATE on table public.evaluation_skill_settings to service_role;
grant UPDATE on table public.evaluation_skill_settings to authenticated;
grant UPDATE on table public.evaluation_skill_settings to service_role;
grant DELETE on table public.event_participants to authenticated;
grant DELETE on table public.event_participants to service_role;
grant INSERT on table public.event_participants to authenticated;
grant INSERT on table public.event_participants to service_role;
grant MAINTAIN on table public.event_participants to authenticated;
grant MAINTAIN on table public.event_participants to service_role;
grant REFERENCES on table public.event_participants to authenticated;
grant REFERENCES on table public.event_participants to service_role;
grant SELECT on table public.event_participants to authenticated;
grant SELECT on table public.event_participants to service_role;
grant TRIGGER on table public.event_participants to authenticated;
grant TRIGGER on table public.event_participants to service_role;
grant TRUNCATE on table public.event_participants to authenticated;
grant TRUNCATE on table public.event_participants to service_role;
grant UPDATE on table public.event_participants to authenticated;
grant UPDATE on table public.event_participants to service_role;
grant DELETE on table public.events to authenticated;
grant DELETE on table public.events to service_role;
grant INSERT on table public.events to authenticated;
grant INSERT on table public.events to service_role;
grant MAINTAIN on table public.events to authenticated;
grant MAINTAIN on table public.events to service_role;
grant REFERENCES on table public.events to authenticated;
grant REFERENCES on table public.events to service_role;
grant SELECT on table public.events to authenticated;
grant SELECT on table public.events to service_role;
grant TRIGGER on table public.events to authenticated;
grant TRIGGER on table public.events to service_role;
grant TRUNCATE on table public.events to authenticated;
grant TRUNCATE on table public.events to service_role;
grant UPDATE on table public.events to authenticated;
grant UPDATE on table public.events to service_role;
grant DELETE on table public.group_invitations to anon;
grant DELETE on table public.group_invitations to authenticated;
grant DELETE on table public.group_invitations to service_role;
grant INSERT on table public.group_invitations to anon;
grant INSERT on table public.group_invitations to authenticated;
grant INSERT on table public.group_invitations to service_role;
grant MAINTAIN on table public.group_invitations to anon;
grant MAINTAIN on table public.group_invitations to authenticated;
grant MAINTAIN on table public.group_invitations to service_role;
grant REFERENCES on table public.group_invitations to anon;
grant REFERENCES on table public.group_invitations to authenticated;
grant REFERENCES on table public.group_invitations to service_role;
grant SELECT on table public.group_invitations to anon;
grant SELECT on table public.group_invitations to authenticated;
grant SELECT on table public.group_invitations to service_role;
grant TRIGGER on table public.group_invitations to anon;
grant TRIGGER on table public.group_invitations to authenticated;
grant TRIGGER on table public.group_invitations to service_role;
grant TRUNCATE on table public.group_invitations to anon;
grant TRUNCATE on table public.group_invitations to authenticated;
grant TRUNCATE on table public.group_invitations to service_role;
grant UPDATE on table public.group_invitations to anon;
grant UPDATE on table public.group_invitations to authenticated;
grant UPDATE on table public.group_invitations to service_role;
grant DELETE on table public.group_memberships to anon;
grant DELETE on table public.group_memberships to authenticated;
grant DELETE on table public.group_memberships to service_role;
grant INSERT on table public.group_memberships to anon;
grant INSERT on table public.group_memberships to authenticated;
grant INSERT on table public.group_memberships to service_role;
grant MAINTAIN on table public.group_memberships to anon;
grant MAINTAIN on table public.group_memberships to authenticated;
grant MAINTAIN on table public.group_memberships to service_role;
grant REFERENCES on table public.group_memberships to anon;
grant REFERENCES on table public.group_memberships to authenticated;
grant REFERENCES on table public.group_memberships to service_role;
grant SELECT on table public.group_memberships to anon;
grant SELECT on table public.group_memberships to authenticated;
grant SELECT on table public.group_memberships to service_role;
grant TRIGGER on table public.group_memberships to anon;
grant TRIGGER on table public.group_memberships to authenticated;
grant TRIGGER on table public.group_memberships to service_role;
grant TRUNCATE on table public.group_memberships to anon;
grant TRUNCATE on table public.group_memberships to authenticated;
grant TRUNCATE on table public.group_memberships to service_role;
grant UPDATE on table public.group_memberships to anon;
grant UPDATE on table public.group_memberships to authenticated;
grant UPDATE on table public.group_memberships to service_role;
grant DELETE on table public.membership_requests to anon;
grant DELETE on table public.membership_requests to authenticated;
grant DELETE on table public.membership_requests to service_role;
grant INSERT on table public.membership_requests to anon;
grant INSERT on table public.membership_requests to authenticated;
grant INSERT on table public.membership_requests to service_role;
grant MAINTAIN on table public.membership_requests to anon;
grant MAINTAIN on table public.membership_requests to authenticated;
grant MAINTAIN on table public.membership_requests to service_role;
grant REFERENCES on table public.membership_requests to anon;
grant REFERENCES on table public.membership_requests to authenticated;
grant REFERENCES on table public.membership_requests to service_role;
grant SELECT on table public.membership_requests to anon;
grant SELECT on table public.membership_requests to authenticated;
grant SELECT on table public.membership_requests to service_role;
grant TRIGGER on table public.membership_requests to anon;
grant TRIGGER on table public.membership_requests to authenticated;
grant TRIGGER on table public.membership_requests to service_role;
grant TRUNCATE on table public.membership_requests to anon;
grant TRUNCATE on table public.membership_requests to authenticated;
grant TRUNCATE on table public.membership_requests to service_role;
grant UPDATE on table public.membership_requests to anon;
grant UPDATE on table public.membership_requests to authenticated;
grant UPDATE on table public.membership_requests to service_role;
grant DELETE on table public.notification_preferences to anon;
grant DELETE on table public.notification_preferences to authenticated;
grant DELETE on table public.notification_preferences to service_role;
grant INSERT on table public.notification_preferences to anon;
grant INSERT on table public.notification_preferences to authenticated;
grant INSERT on table public.notification_preferences to service_role;
grant MAINTAIN on table public.notification_preferences to anon;
grant MAINTAIN on table public.notification_preferences to authenticated;
grant MAINTAIN on table public.notification_preferences to service_role;
grant REFERENCES on table public.notification_preferences to anon;
grant REFERENCES on table public.notification_preferences to authenticated;
grant REFERENCES on table public.notification_preferences to service_role;
grant SELECT on table public.notification_preferences to anon;
grant SELECT on table public.notification_preferences to authenticated;
grant SELECT on table public.notification_preferences to service_role;
grant TRIGGER on table public.notification_preferences to anon;
grant TRIGGER on table public.notification_preferences to authenticated;
grant TRIGGER on table public.notification_preferences to service_role;
grant TRUNCATE on table public.notification_preferences to anon;
grant TRUNCATE on table public.notification_preferences to authenticated;
grant TRUNCATE on table public.notification_preferences to service_role;
grant UPDATE on table public.notification_preferences to anon;
grant UPDATE on table public.notification_preferences to authenticated;
grant UPDATE on table public.notification_preferences to service_role;
grant DELETE on table public.notifications to anon;
grant DELETE on table public.notifications to authenticated;
grant DELETE on table public.notifications to service_role;
grant INSERT on table public.notifications to anon;
grant INSERT on table public.notifications to authenticated;
grant INSERT on table public.notifications to service_role;
grant MAINTAIN on table public.notifications to anon;
grant MAINTAIN on table public.notifications to authenticated;
grant MAINTAIN on table public.notifications to service_role;
grant REFERENCES on table public.notifications to anon;
grant REFERENCES on table public.notifications to authenticated;
grant REFERENCES on table public.notifications to service_role;
grant SELECT on table public.notifications to anon;
grant SELECT on table public.notifications to authenticated;
grant SELECT on table public.notifications to service_role;
grant TRIGGER on table public.notifications to anon;
grant TRIGGER on table public.notifications to authenticated;
grant TRIGGER on table public.notifications to service_role;
grant TRUNCATE on table public.notifications to anon;
grant TRUNCATE on table public.notifications to authenticated;
grant TRUNCATE on table public.notifications to service_role;
grant UPDATE on table public.notifications to anon;
grant UPDATE on table public.notifications to authenticated;
grant UPDATE on table public.notifications to service_role;
grant DELETE on table public.organization_memberships to authenticated;
grant DELETE on table public.organization_memberships to service_role;
grant INSERT on table public.organization_memberships to authenticated;
grant INSERT on table public.organization_memberships to service_role;
grant MAINTAIN on table public.organization_memberships to authenticated;
grant MAINTAIN on table public.organization_memberships to service_role;
grant REFERENCES on table public.organization_memberships to authenticated;
grant REFERENCES on table public.organization_memberships to service_role;
grant SELECT on table public.organization_memberships to authenticated;
grant SELECT on table public.organization_memberships to service_role;
grant TRIGGER on table public.organization_memberships to authenticated;
grant TRIGGER on table public.organization_memberships to service_role;
grant TRUNCATE on table public.organization_memberships to authenticated;
grant TRUNCATE on table public.organization_memberships to service_role;
grant UPDATE on table public.organization_memberships to authenticated;
grant UPDATE on table public.organization_memberships to service_role;
grant DELETE on table public.organizations to authenticated;
grant DELETE on table public.organizations to service_role;
grant INSERT on table public.organizations to authenticated;
grant INSERT on table public.organizations to service_role;
grant MAINTAIN on table public.organizations to authenticated;
grant MAINTAIN on table public.organizations to service_role;
grant REFERENCES on table public.organizations to authenticated;
grant REFERENCES on table public.organizations to service_role;
grant SELECT on table public.organizations to authenticated;
grant SELECT on table public.organizations to service_role;
grant TRIGGER on table public.organizations to authenticated;
grant TRIGGER on table public.organizations to service_role;
grant TRUNCATE on table public.organizations to authenticated;
grant TRUNCATE on table public.organizations to service_role;
grant UPDATE on table public.organizations to authenticated;
grant UPDATE on table public.organizations to service_role;
grant DELETE on table public.profile_audit_events to anon;
grant DELETE on table public.profile_audit_events to authenticated;
grant DELETE on table public.profile_audit_events to service_role;
grant INSERT on table public.profile_audit_events to anon;
grant INSERT on table public.profile_audit_events to authenticated;
grant INSERT on table public.profile_audit_events to service_role;
grant MAINTAIN on table public.profile_audit_events to anon;
grant MAINTAIN on table public.profile_audit_events to authenticated;
grant MAINTAIN on table public.profile_audit_events to service_role;
grant REFERENCES on table public.profile_audit_events to anon;
grant REFERENCES on table public.profile_audit_events to authenticated;
grant REFERENCES on table public.profile_audit_events to service_role;
grant SELECT on table public.profile_audit_events to anon;
grant SELECT on table public.profile_audit_events to authenticated;
grant SELECT on table public.profile_audit_events to service_role;
grant TRIGGER on table public.profile_audit_events to anon;
grant TRIGGER on table public.profile_audit_events to authenticated;
grant TRIGGER on table public.profile_audit_events to service_role;
grant TRUNCATE on table public.profile_audit_events to anon;
grant TRUNCATE on table public.profile_audit_events to authenticated;
grant TRUNCATE on table public.profile_audit_events to service_role;
grant UPDATE on table public.profile_audit_events to anon;
grant UPDATE on table public.profile_audit_events to authenticated;
grant UPDATE on table public.profile_audit_events to service_role;
grant DELETE on table public.profiles to authenticated;
grant DELETE on table public.profiles to service_role;
grant INSERT on table public.profiles to authenticated;
grant INSERT on table public.profiles to service_role;
grant MAINTAIN on table public.profiles to authenticated;
grant MAINTAIN on table public.profiles to service_role;
grant REFERENCES on table public.profiles to authenticated;
grant REFERENCES on table public.profiles to service_role;
grant SELECT on table public.profiles to service_role;
grant TRIGGER on table public.profiles to authenticated;
grant TRIGGER on table public.profiles to service_role;
grant TRUNCATE on table public.profiles to authenticated;
grant TRUNCATE on table public.profiles to service_role;
grant UPDATE on table public.profiles to authenticated;
grant UPDATE on table public.profiles to service_role;
grant DELETE on table public.relationship_requests to anon;
grant DELETE on table public.relationship_requests to authenticated;
grant DELETE on table public.relationship_requests to service_role;
grant INSERT on table public.relationship_requests to anon;
grant INSERT on table public.relationship_requests to authenticated;
grant INSERT on table public.relationship_requests to service_role;
grant MAINTAIN on table public.relationship_requests to anon;
grant MAINTAIN on table public.relationship_requests to authenticated;
grant MAINTAIN on table public.relationship_requests to service_role;
grant REFERENCES on table public.relationship_requests to anon;
grant REFERENCES on table public.relationship_requests to authenticated;
grant REFERENCES on table public.relationship_requests to service_role;
grant SELECT on table public.relationship_requests to anon;
grant SELECT on table public.relationship_requests to authenticated;
grant SELECT on table public.relationship_requests to service_role;
grant TRIGGER on table public.relationship_requests to anon;
grant TRIGGER on table public.relationship_requests to authenticated;
grant TRIGGER on table public.relationship_requests to service_role;
grant TRUNCATE on table public.relationship_requests to anon;
grant TRUNCATE on table public.relationship_requests to authenticated;
grant TRUNCATE on table public.relationship_requests to service_role;
grant UPDATE on table public.relationship_requests to anon;
grant UPDATE on table public.relationship_requests to authenticated;
grant UPDATE on table public.relationship_requests to service_role;
grant DELETE on table public.relationships to anon;
grant DELETE on table public.relationships to authenticated;
grant DELETE on table public.relationships to service_role;
grant INSERT on table public.relationships to anon;
grant INSERT on table public.relationships to authenticated;
grant INSERT on table public.relationships to service_role;
grant MAINTAIN on table public.relationships to anon;
grant MAINTAIN on table public.relationships to authenticated;
grant MAINTAIN on table public.relationships to service_role;
grant REFERENCES on table public.relationships to anon;
grant REFERENCES on table public.relationships to authenticated;
grant REFERENCES on table public.relationships to service_role;
grant SELECT on table public.relationships to anon;
grant SELECT on table public.relationships to authenticated;
grant SELECT on table public.relationships to service_role;
grant TRIGGER on table public.relationships to anon;
grant TRIGGER on table public.relationships to authenticated;
grant TRIGGER on table public.relationships to service_role;
grant TRUNCATE on table public.relationships to anon;
grant TRUNCATE on table public.relationships to authenticated;
grant TRUNCATE on table public.relationships to service_role;
grant UPDATE on table public.relationships to anon;
grant UPDATE on table public.relationships to authenticated;
grant UPDATE on table public.relationships to service_role;
grant DELETE on table public.social_groups to anon;
grant DELETE on table public.social_groups to authenticated;
grant DELETE on table public.social_groups to service_role;
grant INSERT on table public.social_groups to anon;
grant INSERT on table public.social_groups to authenticated;
grant INSERT on table public.social_groups to service_role;
grant MAINTAIN on table public.social_groups to anon;
grant MAINTAIN on table public.social_groups to authenticated;
grant MAINTAIN on table public.social_groups to service_role;
grant REFERENCES on table public.social_groups to anon;
grant REFERENCES on table public.social_groups to authenticated;
grant REFERENCES on table public.social_groups to service_role;
grant SELECT on table public.social_groups to anon;
grant SELECT on table public.social_groups to authenticated;
grant SELECT on table public.social_groups to service_role;
grant TRIGGER on table public.social_groups to anon;
grant TRIGGER on table public.social_groups to authenticated;
grant TRIGGER on table public.social_groups to service_role;
grant TRUNCATE on table public.social_groups to anon;
grant TRUNCATE on table public.social_groups to authenticated;
grant TRUNCATE on table public.social_groups to service_role;
grant UPDATE on table public.social_groups to anon;
grant UPDATE on table public.social_groups to authenticated;
grant UPDATE on table public.social_groups to service_role;
grant DELETE on table public.trainer_athlete_assignments to anon;
grant DELETE on table public.trainer_athlete_assignments to authenticated;
grant DELETE on table public.trainer_athlete_assignments to service_role;
grant INSERT on table public.trainer_athlete_assignments to anon;
grant INSERT on table public.trainer_athlete_assignments to authenticated;
grant INSERT on table public.trainer_athlete_assignments to service_role;
grant MAINTAIN on table public.trainer_athlete_assignments to anon;
grant MAINTAIN on table public.trainer_athlete_assignments to authenticated;
grant MAINTAIN on table public.trainer_athlete_assignments to service_role;
grant REFERENCES on table public.trainer_athlete_assignments to anon;
grant REFERENCES on table public.trainer_athlete_assignments to authenticated;
grant REFERENCES on table public.trainer_athlete_assignments to service_role;
grant SELECT on table public.trainer_athlete_assignments to anon;
grant SELECT on table public.trainer_athlete_assignments to authenticated;
grant SELECT on table public.trainer_athlete_assignments to service_role;
grant TRIGGER on table public.trainer_athlete_assignments to anon;
grant TRIGGER on table public.trainer_athlete_assignments to authenticated;
grant TRIGGER on table public.trainer_athlete_assignments to service_role;
grant TRUNCATE on table public.trainer_athlete_assignments to anon;
grant TRUNCATE on table public.trainer_athlete_assignments to authenticated;
grant TRUNCATE on table public.trainer_athlete_assignments to service_role;
grant UPDATE on table public.trainer_athlete_assignments to anon;
grant UPDATE on table public.trainer_athlete_assignments to authenticated;
grant UPDATE on table public.trainer_athlete_assignments to service_role;
grant DELETE on table public.trainer_evaluation_settings to authenticated;
grant DELETE on table public.trainer_evaluation_settings to service_role;
grant INSERT on table public.trainer_evaluation_settings to authenticated;
grant INSERT on table public.trainer_evaluation_settings to service_role;
grant MAINTAIN on table public.trainer_evaluation_settings to service_role;
grant REFERENCES on table public.trainer_evaluation_settings to service_role;
grant SELECT on table public.trainer_evaluation_settings to authenticated;
grant SELECT on table public.trainer_evaluation_settings to service_role;
grant TRIGGER on table public.trainer_evaluation_settings to service_role;
grant TRUNCATE on table public.trainer_evaluation_settings to service_role;
grant UPDATE on table public.trainer_evaluation_settings to authenticated;
grant UPDATE on table public.trainer_evaluation_settings to service_role;
grant DELETE on table public.training_exercise_demo_videos to service_role;
grant INSERT on table public.training_exercise_demo_videos to authenticated;
grant INSERT on table public.training_exercise_demo_videos to service_role;
grant MAINTAIN on table public.training_exercise_demo_videos to service_role;
grant REFERENCES on table public.training_exercise_demo_videos to service_role;
grant SELECT on table public.training_exercise_demo_videos to authenticated;
grant SELECT on table public.training_exercise_demo_videos to service_role;
grant TRIGGER on table public.training_exercise_demo_videos to service_role;
grant TRUNCATE on table public.training_exercise_demo_videos to service_role;
grant UPDATE on table public.training_exercise_demo_videos to service_role;
grant DELETE on table public.training_plan_shares to authenticated;
grant DELETE on table public.training_plan_shares to service_role;
grant INSERT on table public.training_plan_shares to authenticated;
grant INSERT on table public.training_plan_shares to service_role;
grant MAINTAIN on table public.training_plan_shares to authenticated;
grant MAINTAIN on table public.training_plan_shares to service_role;
grant REFERENCES on table public.training_plan_shares to authenticated;
grant REFERENCES on table public.training_plan_shares to service_role;
grant SELECT on table public.training_plan_shares to authenticated;
grant SELECT on table public.training_plan_shares to service_role;
grant TRIGGER on table public.training_plan_shares to authenticated;
grant TRIGGER on table public.training_plan_shares to service_role;
grant TRUNCATE on table public.training_plan_shares to authenticated;
grant TRUNCATE on table public.training_plan_shares to service_role;
grant UPDATE on table public.training_plan_shares to authenticated;
grant UPDATE on table public.training_plan_shares to service_role;
grant DELETE on table public.training_plan_snapshot_shares to anon;
grant DELETE on table public.training_plan_snapshot_shares to authenticated;
grant DELETE on table public.training_plan_snapshot_shares to service_role;
grant INSERT on table public.training_plan_snapshot_shares to anon;
grant INSERT on table public.training_plan_snapshot_shares to authenticated;
grant INSERT on table public.training_plan_snapshot_shares to service_role;
grant MAINTAIN on table public.training_plan_snapshot_shares to anon;
grant MAINTAIN on table public.training_plan_snapshot_shares to authenticated;
grant MAINTAIN on table public.training_plan_snapshot_shares to service_role;
grant REFERENCES on table public.training_plan_snapshot_shares to anon;
grant REFERENCES on table public.training_plan_snapshot_shares to authenticated;
grant REFERENCES on table public.training_plan_snapshot_shares to service_role;
grant SELECT on table public.training_plan_snapshot_shares to anon;
grant SELECT on table public.training_plan_snapshot_shares to authenticated;
grant SELECT on table public.training_plan_snapshot_shares to service_role;
grant TRIGGER on table public.training_plan_snapshot_shares to anon;
grant TRIGGER on table public.training_plan_snapshot_shares to authenticated;
grant TRIGGER on table public.training_plan_snapshot_shares to service_role;
grant TRUNCATE on table public.training_plan_snapshot_shares to anon;
grant TRUNCATE on table public.training_plan_snapshot_shares to authenticated;
grant TRUNCATE on table public.training_plan_snapshot_shares to service_role;
grant UPDATE on table public.training_plan_snapshot_shares to anon;
grant UPDATE on table public.training_plan_snapshot_shares to authenticated;
grant UPDATE on table public.training_plan_snapshot_shares to service_role;
grant DELETE on table public.training_plan_social_shares to anon;
grant DELETE on table public.training_plan_social_shares to authenticated;
grant DELETE on table public.training_plan_social_shares to service_role;
grant INSERT on table public.training_plan_social_shares to anon;
grant INSERT on table public.training_plan_social_shares to authenticated;
grant INSERT on table public.training_plan_social_shares to service_role;
grant MAINTAIN on table public.training_plan_social_shares to anon;
grant MAINTAIN on table public.training_plan_social_shares to authenticated;
grant MAINTAIN on table public.training_plan_social_shares to service_role;
grant REFERENCES on table public.training_plan_social_shares to anon;
grant REFERENCES on table public.training_plan_social_shares to authenticated;
grant REFERENCES on table public.training_plan_social_shares to service_role;
grant SELECT on table public.training_plan_social_shares to anon;
grant SELECT on table public.training_plan_social_shares to authenticated;
grant SELECT on table public.training_plan_social_shares to service_role;
grant TRIGGER on table public.training_plan_social_shares to anon;
grant TRIGGER on table public.training_plan_social_shares to authenticated;
grant TRIGGER on table public.training_plan_social_shares to service_role;
grant TRUNCATE on table public.training_plan_social_shares to anon;
grant TRUNCATE on table public.training_plan_social_shares to authenticated;
grant TRUNCATE on table public.training_plan_social_shares to service_role;
grant UPDATE on table public.training_plan_social_shares to anon;
grant UPDATE on table public.training_plan_social_shares to authenticated;
grant UPDATE on table public.training_plan_social_shares to service_role;
grant DELETE on table public.training_plan_versions to authenticated;
grant DELETE on table public.training_plan_versions to service_role;
grant INSERT on table public.training_plan_versions to authenticated;
grant INSERT on table public.training_plan_versions to service_role;
grant MAINTAIN on table public.training_plan_versions to authenticated;
grant MAINTAIN on table public.training_plan_versions to service_role;
grant REFERENCES on table public.training_plan_versions to authenticated;
grant REFERENCES on table public.training_plan_versions to service_role;
grant SELECT on table public.training_plan_versions to authenticated;
grant SELECT on table public.training_plan_versions to service_role;
grant TRIGGER on table public.training_plan_versions to authenticated;
grant TRIGGER on table public.training_plan_versions to service_role;
grant TRUNCATE on table public.training_plan_versions to authenticated;
grant TRUNCATE on table public.training_plan_versions to service_role;
grant UPDATE on table public.training_plan_versions to authenticated;
grant UPDATE on table public.training_plan_versions to service_role;
grant DELETE on table public.training_plans to authenticated;
grant DELETE on table public.training_plans to service_role;
grant INSERT on table public.training_plans to authenticated;
grant INSERT on table public.training_plans to service_role;
grant MAINTAIN on table public.training_plans to authenticated;
grant MAINTAIN on table public.training_plans to service_role;
grant REFERENCES on table public.training_plans to authenticated;
grant REFERENCES on table public.training_plans to service_role;
grant SELECT on table public.training_plans to authenticated;
grant SELECT on table public.training_plans to service_role;
grant TRIGGER on table public.training_plans to authenticated;
grant TRIGGER on table public.training_plans to service_role;
grant TRUNCATE on table public.training_plans to authenticated;
grant TRUNCATE on table public.training_plans to service_role;
grant UPDATE on table public.training_plans to authenticated;
grant UPDATE on table public.training_plans to service_role;
grant DELETE on table public.training_trick_progress to service_role;
grant INSERT on table public.training_trick_progress to service_role;
grant MAINTAIN on table public.training_trick_progress to authenticated;
grant MAINTAIN on table public.training_trick_progress to service_role;
grant REFERENCES on table public.training_trick_progress to authenticated;
grant REFERENCES on table public.training_trick_progress to service_role;
grant SELECT on table public.training_trick_progress to authenticated;
grant SELECT on table public.training_trick_progress to service_role;
grant TRIGGER on table public.training_trick_progress to authenticated;
grant TRIGGER on table public.training_trick_progress to service_role;
grant TRUNCATE on table public.training_trick_progress to authenticated;
grant TRUNCATE on table public.training_trick_progress to service_role;
grant UPDATE on table public.training_trick_progress to service_role;
grant DELETE on table public.training_video_evidence to service_role;
grant INSERT on table public.training_video_evidence to authenticated;
grant INSERT on table public.training_video_evidence to service_role;
grant MAINTAIN on table public.training_video_evidence to service_role;
grant REFERENCES on table public.training_video_evidence to service_role;
grant SELECT on table public.training_video_evidence to authenticated;
grant SELECT on table public.training_video_evidence to service_role;
grant TRIGGER on table public.training_video_evidence to service_role;
grant TRUNCATE on table public.training_video_evidence to service_role;
grant UPDATE on table public.training_video_evidence to service_role;
grant SELECT (id) on table public.organizations to anon;
grant SELECT (level) on table public.organizations to anon;
grant SELECT (name) on table public.organizations to anon;
grant SELECT (parent_id) on table public.organizations to anon;
grant SELECT (region_name) on table public.organizations to anon;
grant SELECT (state_code) on table public.organizations to anon;
grant SELECT (account_type) on table public.profiles to authenticated;
grant SELECT (avatar_path) on table public.profiles to authenticated;
grant SELECT (bio) on table public.profiles to authenticated;
grant SELECT (created_at) on table public.profiles to authenticated;
grant SELECT (disciplines) on table public.profiles to authenticated;
grant SELECT (display_name) on table public.profiles to authenticated;
grant SELECT (first_name) on table public.profiles to authenticated;
grant SELECT (id) on table public.profiles to authenticated;
grant SELECT (last_name) on table public.profiles to authenticated;
grant SELECT (updated_at) on table public.profiles to authenticated;
grant SELECT (visibility) on table public.profiles to authenticated;
grant UPDATE (review_status) on table public.training_video_evidence to authenticated;
grant UPDATE (reviewed_at) on table public.training_video_evidence to authenticated;
grant UPDATE (reviewed_by) on table public.training_video_evidence to authenticated;
grant UPDATE (trainer_feedback) on table public.training_video_evidence to authenticated;
revoke all on function private.account_is_active(target_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.add_event_creator_as_participant() from public,anon,authenticated,service_role;
revoke all on function private.add_group_owner() from public,anon,authenticated,service_role;
revoke all on function private.apply_approved_membership_request() from public,anon,authenticated,service_role;
revoke all on function private.apply_relationship_response() from public,anon,authenticated,service_role;
revoke all on function private.are_connected(first_user_id uuid, second_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_assign_athlete(scope_organization_id uuid, trainer_id uuid, athlete_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_assign_membership(target_organization_id uuid, target_role member_role) from public,anon,authenticated,service_role;
revoke all on function private.can_create_event(target_organization_id uuid, target_event_type event_type) from public,anon,authenticated,service_role;
revoke all on function private.can_create_organization(parent_organization_id uuid, target_level organization_level) from public,anon,authenticated,service_role;
revoke all on function private.can_manage_group(target_group_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_manage_organization(target_organization_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_event_organization(target_organization_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_organization(target_organization_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_profile(target_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_profile_contact_data(target_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_shared_training_plan(target_plan_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.can_view_social_activity(actor_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_club_organization(state_organization_id uuid, club_name text, club_region_name text) from public,anon,authenticated,service_role;
revoke all on function public.create_state_organization_with_specialist(parent_organization_id uuid, organization_name text, organization_state_code text, specialist_email text) from public,anon,authenticated,service_role;
revoke all on function private.current_account_is_active() from public,anon,authenticated,service_role;
revoke all on function private.current_profile_email() from public,anon,authenticated,service_role;
revoke all on function public.finalize_due_account_deletion(p_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_current_profile_email() from public,anon,authenticated,service_role;
revoke all on function public.get_own_profile() from public,anon,authenticated,service_role;
revoke all on function public.get_people_directory() from public,anon,authenticated,service_role;
revoke all on function public.get_registration_organizations() from public,anon,authenticated,service_role;
revoke all on function public.get_training_xp_leaderboard() from public,anon,authenticated,service_role;
revoke all on function private.guard_membership_delete() from public,anon,authenticated,service_role;
revoke all on function public.handle_new_user() from public,anon,authenticated,service_role;
revoke all on function private.has_active_trainer_athlete_relationship(p_trainer_id uuid, p_athlete_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.initialize_training_trick_progress() from public,anon,authenticated,service_role;
revoke all on function private.invalidate_federation_after_membership_delete() from public,anon,authenticated,service_role;
revoke all on function private.is_group_member(target_group_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.is_organization_member(target_organization_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.is_trainer_profile(p_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function public.leave_club_membership(p_club_id uuid, p_confirmed boolean) from public,anon,authenticated,service_role;
revoke all on function private.notify_club_membership_joined() from public,anon,authenticated,service_role;
revoke all on function private.notify_membership_request() from public,anon,authenticated,service_role;
revoke all on function private.notify_new_event() from public,anon,authenticated,service_role;
revoke all on function private.notify_relationship_request() from public,anon,authenticated,service_role;
revoke all on function private.notify_training_plan_share() from public,anon,authenticated,service_role;
revoke all on function private.notify_training_plan_snapshot_share() from public,anon,authenticated,service_role;
revoke all on function private.organization_is_same_or_descendant(ancestor_organization_id uuid, candidate_organization_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.process_group_invitation() from public,anon,authenticated,service_role;
revoke all on function private.protect_profile_update() from public,anon,authenticated,service_role;
revoke all on function public.resolve_event_participant_profile(p_event_id uuid, p_email text) from public,anon,authenticated,service_role;
revoke all on function public.restore_account() from public,anon,authenticated,service_role;
revoke all on function private.role_allowed_for_level(target_level organization_level, target_role member_role) from public,anon,authenticated,service_role;
revoke all on function public.schedule_account_deletion(p_confirmation text) from public,anon,authenticated,service_role;
revoke all on function public.set_active_athlete_federation(p_federation_id uuid, p_confirmed boolean) from public,anon,authenticated,service_role;
revoke all on function private.shares_group_with(first_user_id uuid, second_user_id uuid) from public,anon,authenticated,service_role;
revoke all on function private.sync_training_video_evidence_progress() from public,anon,authenticated,service_role;
revoke all on function public.update_training_trick_progress(p_snapshot_share_id uuid, p_trick_id text, p_status trick_progress_status) from public,anon,authenticated,service_role;
revoke all on function private.validate_athlete_federation_affiliation() from public,anon,authenticated,service_role;
revoke all on function private.validate_membership_role() from public,anon,authenticated,service_role;
revoke all on function private.validate_organization_hierarchy() from public,anon,authenticated,service_role;
revoke all on function private.validate_relationship_request() from public,anon,authenticated,service_role;
revoke all on function private.validate_training_video_evidence_review() from public,anon,authenticated,service_role;
grant EXECUTE on function private.account_is_active(target_user_id uuid) to service_role;
grant EXECUTE on function private.are_connected(first_user_id uuid, second_user_id uuid) to authenticated;
grant EXECUTE on function private.can_assign_athlete(scope_organization_id uuid, trainer_id uuid, athlete_id uuid) to authenticated;
grant EXECUTE on function private.can_assign_membership(target_organization_id uuid, target_role member_role) to authenticated;
grant EXECUTE on function private.can_create_event(target_organization_id uuid, target_event_type event_type) to authenticated;
grant EXECUTE on function private.can_create_organization(parent_organization_id uuid, target_level organization_level) to authenticated;
grant EXECUTE on function private.can_manage_group(target_group_id uuid) to authenticated;
grant EXECUTE on function private.can_manage_organization(target_organization_id uuid) to authenticated;
grant EXECUTE on function private.can_view_event_organization(target_organization_id uuid) to authenticated;
grant EXECUTE on function private.can_view_organization(target_organization_id uuid) to authenticated;
grant EXECUTE on function private.can_view_profile(target_user_id uuid) to authenticated;
grant EXECUTE on function private.can_view_profile(target_user_id uuid) to service_role;
grant EXECUTE on function private.can_view_profile_contact_data(target_user_id uuid) to authenticated;
grant EXECUTE on function private.can_view_profile_contact_data(target_user_id uuid) to service_role;
grant EXECUTE on function private.can_view_shared_training_plan(target_plan_id uuid) to authenticated;
grant EXECUTE on function private.can_view_social_activity(actor_id uuid) to authenticated;
grant EXECUTE on function public.create_club_organization(state_organization_id uuid, club_name text, club_region_name text) to authenticated;
grant EXECUTE on function public.create_club_organization(state_organization_id uuid, club_name text, club_region_name text) to service_role;
grant EXECUTE on function public.create_state_organization_with_specialist(parent_organization_id uuid, organization_name text, organization_state_code text, specialist_email text) to authenticated;
grant EXECUTE on function public.create_state_organization_with_specialist(parent_organization_id uuid, organization_name text, organization_state_code text, specialist_email text) to service_role;
grant EXECUTE on function private.current_account_is_active() to authenticated;
grant EXECUTE on function private.current_account_is_active() to service_role;
grant EXECUTE on function private.current_profile_email() to authenticated;
grant EXECUTE on function private.current_profile_email() to service_role;
grant EXECUTE on function public.finalize_due_account_deletion(p_user_id uuid) to service_role;
grant EXECUTE on function public.get_current_profile_email() to authenticated;
grant EXECUTE on function public.get_current_profile_email() to service_role;
grant EXECUTE on function public.get_own_profile() to authenticated;
grant EXECUTE on function public.get_own_profile() to service_role;
grant EXECUTE on function public.get_people_directory() to authenticated;
grant EXECUTE on function public.get_people_directory() to service_role;
grant EXECUTE on function public.get_registration_organizations() to anon;
grant EXECUTE on function public.get_registration_organizations() to authenticated;
grant EXECUTE on function public.get_registration_organizations() to service_role;
grant EXECUTE on function public.get_training_xp_leaderboard() to authenticated;
grant EXECUTE on function public.get_training_xp_leaderboard() to service_role;
grant EXECUTE on function public.handle_new_user() to service_role;
grant EXECUTE on function private.has_active_trainer_athlete_relationship(p_trainer_id uuid, p_athlete_id uuid) to authenticated;
grant EXECUTE on function private.is_group_member(target_group_id uuid) to authenticated;
grant EXECUTE on function private.is_organization_member(target_organization_id uuid) to authenticated;
grant EXECUTE on function public.leave_club_membership(p_club_id uuid, p_confirmed boolean) to authenticated;
grant EXECUTE on function public.leave_club_membership(p_club_id uuid, p_confirmed boolean) to service_role;
grant EXECUTE on function private.organization_is_same_or_descendant(ancestor_organization_id uuid, candidate_organization_id uuid) to authenticated;
grant EXECUTE on function public.resolve_event_participant_profile(p_event_id uuid, p_email text) to authenticated;
grant EXECUTE on function public.resolve_event_participant_profile(p_event_id uuid, p_email text) to service_role;
grant EXECUTE on function public.restore_account() to authenticated;
grant EXECUTE on function public.restore_account() to service_role;
grant EXECUTE on function private.role_allowed_for_level(target_level organization_level, target_role member_role) to authenticated;
grant EXECUTE on function public.schedule_account_deletion(p_confirmation text) to authenticated;
grant EXECUTE on function public.schedule_account_deletion(p_confirmation text) to service_role;
grant EXECUTE on function public.set_active_athlete_federation(p_federation_id uuid, p_confirmed boolean) to authenticated;
grant EXECUTE on function public.set_active_athlete_federation(p_federation_id uuid, p_confirmed boolean) to service_role;
grant EXECUTE on function private.shares_group_with(first_user_id uuid, second_user_id uuid) to authenticated;
grant EXECUTE on function public.update_training_trick_progress(p_snapshot_share_id uuid, p_trick_id text, p_status trick_progress_status) to authenticated;
grant EXECUTE on function public.update_training_trick_progress(p_snapshot_share_id uuid, p_trick_id text, p_status trick_progress_status) to service_role;
grant USAGE on schema private to authenticated;
grant USAGE on schema public to anon;
grant USAGE on schema public to authenticated;
grant USAGE on schema public to public;
grant USAGE on schema public to service_role;
