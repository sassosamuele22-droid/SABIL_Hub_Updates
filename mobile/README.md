# SABIL GR Hub Mobile PWA v0.10

## v0.10 hotfix
- Fixed startup/login regression from the first push build.
- Push initialization is now non-blocking.
- Fixed Home render runtime issue.
- Login logo is white.
- Cache namespace is `v010-hotfix1`.

Adds real OS-level Web Push notifications.

## Push
After a user taps Enable and grants permission, the installed PWA can receive SABIL GR notifications even while closed.

The backend is already configured in the connected Supabase project with:
- push_subscriptions table with per-user RLS
- automatic notifications -> push database trigger
- deployed sabil-push Edge Function
- VAPID Web Push keys

Push is generated from the shared notifications table, so Desktop/backend notifications can reach Mobile too.

Tapping a push can open the related Event, Updates, Results, or Home and marks the in-app notification as read.

Settings now includes Enable/Disable Push Notifications. Home also offers an Enable card until configured.

## Deploy
Replace the full SABIL_Hub_Updates/mobile/ directory and commit to main. After Vercel redeploys, fully close/reopen the PWA so cache v010 loads. Each user must tap Enable once and approve notification permission.
