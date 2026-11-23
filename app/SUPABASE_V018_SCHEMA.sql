-- SABIL GR Hub synchronized release schema.
-- Existing team profiles are grandfathered as approved; future signups remain pending.
-- Apply only once after a backup; all client releases should be deployed together.
begin;

alter table public.profiles add column if not exists approval_status text;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by uuid;
update public.profiles set approval_status='approved',approved_at=coalesce(approved_at,now()) where approval_status is null;
alter table public.profiles alter column approval_status set default 'pending';
alter table public.profiles alter column approval_status set not null;
alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check check(approval_status in ('pending','approved','rejected'));

create or replace function public.team_access_approved()
returns boolean language sql stable security definer set search_path=public
as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true and p.approval_status='approved' and (p.suspended_until is null or p.suspended_until<now()))$$;
revoke all on function public.team_access_approved() from public,anon;
grant execute on function public.team_access_approved() to authenticated;

create or replace function public.member_can_sim(p_sim text)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.team_access_approved() and exists(
 select 1 from public.profiles p where p.id=auth.uid() and (
 p.role in ('owner','admin') or p.secondary_role in ('owner','admin')
 or (lower(coalesce(p_sim,'')) like '%iracing%' and 'iracing_driver'=any(p.role_tags))
 or ((lower(coalesce(p_sim,'')) like '%le mans%' or lower(coalesce(p_sim,''))='lmu') and 'lmu_driver'=any(p.role_tags))
 ))$$;
revoke all on function public.member_can_sim(text) from public,anon;
grant execute on function public.member_can_sim(text) to authenticated;

create or replace function public.coach_can_manage(p_sim text)
returns boolean language sql stable security definer set search_path=public
as $$ select public.team_access_approved() and lower(coalesce(p_sim,'')) like '%iracing%'
 and exists(select 1 from public.profiles where id=auth.uid() and 'coach'=any(role_tags)) $$;
revoke all on function public.coach_can_manage(text) from public,anon;
grant execute on function public.coach_can_manage(text) to authenticated;

create or replace function public.guard_profile_security_fields()
returns trigger language plpgsql security definer set search_path=public
as $$
declare actor_role text;
begin
 actor_role := public.current_user_role();
 if new.role is distinct from old.role or new.secondary_role is distinct from old.secondary_role
    or new.role_tags is distinct from old.role_tags or new.approval_status is distinct from old.approval_status
    or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by then
   if actor_role is distinct from 'owner' or not public.team_access_approved() then
     raise exception 'Only an approved owner can change roles and membership approval';
   end if;
 end if;
 if new.active is distinct from old.active or new.suspended_until is distinct from old.suspended_until then
   if actor_role not in ('owner','admin') or not public.team_access_approved() then
     raise exception 'Only Owner/Admin can change member access';
   end if;
   if actor_role='admin' and (old.role='owner' or old.secondary_role='owner') then
     raise exception 'Admins cannot moderate the owner';
   end if;
 end if;
 return new;
