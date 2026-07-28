-- Neue Benachrichtigungstypen stehen bewusst in einer eigenen Migration, weil
-- PostgreSQL Enum-Werte erst nach dem Commit sicher in Funktionen verwenden kann.
alter type public.notification_type add value if not exists 'club_joined';
alter type public.notification_type add value if not exists 'club_left';
alter type public.notification_type add value if not exists 'federation_changed';
alter type public.notification_type add value if not exists 'federation_invalidated';
alter type public.notification_type add value if not exists 'account_deletion_scheduled';
alter type public.notification_type add value if not exists 'account_restored';
alter type public.notification_type add value if not exists 'account_finalized';
