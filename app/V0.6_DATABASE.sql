-- SABIL GR Hub v0.6 database changes
-- Already applied to the connected SABIL GR Hub Supabase project on 2026-09-14.

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  scope text not null default 'team' check (scope in ('team','entry')),
  event_id uuid references public.events(id) on delete set null,
  entry_id uuid references public.event_entries(id) on delete set null,
  simulation text not null,
  track text, session_date date not null, start_time time, duration_minutes integer,
  server_name text, session_password text, notes text, status text not null default 'scheduled',
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, entity_type text, entity_id uuid, details text, created_at timestamptz default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade,
  title text not null, message text, type text default 'info', entity_type text, entity_id uuid,
  is_read boolean default false, created_at timestamptz default now()
);


-- v0.6.4 event date range
alter table public.events add column if not exists event_end_date date;