end; $$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,full_name,nickname,role,active,role_tags,approval_status)
 values(new.id,nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')),''),nullif(trim(coalesce(new.raw_user_meta_data->>'nickname','')),''),'driver',true,ARRAY['rookie']::text[],'pending')
 on conflict(id) do nothing;
 return new;
end; $$;

-- Public REST API must not expose private team data before sign-in.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Every team table requires owner approval, even if a historical permissive policy allowed SELECT true.
-- Exception: self profile is readable when pending so the client can show approval status.
drop policy if exists "team can view profiles" on public.profiles;
create policy "approved team or own profile view" on public.profiles for select to authenticated
using(id=auth.uid() or public.team_access_approved());

do $$
declare tbl text;
begin
 for tbl in select unnest(array[
  'events','event_entries','event_entry_drivers','entry_schedule_items','event_attendance','results',
  'training_sessions','team_files','team_cars','announcements','polls','poll_options','poll_votes',
  'team_rules','notifications','push_subscriptions','activity_log','client_sync_state',
  'messages','direct_messages','custom_channels','moderation_actions'
 ]) loop
   if to_regclass(format('public.%I',tbl)) is not null then
     execute format('alter table public.%I enable row level security',tbl);
     execute format('drop policy if exists "team approval gate" on public.%I',tbl);
     execute format('create policy "team approval gate" on public.%I as restrictive for all to authenticated using (public.team_access_approved()) with check (public.team_access_approved())',tbl);
   end if;
 end loop;
end $$;

-- Preserve existing signed storage owner/uploader policies, but deny access to team bucket before approval.
drop policy if exists "team can upload sabil files" on storage.objects;
drop policy if exists "team can view sabil files" on storage.objects;
create policy "approved team uploads sabil files" on storage.objects for insert to authenticated
with check(bucket_id='sabil-files' and public.team_access_approved());
create policy "approved team views sabil files" on storage.objects for select to authenticated
using(bucket_id='sabil-files' and public.team_access_approved());
drop policy if exists "sabil storage requires approval" on storage.objects;
create policy "sabil storage requires approval" on storage.objects as restrictive for all to authenticated
using(bucket_id<>'sabil-files' or public.team_access_approved())
with check(bucket_id<>'sabil-files' or public.team_access_approved());

-- Event write actions: owner/admin unrestricted, coach iRacing only.
create policy "coach manages iracing events" on public.events for all to authenticated
using(public.coach_can_manage(simulation)) with check(public.coach_can_manage(simulation));
create policy "coach manages announcements" on public.announcements for all to authenticated
using(public.team_access_approved() and exists(select 1 from public.profiles where id=auth.uid() and 'coach'=any(role_tags)))
with check(public.team_access_approved() and exists(select 1 from public.profiles where id=auth.uid() and 'coach'=any(role_tags)));

-- Driver-created trainings are limited to their assigned simulation(s).
drop policy if exists "team creates trainings" on public.training_sessions;
create policy "sim drivers or coach creates trainings" on public.training_sessions for insert to authenticated
with check(created_by=auth.uid() and (public.member_can_sim(simulation) or public.coach_can_manage(simulation)));

-- Coach may manage iRacing training content as a trainer; non-coach existing owners unchanged.
drop policy if exists "coach manages iracing training" on public.training_sessions;
create policy "coach manages iracing training" on public.training_sessions for all to authenticated
using(public.coach_can_manage(simulation)) with check(public.coach_can_manage(simulation));

drop policy if exists "training simulation delete gate" on public.training_sessions;
create policy "training simulation delete gate" on public.training_sessions as restrictive for delete to authenticated
using(public.member_can_sim(simulation) or public.coach_can_manage(simulation));

drop policy if exists "training simulation write gate" on public.training_sessions;
create policy "training simulation write gate" on public.training_sessions as restrictive for update to authenticated
using(public.member_can_sim(simulation) or public.coach_can_manage(simulation))
with check(public.member_can_sim(simulation) or public.coach_can_manage(simulation));

-- Enforce sim-specific attendance in database (UI restriction alone is bypassable).
drop policy if exists "drivers can set own attendance" on public.event_attendance;
drop policy if exists "drivers can update own attendance" on public.event_attendance;
create policy "sim driver sets own attendance" on public.event_attendance for insert to authenticated
with check(driver_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.status='open' and public.member_can_sim(e.simulation)));
create policy "sim driver updates own attendance" on public.event_attendance for update to authenticated
using(driver_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.status='open' and public.member_can_sim(e.simulation)))
with check(driver_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.status='open' and public.member_can_sim(e.simulation)));

-- Line-up creation/edit only by relevant driver or manager while the race is open.
drop policy if exists "drivers create lineups" on public.event_entries;
create policy "sim drivers create lineups" on public.event_entries for insert to authenticated
with check(created_by=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.status='open' and public.member_can_sim(e.simulation)));
drop policy if exists "lineup manager or admins update" on public.event_entries;
create policy "sim lineup manager updates" on public.event_entries for update to authenticated
using((created_by=auth.uid() or public.current_user_role() in ('owner','admin'))
  and exists(select 1 from public.events e where e.id=event_id and public.member_can_sim(e.simulation)))
