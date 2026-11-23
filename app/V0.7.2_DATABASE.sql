-- SABIL GR Hub v0.7.2 database changes
alter table public.event_entries add column if not exists race_date date;
alter table public.event_entries add column if not exists race_time time;
alter table public.results add column if not exists split_number integer;
alter table public.results add column if not exists split_total integer;
alter table public.team_rules add column if not exists category text not null default 'General';
alter table public.moderation_actions add column if not exists revoked_at timestamptz;
alter table public.moderation_actions add column if not exists revoked_by uuid references public.profiles(id);
alter table public.moderation_actions add column if not exists revoked_reason text;
