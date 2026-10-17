# SABIL GR Hub Mobile PWA v0.8

This is the launch-candidate mobile build focused on the daily-use workflow.

## v0.8
- Training moved from More into its own bottom navigation tab.
- Event line-ups can be created directly inside every open Event.
- The Line-up create button is more visible.
- Line-up status now works directly in the Event view:
  - draft
  - ready
  - confirmed
- Status can be changed by the line-up creator or management.
- Status changes notify assigned drivers.
- More line-up information is visible:
  - race date
  - start time
  - car
  - car number
  - iRacing team name / ID when present
  - assigned drivers
- Stint & Session Planner is always visible under every line-up instead of being hidden in a collapsible section.
- Planner supports add / edit / delete for:
  - Stint
  - Practice
  - Qualifying
  - Race start
- Driver, date, start time, duration, calculated end time and notes are visible.
- Training has its own main-page realtime refresh.
- Existing notifications, events, results, rules, team editing, files browsing and Discord-only communication stay unchanged.
- Service worker cache bumped to v08.

## Deployment
Replace the full contents of `SABIL_Hub_Updates/mobile/` with this `mobile/` folder and commit to `main`.

After Vercel deploys, fully close and reopen the installed PWA.
