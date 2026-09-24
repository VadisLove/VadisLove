-- Speichert die Grundstellung; bestehende Profile erhalten NULL (Keine Angabe).
alter table public.profiles
add column stance text
constraint profiles_stance_check
check (stance in ('regular', 'goofy'));

-- Der Rückgabewert erhält eine zusätzliche Spalte.
-- Dafür muss die bestehende Funktion neu angelegt werden.
drop function public.get_own_profile();

create function public.get_own_profile()
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  email text,
  phone text,
  location text,
  bio text,
  disciplines text[],
  visibility public.profile_visibility,
  avatar_path text,
  account_type public.account_type,
  stance text
)
language sql
stable
security definer
set search_path = ''
as $$
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
    profile.account_type,
    profile.stance
  from public.profiles profile
  -- Ausschließlich das eigene Profil eines aktiven Kontos laden.
  where profile.id = (select auth.uid())
    and private.current_account_is_active();
$$;

-- Nach dem Neuanlegen die bisherigen Aufrufrechte wiederherstellen.
revoke execute on function public.get_own_profile()
  from public, anon;

grant execute on function public.get_own_profile()
  to authenticated;