# SABIL GR Hub Windows v0.9.12

Desktop source (Electron + Express) for shared SABIL GR Hub. Release procedure: see `PUBLISH_UPDATE.bat`. Existing Supabase v0.18 migration is already applied; do not rerun it.

Improvements: owner account approval, multiple roles, iRacing coach permissions, shared file folders and uploads, true month/week/day events+training calendar, races with duration and official results after finish, realtime sync, and important-only notifications.

## Build Windows

Double-click `BUILD_INSTALLER.bat` in `app/` on a Windows PC with Node.js and npm. The resulting NSIS installer is placed under `app/dist/`. The ZIP is the **complete source**, not a prebuilt EXE.

## Publishing

After building, use `PUBLISH_UPDATE.bat` for GitHub releases if appropriate. Check your current repository and release settings before publishing.
