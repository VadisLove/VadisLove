-- Nachrüstung für Konto-Einladungen und Rollenverwaltung.
--
-- Diese Datei ist für bestehende Supabase-Projekte gedacht, deren Datenbank
-- noch nicht das aktuelle schema.sql enthält. Im Supabase SQL Editor ausführen
-- und danach die App neu laden. Falls PostgREST die neuen RPCs nicht sofort
-- findet, im Supabase Dashboard unter API "Reload schema" auslösen oder kurz
-- warten.

create extension if not exists "pgcrypto";
create schema if not exists private;

do $$
begin
  create type public.invitation_status as enum (
    'pending',
    'accepted',
    'revoked',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  target_role public.member_role not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status public.invitation_status not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(btrim(email))),
  check (char_length(email) between 3 and 320),
  check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null))
);

create unique index if not exists account_invitations_one_pending_email_role_idx
  on public.account_invitations(email, target_role)
  where status = 'pending';
create index if not exists account_invitations_invited_by_idx
  on public.account_invitations(invited_by, created_at desc);
create index if not exists account_invitations_email_status_idx
  on public.account_invitations(email, status);
create index if not exists account_invitations_expires_at_idx
  on public.account_invitations(expires_at)
  where status = 'pending';

create or replace function private.can_invite_account_role(
  target_role public.member_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_role <> 'medical'
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        and (
          (
            membership.role in (
              'club_trainer',
              'state_trainer',
              'federal_trainer'
            )
            and target_role in ('athlete', 'guardian')
          )
          or (
            membership.role = 'specialist'
            and target_role in (
              'specialist',
              'state_trainer',
              'club_board',
              'club_trainer',
              'athlete',
              'guardian'
            )
          )
          or (
            membership.role = 'federal_chair'
            and target_role in (
              'federal_chair',
              'specialist',
              'federal_trainer',
              'state_trainer',
              'club_trainer',
              'club_board',
              'athlete',
              'guardian'
            )
          )
        )
    );
$$;

create or replace function public.get_account_invitation(
  invitation_token text
)
returns table (
  email text,
  target_role public.member_role,
  status public.invitation_status,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invitation.email,
    invitation.target_role,
    invitation.status,
    invitation.expires_at
  from public.account_invitations invitation
  where invitation.token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  limit 1;
$$;

create or replace function public.get_assignable_profiles()
returns table (
  id uuid,
  display_name text,
  email text,
  account_type public.account_type,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    profile.email,
    profile.account_type,
    profile.created_at
  from public.profiles profile
  where auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('federal_chair', 'specialist', 'club_board')
    )
  order by profile.created_at desc, profile.display_name;
$$;

create or replace function public.get_role_assignment_options()
returns table (
  organization_id uuid,
  role public.member_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    organization.id,
    role_option.role
  from public.organizations organization
  cross join unnest(enum_range(null::public.member_role)) as role_option(role)
  where auth.uid() is not null
    and private.can_assign_membership(organization.id, role_option.role);
$$;

revoke execute on function private.can_invite_account_role(public.member_role)
  from public, anon;
grant execute on function private.can_invite_account_role(public.member_role)
  to authenticated;

revoke execute on function public.get_account_invitation(text) from public;
revoke execute on function public.get_assignable_profiles() from public, anon;
revoke execute on function public.get_role_assignment_options() from public, anon;
grant execute on function public.get_account_invitation(text) to anon, authenticated;
grant execute on function public.get_assignable_profiles() to authenticated;
grant execute on function public.get_role_assignment_options() to authenticated;

alter table public.account_invitations enable row level security;

drop policy if exists "account_invitations_read_related"
  on public.account_invitations;
create policy "account_invitations_read_related"
  on public.account_invitations for select
  to authenticated
  using (
    invited_by = auth.uid()
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.email = account_invitations.email
    )
  );

drop policy if exists "account_invitations_create_authorized"
  on public.account_invitations;
create policy "account_invitations_create_authorized"
  on public.account_invitations for insert
  to authenticated
  with check (
    invited_by = auth.uid()
    and status = 'pending'
    and accepted_by is null
    and accepted_at is null
    and expires_at > now()
    and private.can_invite_account_role(target_role)
  );

drop policy if exists "account_invitations_update_sender"
  on public.account_invitations;
create policy "account_invitations_update_sender"
  on public.account_invitations for update
  to authenticated
  using (
    invited_by = auth.uid()
    and status = 'pending'
  )
  with check (
    invited_by = auth.uid()
    and status in ('pending', 'revoked', 'expired')
    and accepted_by is null
    and accepted_at is null
  );

grant select, insert, update on public.account_invitations to authenticated;
