-- INSERT ... SELECT leitet untypisierte Stringliterale hier als text ab. Der
-- explizite Cast verhindert, dass der Benachrichtigungs-Trigger die komplette
-- Terminerstellung wegen eines Typfehlers zurückrollt.
create or replace function private.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Trigger-Funktionen bleiben ausschließlich über ihren Tabellentrigger
-- erreichbar und werden nicht als aufrufbare API-Funktionen freigegeben.
revoke execute on function private.notify_new_event()
  from public, anon, authenticated;
