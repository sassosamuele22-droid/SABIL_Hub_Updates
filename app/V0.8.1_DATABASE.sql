-- SABIL GR Hub v0.8.1
-- Applied to Supabase project enzqritietjhrdezdkxj during build.
-- Adds optional secondary system role, fixes profile update grants,
-- keeps role changes owner-only, and removes the legacy manager role.

alter table public.profiles add column if not exists secondary_role text null;
grant update on table public.profiles to authenticated;

-- Effective role priority: owner > admin > driver across primary + secondary role.
-- The legacy set_user_role RPC is disabled; v0.8.1 uses set_user_roles.
-- Manager profiles are migrated back to driver.
