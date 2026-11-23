# SABIL GR Hub Mobile PWA v0.18

Mobile client for the shared Supabase team hub. Release procedure and known test scope: `RELEASE_v0.18_README.txt`. Run `SUPABASE_V018_SCHEMA.sql` once before installing new clients.

Improvements: password reset, signup-owner approval, LMU/iRacing driver permissions, Coach/Rookie tags, file explorer with mobile uploads/empty folders, synced month/week/day calendar, official line-up result entry, realtime sync and relevant push only.

- Deploy: copy **contents of `mobile/`** to the repo's `mobile/` directory (Vercel project Root Directory = `mobile`).
- Test on home-screen-installed iOS/Android PWA.
- File upload folders on browsers that support `webkitdirectory`; files can always be selected individually.
