-- Der Fremdschluessel wird bei geloeschten Planfreigaben und bei der
-- Zuordnungspruefung verwendet. Ein eigener Index vermeidet dabei Tabellenscans.
create index training_exercise_demo_videos_origin_share_idx
  on public.training_exercise_demo_videos(origin_snapshot_share_id);
