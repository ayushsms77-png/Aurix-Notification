# Aurix push notifications

Flow: you publish messages -> Supabase stores them -> pg_cron (every minute) calls
`push-admin/send-due` -> Expo Push -> FCM -> phone. Receipts are checked every 15 min
and dead tokens are switched off automatically.

## Daily use (Codespaces)
```bash
export AURIX_ADMIN_KEY='<your admin key>'          # never commit it
node scripts/aurix-push.mjs publish today.json --dry-run   # check the IST times
node scripts/aurix-push.mjs publish today.json
node scripts/aurix-push.mjs status                 # devices + recent messages
node scripts/aurix-push.mjs cancel <message-id>    # cancel a scheduled one
```
`today.json` (times are IST, title <= 65 chars, body <= 200 chars, max 12 per publish):
```json
{ "date": "2026-09-29", "messages": [
  { "time": "09:30", "title": "Morning, music lover", "body": "Your ears called. They want a good song." },
  { "time": "13:00", "title": "Lunch break playlist?", "body": "Feed your ears too." } ] }
```

### ChatGPT prompt
> Write 6 short push notifications for Aurix, a music app. Tone: playful, friendly, sweet,
> occasionally teasing. Title max 60 characters, body max 180. Spread them across the day
> (IST) for date YYYY-MM-DD. Output ONLY JSON like: {"date":"...","messages":[{"time":"HH:MM","title":"...","body":"..."}]}

## Security model (simple, no user accounts)
- All tables: RLS on, no policies, anon/authenticated grants revoked. Only Edge Functions read/write.
- `register-device` is public but can only upsert a validated Expo token.
- `push-admin` needs `x-admin-key` (or the DB-generated cron key). Only SHA-256 hashes are stored.
- Limits: anyone could register junk tokens (harmless: they get deactivated on first failed send);
  a leaked admin key lets someone publish -> rotate it (below).

### Rotate the admin key
Generate a new random string (>= 32 chars), then in the Supabase SQL editor:
`update public.admin_keys set key_hash = encode(extensions.digest('NEW_KEY','sha256'),'hex') where kind='admin';`

## Rebuild the app
Native changes (expo-notifications, google-services.json) need a new EAS build, not an OTA update:
`eas build -p android --profile preview`
