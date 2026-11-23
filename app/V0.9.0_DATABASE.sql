-- SABIL GR Hub v0.9.0
-- Event class metadata used by the Events filter/detail UI.
-- Safe, non-destructive migration.

alter table public.events
add column if not exists classes text[] not null default array[]::text[];
