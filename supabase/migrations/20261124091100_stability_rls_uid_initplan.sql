-- Applied 2026-11-24. Wrap auth.uid() in initplans without changing access conditions.
-- Coach policies intentionally excluded.
alter policy "dm participants read" on public."direct_messages" using (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid))));
alter policy "dm sender delete" on public."direct_messages" using ((sender_id = ( SELECT auth.uid() AS uid)));
alter policy "dm sender insert" on public."direct_messages" with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (recipient_id <> ( SELECT auth.uid() AS uid))));
alter policy "assigned drivers manage entry schedule" on public."entry_schedule_items" using ((EXISTS ( SELECT 1
   FROM event_entry_drivers d
  WHERE ((d.entry_id = entry_schedule_items.entry_id) AND (d.driver_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM event_entry_drivers d
  WHERE ((d.entry_id = entry_schedule_items.entry_id) AND (d.driver_id = ( SELECT auth.uid() AS uid))))));
alter policy "sim driver sets own attendance" on public."event_attendance" with check (((driver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_attendance.event_id) AND (e.status = 'open'::text) AND member_can_sim(e.simulation))))));
alter policy "sim driver updates own attendance" on public."event_attendance" using (((driver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_attendance.event_id) AND (e.status = 'open'::text) AND member_can_sim(e.simulation)))))) with check (((driver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_attendance.event_id) AND (e.status = 'open'::text) AND member_can_sim(e.simulation))))));
alter policy "sim drivers create lineups" on public."event_entries" with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_entries.event_id) AND (e.status = 'open'::text) AND member_can_sim(e.simulation))))));
alter policy "sim lineup manager deletes" on public."event_entries" using ((((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_entries.event_id) AND member_can_sim(e.simulation))))));
alter policy "sim lineup manager updates" on public."event_entries" using ((((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_entries.event_id) AND member_can_sim(e.simulation)))))) with check ((((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_entries.event_id) AND member_can_sim(e.simulation))))));
alter policy "sim lineup manager deletes drivers" on public."event_entry_drivers" using ((EXISTS ( SELECT 1
   FROM (event_entries en
     JOIN events e ON ((e.id = en.event_id)))
  WHERE ((en.id = event_entry_drivers.entry_id) AND ((en.created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) AND member_can_sim(e.simulation)))));
alter policy "sim lineup manager inserts drivers" on public."event_entry_drivers" with check ((EXISTS ( SELECT 1
   FROM (event_entries en
     JOIN events e ON ((e.id = en.event_id)))
  WHERE ((en.id = event_entry_drivers.entry_id) AND ((en.created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) AND member_can_sim(e.simulation)))));
alter policy "approved team creates folders" on public."file_folders" with check ((team_access_approved() AND (created_by = ( SELECT auth.uid() AS uid))));
alter policy "owner or creator deletes folders" on public."file_folders" using ((team_access_approved() AND ((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text])))));
alter policy "owner or creator manages folders" on public."file_folders" using ((team_access_approved() AND ((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))))) with check ((team_access_approved() AND ((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text])))));
alter policy "team can send messages" on public."messages" with check ((sender_id = ( SELECT auth.uid() AS uid)));
alter policy "users can delete own messages" on public."messages" using (((sender_id = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "admins create moderation" on public."moderation_actions" with check (((current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text])) OR ((actor_id = ( SELECT auth.uid() AS uid)) AND (target_user = ( SELECT auth.uid() AS uid)) AND (action = 'filter_block'::text))));
alter policy "poll creator inserts options" on public."poll_options" with check ((EXISTS ( SELECT 1
   FROM polls p
  WHERE ((p.id = poll_options.poll_id) AND (p.created_by = ( SELECT auth.uid() AS uid))))));
alter policy "users remove own vote" on public."poll_votes" using ((user_id = ( SELECT auth.uid() AS uid)));
alter policy "users vote" on public."poll_votes" with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy "poll creator or admins delete" on public."polls" using (((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "team creates polls" on public."polls" with check ((created_by = ( SELECT auth.uid() AS uid)));
alter policy "approved team or own profile view" on public."profiles" using (((id = ( SELECT auth.uid() AS uid)) OR team_access_approved()));
alter policy "user can update own profile" on public."profiles" using (((id = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "lineup boss publishes results" on public."results" with check (((created_by = ( SELECT auth.uid() AS uid)) AND team_access_approved() AND (EXISTS ( SELECT 1
   FROM (event_entries en
     JOIN events e ON ((e.id = en.event_id)))
  WHERE ((en.id = results.entry_id) AND (e.id = en.event_id) AND (e.status = 'finished'::text) AND ((en.created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))))))));
alter policy "team can upload file entries" on public."team_files" with check ((uploaded_by = ( SELECT auth.uid() AS uid)));
alter policy "uploader or admins manage files" on public."team_files" using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "users update own team files" on public."team_files" using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text])))) with check (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "training creator or admins delete" on public."training_sessions" using (((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
alter policy "training creator or admins update" on public."training_sessions" using (((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text])))) with check (((created_by = ( SELECT auth.uid() AS uid)) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