with check((created_by=auth.uid() or public.current_user_role() in ('owner','admin'))
  and exists(select 1 from public.events e where e.id=event_id and public.member_can_sim(e.simulation)));

-- Only existing line-up creator or owner/admin can delete.
drop policy if exists "lineup manager or admins delete" on public.event_entries;
create policy "sim lineup manager deletes" on public.event_entries for delete to authenticated
using((created_by=auth.uid() or public.current_user_role() in ('owner','admin'))
  and exists(select 1 from public.events e where e.id=event_id and public.member_can_sim(e.simulation)));

-- Prevent changing line-up assignments from a client not entitled to that sim.
drop policy if exists "lineup manager or admins insert drivers" on public.event_entry_drivers;
drop policy if exists "lineup manager or admins delete drivers" on public.event_entry_drivers;
create policy "sim lineup manager inserts drivers" on public.event_entry_drivers for insert to authenticated
with check(exists(select 1 from public.event_entries en join public.events e on e.id=en.event_id
 where en.id=entry_id and (en.created_by=auth.uid() or public.current_user_role() in ('owner','admin')) and public.member_can_sim(e.simulation)));
create policy "sim lineup manager deletes drivers" on public.event_entry_drivers for delete to authenticated
using(exists(select 1 from public.event_entries en join public.events e on e.id=en.event_id
 where en.id=entry_id and (en.created_by=auth.uid() or public.current_user_role() in ('owner','admin')) and public.member_can_sim(e.simulation)));

-- Folder tree is persisted independently from uploaded objects, so empty folders exist.
create table if not exists public.file_folders(
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('setups','clips','photos','other')),
 path text not null check(length(path)>0 and length(path)<=320 and path not like '/%' and path not like '%/' and path not like '%//%' and position('..' in path)=0),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(category,path)
);
alter table public.file_folders enable row level security;
grant select,insert,update,delete on public.file_folders to authenticated;
create policy "approved team reads folders" on public.file_folders for select to authenticated using(public.team_access_approved());
create policy "approved team creates folders" on public.file_folders for insert to authenticated with check(public.team_access_approved() and created_by=auth.uid());
create policy "owner or creator manages folders" on public.file_folders for update to authenticated
using(public.team_access_approved() and (created_by=auth.uid() or public.current_user_role() in ('owner','admin')))
with check(public.team_access_approved() and (created_by=auth.uid() or public.current_user_role() in ('owner','admin')));
create policy "owner or creator deletes folders" on public.file_folders for delete to authenticated
using(public.team_access_approved() and (created_by=auth.uid() or public.current_user_role() in ('owner','admin')));

alter table public.team_files add column if not exists folder_path text not null default '';
insert into public.file_folders(category,path,created_by)
values ('setups','iRacing',null),('setups','LMU',null)
on conflict(category,path) do nothing;

-- Only approved active members receive new important notifications.
create or replace function public.enqueue_important_team_notification(
 p_title text,p_message text,p_type text,p_entity_type text,p_entity_id uuid)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_count integer;
begin
 insert into public.notifications(user_id,title,message,type,entity_type,entity_id,is_read,push_enabled)
 select p.id,left(coalesce(p_title,'SABIL GR Hub'),160),nullif(left(coalesce(p_message,''),500),''),
        left(coalesce(p_type,'info'),40),nullif(left(coalesce(p_entity_type,''),60),''),p_entity_id,false,true
 from public.profiles p
 where p.active=true and p.approval_status='approved' and (p.suspended_until is null or p.suspended_until<now())
   and not exists(select 1 from public.notifications n where n.user_id=p.id
      and n.push_enabled=true and n.entity_type is not distinct from p_entity_type
      and n.entity_id is not distinct from p_entity_id
      and n.created_at>now()-interval '30 seconds');
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.enqueue_important_team_notification(text,text,text,text,uuid) from public,anon,authenticated;

