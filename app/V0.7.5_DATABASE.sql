-- SABIL GR Hub v0.7.5
-- Applied automatically to the connected Supabase project on 2026-09-17.

create table if not exists public.entry_schedule_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.event_entries(id) on delete cascade,
  item_type text not null check (item_type in ('practice','qualifying','race_start','stint','other')),
  title text,
  session_date date not null,
  start_time time without time zone not null,
  duration_minutes integer,
  driver_id uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 100,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  attachment_type text,
  attachment_url text,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
