#!/usr/bin/env node
// Publish daily notifications to Aurix. Needs Node 18+.
//
//   export AURIX_ADMIN_KEY='...'        (never commit this)
//   node scripts/aurix-push.mjs publish today.json [--dry-run]
//   node scripts/aurix-push.mjs status
//   node scripts/aurix-push.mjs cancel <message-id>
//
// today.json:
// { "date": "2026-09-29",
//   "messages": [ { "time": "09:30", "title": "...", "body": "..." }, ... ] }
// "time" is IST. Leave "time" out to send immediately.
import { readFileSync } from 'node:fs';

const BASE = process.env.AURIX_FUNCTIONS_URL || 'https://gvjmhlwkunsqoimxjssn.supabase.co/functions/v1';
const KEY = process.env.AURIX_ADMIN_KEY;
if (!KEY) { console.error('Set AURIX_ADMIN_KEY first.'); process.exit(1); }

const [cmd, arg, flag] = process.argv.slice(2);
const call = async (path, method, body) => {
  const res = await fetch(`${BASE}/push-admin/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
};

if (cmd === 'publish' && arg) {
  const payload = JSON.parse(readFileSync(arg, 'utf8'));
  if (flag === '--dry-run') payload.dry_run = true;
  await call('publish', 'POST', payload);
} else if (cmd === 'status') await call('status', 'GET');
else if (cmd === 'cancel' && arg) await call('cancel', 'POST', { id: arg });
else console.log('Usage: publish <file.json> [--dry-run] | status | cancel <id>');
