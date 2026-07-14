-- Der BEFORE-Trigger für Mitgliedschaften läuft mit den Rechten des
-- angemeldeten Nutzers und ruft diese reine Enum-Prüfung intern auf. Ohne das
-- EXECUTE-Recht scheitert jede Beitrittsanfrage vor der eigentlichen RLS-Prüfung.
revoke execute on function private.role_allowed_for_level(
  public.organization_level,
  public.member_role
) from public, anon;
grant execute on function private.role_allowed_for_level(
  public.organization_level,
  public.member_role
) to authenticated;
