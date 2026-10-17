# SABIL GR Hub Mobile PWA v0.7

Mobile is now the primary day-to-day team interface. This release aligns the Event workflow with the Desktop Hub.

## v0.7

### Notifications
- Mobile-created Events now generate an in-app notification for all active team members.
- New Announcements generate a team notification.
- New Polls generate a team notification.
- Creating or updating a Line-up notifies every assigned driver.
- Stint-plan changes notify the drivers assigned to that Line-up.
- Notifications on Home are now tappable:
  - Event notifications open the Event directly.
  - Line-up notifications open the related Event.
- Tapping a notification marks it as read.
- Notification updates remain realtime.
- These are Hub in-app notifications; closed-app OS push is a separate future layer.

### Events / Line-ups
- `+ Line-up` is available inside every open Event.
- Same team numbers as Desktop: 187 / 095 / 113.
- Vehicle list comes from the shared `team_cars` table and is filtered by Simulation.
- Race date and time are required.
- Line-up date must be within the Event date range.
- Drivers can create a Line-up when they include themselves.
- Owner/Admin can create a Line-up for any drivers.
- Line-up creator or management can edit/delete the Line-up.
- Driver assignments use the same `event_entry_drivers` table as Desktop.

### Stint & Session Planner
- Every Line-up now has the Stint & Session Planner.
- Supports:
  - Stint
  - Practice
  - Qualifying
  - Race start
- Date, time, duration, driver and notes.
- End time is calculated from duration.
- Line-up creator / management can add, edit and delete planner items.
- Uses the same `entry_schedule_items` table as Desktop.

### Event management
- Owner Edit mode can edit Events from Mobile.
- Mark Event finished / reopen.
- Delete Event.
- Event creation and finished status send the same style of notifications as Desktop.

### Existing v0.6 features kept
- signed profile pictures
- Owner-only Edit mode
- team-member editing
- shared Rules editing
- Events Calendar
- attendance
- results viewer and simulation filters
- announcements and polls
- training
- Files browse/download only
- no Chat / DMs / Voice / screen sharing

## Deployment
Replace the full contents of `SABIL_Hub_Updates/mobile/` with this `mobile/` folder and commit to `main`.

The connected Supabase project already includes the two v0.7 notification helper RPCs:
- `mobile_notify_all_team`
- `mobile_notify_entry_team`

After Vercel redeploys, fully close and reopen the installed PWA so service-worker cache `v07` is loaded.
