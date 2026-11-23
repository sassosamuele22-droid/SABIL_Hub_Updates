# SABIL GR Hub

This repository contains both clients for the same Supabase project.

- `mobile/`: Mobile PWA v0.18 (Vercel Root Directory: `mobile`)
- `app/`: Windows Electron desktop application v0.9.11

The database schema was updated separately in Supabase. Migration source files are provided for reference only; **do not run them again** on an already migrated project.

## Desktop installer

GitHub Actions builds a Windows NSIS installer when `app/` is updated. Open the repository **Actions** tab, select the newest successful **Build Windows Hub Installer** run, then download the installer artifact. The desktop app's existing GitHub auto-updater requires a separate published Release with installer, blockmap and `latest.yml`.

For local Windows builds, run `app/BUILD_INSTALLER.bat`.

## Testing

Before broad release, check login and owner approval, roles, calendar, file uploads, important-only push and cross-device synchronization on real devices.
