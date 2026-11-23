-- SABIL GR Hub v0.8.0
-- Applied to Supabase project enzqritietjhrdezdkxj during build.
-- Core changes: Owner/Admin/Driver permission model, owner-only rules/roles,
-- line-up manager scoped permissions, driver-created trainings, custom channels and polls.

alter table public.profiles add column if not exists role_tags text[] not null default '{}';

-- See applied Supabase migrations:
-- v080_roles_channels_polls_permissions
-- v080_lineup_manager_schedule
-- v080_seed_manageable_channels
-- v080_profile_security_guards
