-- RLS-Policies werden mit den Rechten der anfragenden Rolle ausgewertet.
-- Diese beiden Helfer werden direkt in Policies aufgerufen und brauchen daher
-- ein gezieltes EXECUTE-Recht fuer angemeldete Nutzer. Das private Schema
-- verhindert weiterhin, dass sie als Data-API-RPCs exponiert werden.
revoke execute on function private.current_account_is_active()
  from public, anon;
revoke execute on function private.can_view_profile(uuid)
  from public, anon;

grant execute on function private.current_account_is_active()
  to authenticated;
grant execute on function private.can_view_profile(uuid)
  to authenticated;

select pg_notify('pgrst', 'reload schema');
