# Account cleanup

Diese Edge Function anonymisiert abgelaufene Konten und entfernt danach
Profilfoto sowie Supabase-Auth-Nutzer. Sie ist bewusst nicht aus dem Browser
aufrufbar.

Erforderliche Produktionskonfiguration:

1. Ein zufälliges `ACCOUNT_CLEANUP_SECRET` als Supabase Edge Function Secret setzen.
2. Die Function ohne JWT-Prüfung deployen; sie prüft stattdessen den
   `x-account-cleanup-secret` Header konstantzeitnah.
3. Einen täglichen Supabase-Cron-Aufruf einrichten. URL und Secret müssen aus
   Supabase Vault gelesen werden und dürfen nicht im SQL-Quelltext stehen.

Die Function verarbeitet höchstens 100 neue und 100 zu wiederholende
Bereinigungen pro Lauf. Fehlgeschlagene externe Bereinigungen bleiben über
`external_cleanup_completed_at is null` wiederholbar.
