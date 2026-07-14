-- Postgres loest Stringliterale in INSERT ... SELECT innerhalb dieser Trigger
-- als text auf. Der explizite Enum-Cast verhindert, dass die gesamte
-- Trainingsplan-Freigabe beim Erzeugen der Benachrichtigung zurueckgerollt wird.
create or replace function private.notify_training_plan_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.notify_training_plan_snapshot_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Triggerfunktionen sind interne Implementierungsdetails und keine API-Endpunkte.
revoke execute on function private.notify_training_plan_share()
  from public, anon, authenticated;
revoke execute on function private.notify_training_plan_snapshot_share()
  from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');
