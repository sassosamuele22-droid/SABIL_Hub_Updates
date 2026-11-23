-- SABIL GR Hub v0.7.6
-- Required grants for tables introduced in v0.7.5.
grant select, insert, update, delete on table public.entry_schedule_items to authenticated;
grant select, insert, update, delete on table public.direct_messages to authenticated;
