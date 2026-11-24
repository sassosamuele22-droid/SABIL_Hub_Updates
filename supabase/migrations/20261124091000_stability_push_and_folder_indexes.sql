-- Applied to the shared production project on 2026-11-24.
-- Idempotent indexes and equivalent predicates; coach policies unchanged.
create index if not exists file_folders_created_by_idx on public.file_folders(created_by);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter policy "users view own notifications" on public.notifications using (user_id = (select auth.uid()));
alter policy "users update own notifications" on public.notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "users view own push subscriptions" on public.push_subscriptions using (user_id = (select auth.uid()));
alter policy "users create own push subscriptions" on public.push_subscriptions with check (user_id = (select auth.uid()));
alter policy "users update own push subscriptions" on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "users delete own push subscriptions" on public.push_subscriptions using (user_id = (select auth.uid()));
