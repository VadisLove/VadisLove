-- Aeltere Vorlagen enthalten lokale Demo-IDs (z. B. "p1") statt echter
-- Profil-UUIDs. Wenn keine Trick-Zuordnung zum Empfaenger existiert, wird die
-- persoenliche Planfreigabe deshalb als eigene Kopie fuer diesen Athleten
-- initialisiert. Bereits korrekt zugewiesene Mehrathleten-Plaene bleiben gleich.
create or replace function private.initialize_training_trick_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Repariert auch bereits zugestellte Plaene, bei denen wegen alter IDs noch
-- keine Fortschrittszeile fuer den Empfaenger angelegt werden konnte.
insert into public.training_trick_progress (
  snapshot_share_id,
  trick_id,
  athlete_id,
  status,
  confirmed_by,
  confirmed_at
)
select
  share.id,
  trick.value->>'id',
  share.recipient_user_id,
  case
    when not assignment.has_explicit then 'not_started'::public.trick_progress_status
    when trick.value->>'status' in (
      'not_started', 'in_progress', 'awaiting_confirmation', 'confirmed'
    ) then (trick.value->>'status')::public.trick_progress_status
    else 'not_started'::public.trick_progress_status
  end,
  case
    when assignment.has_explicit and trick.value->>'status' = 'confirmed'
      then share.shared_by
    else null
  end,
  case
    when assignment.has_explicit and trick.value->>'status' = 'confirmed'
      then share.created_at
    else null
  end
from public.training_plan_snapshot_shares share
cross join lateral (
  select exists (
    select 1
    from jsonb_array_elements(
      coalesce(share.plan_snapshot->'tricks', '[]'::jsonb)
    ) assigned_trick(value)
    where assigned_trick.value->>'athleteId' = share.recipient_user_id::text
  ) as has_explicit
) assignment
cross join lateral jsonb_array_elements(
  coalesce(share.plan_snapshot->'tricks', '[]'::jsonb)
) trick(value)
where share.target_type = 'person'
  and share.recipient_user_id is not null
  and trick.value->>'id' is not null
  and (
    not assignment.has_explicit
    or trick.value->>'athleteId' = share.recipient_user_id::text
  )
on conflict (snapshot_share_id, trick_id) do nothing;

revoke execute on function private.initialize_training_trick_progress()
  from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');