-- Only server-generated important inserts enter the notification stream.
create or replace function public.prevent_minor_notifications()
returns trigger language plpgsql set search_path=public
as $$begin if new.push_enabled is distinct from true then return null; end if; return new; end; $$;
drop trigger if exists notifications_only_important on public.notifications;
create trigger notifications_only_important before insert on public.notifications
for each row execute function public.prevent_minor_notifications();
-- Existing in-app notifications removed as explicitly requested.
delete from public.notifications;
-- Deny future client-created notifications: only server-triggered records can be inserted.
drop policy if exists "management inserts notifications" on public.notifications;

-- Owner/driver/coach result input after a race ends.
drop policy if exists "lineup boss publishes results" on public.results;
create policy "lineup boss publishes results" on public.results for insert to authenticated
with check(created_by=auth.uid() and public.team_access_approved() and exists(
 select 1 from public.event_entries en join public.events e on e.id=en.event_id
 where en.id=entry_id and e.id=event_id and e.status='finished'
 and (en.created_by=auth.uid() or public.current_user_role() in ('owner','admin'))
));

-- Event end time fallback, per-line-up race duration for accurate closure.
alter table public.events add column if not exists end_time time;
alter table public.event_entries add column if not exists race_duration_minutes integer;


-- Server-managed result notifications; no duplicate from the client.
create or replace function public.notify_new_result()
returns trigger language plpgsql security definer set search_path=public
as $$
declare evname text;
begin
 if new.official is distinct from true then return new; end if;
 select name into evname from public.events where id=new.event_id;
 perform public.enqueue_important_team_notification(
 'New race result',coalesce(evname,'Race')||' · P'||coalesce(new.finish_position::text,'—'),
 'result','result',new.id);
 return new;
end; $$;
drop trigger if exists important_new_result_push on public.results;
create trigger important_new_result_push after insert on public.results
for each row execute function public.notify_new_result();

-- Keep shared revision aware of empty-folder changes.
drop trigger if exists client_sync_bump on public.file_folders;
create trigger client_sync_bump after insert or update or delete on public.file_folders
for each statement execute function public.bump_client_sync_state();

-- Eliminate broad old RPCs to avoid notification spam from older clients.
create or replace function public.mobile_notify_all_team(
 p_title text,p_message text default null,p_type text default 'info',
 p_entity_type text default null,p_entity_id uuid default null)
returns integer language sql security invoker set search_path=public as $$ select 0 $$;
create or replace function public.mobile_notify_entry_team(
 p_entry_id uuid,p_title text,p_message text default null,p_type text default 'lineup')
returns integer language sql security invoker set search_path=public as $$ select 0 $$;

-- Automatically archive/close completed races and delete expired trainings.
-- A race with no duration falls back to the end of its event day.
create or replace function public.cleanup_finished_team_schedule()
returns void language plpgsql security definer set search_path=public
as $$
begin
 delete from public.training_sessions t
 where (coalesce(t.session_date+t.start_time, t.session_date::timestamp+interval '23 hours 59 minutes')
      + make_interval(mins=>greatest(coalesce(t.duration_minutes,0),0)))
      < (now() at time zone 'Europe/Zurich');
 update public.events e set status='finished'
 where e.status='open' and exists(select 1 from public.event_entries en where en.event_id=e.id)
 and (select max(
   case when en.race_date is not null and en.race_time is not null and coalesce(en.race_duration_minutes,0)>0
    then (en.race_date+en.race_time + make_interval(mins=>en.race_duration_minutes))
    else (coalesce(en.race_date,e.event_end_date,e.event_date)::timestamp + interval '1 day') end
 ) from public.event_entries en where en.event_id=e.id) < (now() at time zone 'Europe/Zurich');
 update public.events e set status='finished'
 where e.status='open' and not exists(select 1 from public.event_entries en where en.event_id=e.id)
 and (coalesce(e.event_end_date,e.event_date) + coalesce(e.end_time, time '23:59')) < (now() at time zone 'Europe/Zurich');
end; $$;
revoke all on function public.cleanup_finished_team_schedule() from public,anon,authenticated;

-- pg_cron runs maintenance even when both client applications are closed.
create extension if not exists pg_cron;
select cron.schedule('sabil-gr-cleanup','*/5 * * * *','select public.cleanup_finished_team_schedule()');
commit;
