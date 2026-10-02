# SABIL GR Hub Mobile PWA v0.6

## v0.6
- Fixed profile pictures on mobile by resolving private Supabase avatar paths to signed URLs.
- Profile pictures now render in the top account button, Home, Team, member profiles and Settings.
- Edit mode is now **Owner-only** on mobile. Other users, including Admins, do not see the Edit button.
- Team members can be edited from mobile while Owner Edit mode is active:
  - name / nickname
  - race number / country
  - primary and secondary role
  - LMU / iRacing driver tags
  - preferred sim / class
  - racing goal / bio
- Rules use the same `team_rules` table as Desktop and update live across both apps.
- Owner Edit mode can create, edit and remove rules on mobile.
- Mobile file upload and folder upload were removed completely.
- Files remain available for browsing and signed downloads.
- Owner can still delete files in Edit mode; uploads stay a Windows/Desktop workflow.
- Rules now refresh in realtime on mobile.
- Chat / DMs / voice / screen sharing remain removed and are handled through Discord.
- Existing events, calendar, attendance, results, announcements, polls, training, files and team features remain.

## Deployment
Replace the contents of `SABIL_Hub_Updates/mobile/` with this `mobile/` folder and commit to `main`.

If Vercel is connected with `mobile` as the Root Directory, it redeploys automatically.

After deploy, fully close and reopen the installed PWA so the `v06` service-worker cache is loaded.
