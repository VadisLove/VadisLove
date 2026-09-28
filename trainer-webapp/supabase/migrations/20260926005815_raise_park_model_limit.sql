-- Obergrenze für 3D-Modelle und Höhenraster auf 50 MB anheben (vom Nutzer am
-- 26.09.2026 beauftragt). 50 MB ist das Maximum im Supabase-Free-Plan; nach einem
-- Wechsel auf Pro kann der Wert (z. B. 80 MB = 83886080) erneut angehoben werden.
update storage.buckets set file_size_limit = 52428800 where id = 'skatepark-models';
