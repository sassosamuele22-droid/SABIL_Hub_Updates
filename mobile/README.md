# SABIL GR Hub Mobile PWA v0.5

The mobile Hub is now the primary lightweight team interface and mirrors the current useful desktop features while keeping communication in Discord.

## v0.5
- Current desktop-style event cards
- European dates: DD.MM.YYYY
- Events are always sorted chronologically, including filtered views
- Event Calendar list view with direct event opening
- Track / simulation / classes / series layout synced with Desktop
- Attendance statuses synced with Desktop (`in`, `unsure`, `out`)
- Event detail and line-up/stint information improved
- Event creation supports end date and classes
- Latest Announcement added to Home
- Highlighted announcements use white card + blue dot
- Owner/Admin edit mode can mark/unmark announcements
- Results keep simulation filters and now link to the Event Calendar
- Result cards show mapped event names where available
- Training dates use the same European format
- Team Files now load the complete library (no 50-item cap)
- File category filters
- Signed downloads from the private `sabil-files` bucket
- Multi-file upload
- Folder upload with relative paths preserved
- Robust delete flow for management
- Owner and Admin both get edit mode
- More realtime refreshes for events, announcements, results, files, training and team members
- Settings show Mobile PWA v0.5
- Chat / DMs / voice / screen sharing remain removed and are handled in Discord
- Service worker cache bumped to v0.5

## Deployment
Replace the full contents of `SABIL_Hub_Updates/mobile/` with this `mobile/` folder and commit to `main`.

If Vercel is connected with `mobile` as the Root Directory, the deployment updates automatically.
