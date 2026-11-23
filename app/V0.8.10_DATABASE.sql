-- SABIL GR Hub v0.8.10
-- REFERENCE ONLY: this migration has already been applied to the shared Supabase project.
-- It adds query indexes and enables Supabase Realtime publication for the Hub tables.
-- Do not run it again on the production project.

create index if not exists activity_log_created_at_idx on public.activity_log(created_at desc);
create index if not exists activity_log_actor_id_idx on public.activity_log(actor_id);
create index if not exists announcements_created_at_idx on public.announcements(created_at desc);
create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists custom_channels_active_type_order_idx on public.custom_channels(active, channel_type, sort_order);
create index if not exists custom_channels_created_by_idx on public.custom_channels(created_by);
create index if not exists entry_schedule_items_driver_id_idx on public.entry_schedule_items(driver_id);
create index if not exists entry_schedule_items_created_by_idx on public.entry_schedule_items(created_by);
create index if not exists event_attendance_driver_id_idx on public.event_attendance(driver_id);
create index if not exists event_entries_event_id_idx on public.event_entries(event_id);
create index if not exists event_entries_created_by_idx on public.event_entries(created_by);
create index if not exists event_entry_drivers_entry_driver_idx on public.event_entry_drivers(entry_id, driver_id);
create index if not exists event_entry_drivers_driver_id_idx on public.event_entry_drivers(driver_id);
create index if not exists events_event_date_idx on public.events(event_date);
create index if not exists events_created_by_idx on public.events(created_by);
create index if not exists messages_channel_created_at_idx on public.messages(channel, created_at desc);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists notifications_user_created_at_idx on public.notifications(user_id, created_at desc);
create index if not exists poll_options_poll_sort_idx on public.poll_options(poll_id, sort_order);
create index if not exists poll_votes_option_id_idx on public.poll_votes(option_id);
create index if not exists poll_votes_user_id_idx on public.poll_votes(user_id);
create index if not exists polls_channel_created_at_idx on public.polls(channel, created_at desc);
create index if not exists polls_created_by_idx on public.polls(created_by);
create index if not exists results_event_entry_idx on public.results(event_id, entry_id);
create index if not exists results_entry_id_idx on public.results(entry_id);
create index if not exists results_created_by_idx on public.results(created_by);
create index if not exists team_files_created_at_idx on public.team_files(created_at desc);
create index if not exists team_files_uploaded_by_idx on public.team_files(uploaded_by);
create index if not exists team_rules_created_by_idx on public.team_rules(created_by);
create index if not exists training_sessions_date_time_idx on public.training_sessions(session_date, start_time);
create index if not exists training_sessions_event_id_idx on public.training_sessions(event_id);
create index if not exists training_sessions_entry_id_idx on public.training_sessions(entry_id);
create index if not exists training_sessions_created_by_idx on public.training_sessions(created_by);

-- Realtime publication was enabled for all Hub team tables in production.
