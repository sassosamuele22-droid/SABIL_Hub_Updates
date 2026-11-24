# SABIL GR Hub

- `mobile/`: Mobile PWA v0.19 (Vercel root: `mobile`)
- `app/`: Windows Electron v0.9.13
- Both use the same Supabase project. Do not re-run the legacy v0.18 migration.

Windows builds use `npm ci`. The tagged release pipeline runs regression tests, builds an installer and publishes the installer, blockmap and latest.yml. Mobile is deployed by Vercel on main. Run `node --test tests/stability.test.cjs` from the repository root. Real-device login, push, role and updater tests remain required before team-wide sign-off.
