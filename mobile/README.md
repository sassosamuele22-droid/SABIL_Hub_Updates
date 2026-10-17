# SABIL GR Hub Mobile PWA v0.13

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
