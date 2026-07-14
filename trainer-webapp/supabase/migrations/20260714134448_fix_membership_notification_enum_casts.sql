-- Die INSERT-SELECT-Zweige des Benachrichtigungs-Triggers benötigen explizite
-- Enum-Casts. Andernfalls wird eine fachlich gültige Beitrittsanfrage beim
-- Erzeugen der zugehörigen Postfachmeldung vollständig zurückgerollt.
create or replace function private.notify_membership_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function private.notify_membership_request()
  from public, anon, authenticated;
