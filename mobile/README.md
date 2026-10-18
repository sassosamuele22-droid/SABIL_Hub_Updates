# SABIL GR Hub Mobile PWA v0.16

Mobile-first launch-candidate update.

## New
- Real white logo asset for login and dark header; no CSS-filter dependency.
- Language selector in Settings: English, Deutsch, Italiano.
- Language preference is saved locally and applied to the main navigation, login, Home, Events, Updates, More, Settings and key Event/Attendance/Line-up labels.
- Theme selector in Settings: Dark, Light, System.
- Theme is saved locally and the browser theme color/logo follow the selected appearance.
- Existing Push notifications, Events, Line-ups, Stint Planner, Attendance details, Rules, Training, account settings, Team, Results and Files remain.

## Deployment
Replace the complete `mobile/` folder in the update repository and deploy. Fully close and reopen the installed PWA after deployment so cache `v011` becomes active.


## v0.12
- Added a dedicated **Stint Planner** tool under More.
- It lists events, line-ups and planned stint/session items in one place.
- Each line-up shows its current plan and has an **Open full planner** action.
- The full editor remains directly inside the Event line-up, with add/edit/delete for stints, practice, qualifying and race start.
- Events without a line-up link directly to line-up creation.


## v0.13 hotfix
- Fixed transient null-session error.
- Fixed compact and working line-up status selector.
- Only drivers assigned to a line-up can edit its Stint Planner.
- Admin/Owner can still view other line-ups and plans, but cannot edit their stints unless assigned.


## v0.14
- Rebuilt the mobile Stint Planner editor layout.
- Fixed oversized/broken iOS date and time fields.
- Date and Start time now use a compact two-column layout.
- Duration and Driver use the same compact layout.
- Inputs have consistent mobile sizing and spacing.


## v0.15
- Added **Create new account** directly on the login screen.
- New auth users automatically receive a normal active Driver profile in the shared `profiles` table.
- Fixed the real push backend permission problem (`permission denied for table push_subscriptions`).
- Push delivery backend health-check now returns HTTP 200.
- Important notifications are generated server-side, so they work regardless of whether the item was created from Mobile or another Hub client.
- Push is now intentionally limited to meaningful team updates:
  - new Event
  - new Line-up
  - new Training
  - new Poll
  - new Announcement
- No push for line-up status changes, stint edits, or other small edits.
- Training push opens the Training page.


## v0.16 login hotfix
- Fixed successful sign-in getting stuck on the login screen.
- Login now enters the app directly from the returned Supabase session instead of relying only on the auth event callback.
- Auth startup calls are de-duplicated safely instead of being dropped during a race.
- New-account signup with an immediate session now enters the app directly too.
- Repaired a malformed leftover line in Event creation from the previous notification cleanup.
- Important-only push backend from v0.15 remains unchanged.
