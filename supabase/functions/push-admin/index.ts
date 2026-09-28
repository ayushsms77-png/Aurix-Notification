import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Aurix push admin. Routes (last path segment):
 *   POST publish        (admin key)  store messages, send the due ones now
 *   GET  status         (admin key)  device count + recent messages
 *   POST cancel         (admin key)  { id } cancel a scheduled message
 *   POST send-due       (admin or cron key)  send everything that is due
 *   POST check-receipts (admin or cron key)  fetch Expo receipts, disable dead tokens
 * Keys are compared by SHA-256 against public.admin_keys; raw keys are never stored.
 */
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN'); // optional
const CHANNEL_ID = 'daily';
const MAX_PER_PUBLISH = 12;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function who(req: Request): Promise<'admin' | 'cron' | null> {
  const admin = req.headers.get('x-admin-key');
  const cron = req.headers.get('x-cron-secret');
  if (!admin && !cron) return null;
  const { data } = await db.from('admin_keys').select('kind,key_hash');
  const hashes = new Map((data ?? []).map((r) => [r.kind as string, r.key_hash as string]));
  if (admin && admin.length >= 32 && hashes.has('admin') && safeEqual(await sha256(admin), hashes.get('admin')!)) return 'admin';
  if (cron && hashes.has('cron') && safeEqual(await sha256(cron), hashes.get('cron')!)) return 'cron';
  return null;
}

// ---------- publishing ----------
type Incoming = { title?: unknown; body?: unknown; time?: unknown; send_at?: unknown; date?: unknown };

/** "2026-09-29" + "09:30" in IST (+05:30) -> Date */
function istToDate(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}

async function publish(payload: Record<string, unknown>) {
  const list = payload.messages;
  if (!Array.isArray(list) || list.length === 0) return json({ error: 'messages[] required' }, 400);
  if (list.length > MAX_PER_PUBLISH) return json({ error: `max ${MAX_PER_PUBLISH} messages per publish` }, 400);
  const topDate = typeof payload.date === 'string' ? payload.date : null;
  const now = Date.now();
  const batch = crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  const preview: Record<string, unknown>[] = [];

  for (let i = 0; i < list.length; i++) {
    const m = list[i] as Incoming;
    const title = typeof m.title === 'string' ? m.title.trim() : '';
    const body = typeof m.body === 'string' ? m.body.trim() : '';
    if (title.length < 1 || title.length > 65) return json({ error: `message ${i + 1}: title must be 1-65 chars` }, 400);
    if (body.length < 1 || body.length > 200) return json({ error: `message ${i + 1}: body must be 1-200 chars` }, 400);
    let when: Date;
    if (typeof m.send_at === 'string') {
      when = new Date(m.send_at);
      if (isNaN(when.getTime()) || !/([zZ]|[+-]\d{2}:\d{2})$/.test(m.send_at)) {
        return json({ error: `message ${i + 1}: send_at needs an ISO time with offset, e.g. 2026-09-29T09:30:00+05:30` }, 400);
      }
    } else if (typeof m.time === 'string') {
      const date = typeof m.date === 'string' ? m.date : topDate;
      const d = date ? istToDate(date, m.time) : null;
      if (!d) return json({ error: `message ${i + 1}: need "date" (YYYY-MM-DD) and "time" (HH:MM, IST)` }, 400);
      when = d;
    } else {
      when = new Date(now); // no time given -> send now
    }
    if (when.getTime() < now - 10 * 60 * 1000) {
      return json({ error: `message ${i + 1}: scheduled time is more than 10 minutes in the past` }, 400);
    }
    rows.push({ batch_id: batch, title, body, scheduled_at: when.toISOString(), status: 'scheduled' });
    preview.push({
      title, body, scheduled_at_utc: when.toISOString(),
      scheduled_at_ist: new Date(when.getTime() + 330 * 60000).toISOString().replace('T', ' ').slice(0, 16) + ' IST',
    });
  }

  if (payload.dry_run === true) return json({ dry_run: true, would_publish: preview });

  const { error } = await db.from('notification_messages').insert(rows);
  if (error) return json({ error: 'db_error', detail: error.message }, 500);
  const sent = await sendDue(); // anything due right now goes out immediately
  return json({ published: preview.length, batch_id: batch, schedule: preview, sent_now: sent });
}

// ---------- sending ----------
type Ticket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

function expoHeaders() {
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (EXPO_TOKEN) h.Authorization = `Bearer ${EXPO_TOKEN}`;
  return h;
}

async function sendDue() {
  const { data: claimed, error } = await db.rpc('claim_due_messages', { p_limit: 5 });
  if (error) return { error: error.message };
  const results: unknown[] = [];
  for (const msg of claimed ?? []) results.push(await deliver(msg));
  return results;
}

async function deliver(msg: { id: string; title: string; body: string }) {
  const { data: devices } = await db.from('devices').select('id,expo_push_token').eq('active', true).limit(5000);
  const { data: done } = await db.from('notification_deliveries').select('device_id').eq('message_id', msg.id);
  const already = new Set((done ?? []).map((d) => d.device_id as string));
  const targets = (devices ?? []).filter((d) => !already.has(d.id as string));

  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const payload = chunk.map((d) => ({
      to: d.expo_push_token, title: msg.title, body: msg.body,
      channelId: CHANNEL_ID, sound: 'default', priority: 'high', ttl: 6 * 3600,
    }));
    let tickets: Ticket[] | null = null;
    let failure = 'expo_request_failed';
    try {
      const res = await fetch(EXPO_SEND, { method: 'POST', headers: expoHeaders(), body: JSON.stringify(payload) });
      const j = await res.json();
      if (res.ok && Array.isArray(j.data)) tickets = j.data;
      else failure = `expo_http_${res.status}`;
    } catch (e) {
      failure = `expo_network: ${(e as Error).message}`.slice(0, 200);
    }
    const rows = chunk.map((d, k) => {
      const t = tickets?.[k];
      if (!t) return { message_id: msg.id, device_id: d.id, status: 'error', error: failure };
      if (t.status === 'ok') return { message_id: msg.id, device_id: d.id, status: 'ok', ticket_id: t.id };
      return { message_id: msg.id, device_id: d.id, status: 'error', error: t.details?.error ?? t.message ?? 'unknown' };
    });
    await db.from('notification_deliveries').upsert(rows, { onConflict: 'message_id,device_id', ignoreDuplicates: true });
    const dead = chunk.filter((_, k) => {
      const t = tickets?.[k];
      return t && t.status === 'error' && t.details?.error === 'DeviceNotRegistered';
    }).map((d) => d.id);
    if (dead.length) await db.from('devices').update({ active: false, disabled_reason: 'DeviceNotRegistered' }).in('id', dead);
  }

  const { data: all } = await db.from('notification_deliveries').select('status').eq('message_id', msg.id);
  const ok = (all ?? []).filter((r) => r.status === 'ok').length;
  const bad = (all ?? []).length - ok;
  const status = bad === 0 ? 'sent' : ok > 0 ? 'partial' : 'failed';
  await db.from('notification_messages').update({
    status, sent_count: ok, error_count: bad, sent_at: new Date().toISOString(),
  }).eq('id', msg.id);
  return { id: msg.id, title: msg.title, status, sent: ok, errors: bad, devices: targets.length };
}

// ---------- receipts ----------
async function checkReceipts() {
  const { data: pending } = await db.from('notification_deliveries')
    .select('id,ticket_id,device_id,created_at')
    .eq('receipt_status', 'pending').not('ticket_id', 'is', null)
    .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()).limit(1000);
  if (!pending?.length) return { checked: 0 };
  let receipts: Record<string, { status: string; message?: string; details?: { error?: string } }> = {};
  try {
    const res = await fetch(EXPO_RECEIPTS, {
      method: 'POST', headers: expoHeaders(), body: JSON.stringify({ ids: pending.map((p) => p.ticket_id) }),
    });
    const j = await res.json();
    receipts = j.data ?? {};
  } catch (e) {
    return { error: (e as Error).message };
  }
  let ok = 0, err = 0, unknown = 0;
  const dead: string[] = [];
  for (const p of pending) {
    const r = receipts[p.ticket_id as string];
    const nowIso = new Date().toISOString();
    if (!r) {
      if (Date.now() - new Date(p.created_at as string).getTime() > 24 * 3600 * 1000) {
        await db.from('notification_deliveries').update({ receipt_status: 'unknown', checked_at: nowIso }).eq('id', p.id);
        unknown++;
      }
      continue;
    }
    if (r.status === 'ok') {
      await db.from('notification_deliveries').update({ receipt_status: 'ok', checked_at: nowIso }).eq('id', p.id);
      ok++;
    } else {
      const code = r.details?.error ?? r.message ?? 'unknown';
      await db.from('notification_deliveries').update({ receipt_status: 'error', receipt_error: code, checked_at: nowIso }).eq('id', p.id);
      if (code === 'DeviceNotRegistered') dead.push(p.device_id as string);
      err++;
    }
  }
  if (dead.length) await db.from('devices').update({ active: false, disabled_reason: 'DeviceNotRegistered' }).in('id', dead);
  return { checked: pending.length, ok, errors: err, unknown, devices_disabled: dead.length };
}

// ---------- router ----------
Deno.serve(async (req) => {
  const route = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  const role = await who(req);
  if (!role) {
    await new Promise((r) => setTimeout(r, 400)); // slow down key guessing
    return json({ error: 'unauthorized' }, 401);
  }
  try {
    if (route === 'send-due' && req.method === 'POST') return json({ results: await sendDue() });
    if (route === 'check-receipts' && req.method === 'POST') return json(await checkReceipts());
    if (role !== 'admin') return json({ error: 'forbidden' }, 403);
    if (route === 'publish' && req.method === 'POST') return await publish(await req.json());
    if (route === 'cancel' && req.method === 'POST') {
      const { id } = await req.json();
      const { data } = await db.from('notification_messages').update({ status: 'cancelled' })
        .eq('id', id).eq('status', 'scheduled').select('id');
      return json({ cancelled: data?.length ?? 0 });
    }
    if (route === 'status' && req.method === 'GET') {
      const { count } = await db.from('devices').select('id', { count: 'exact', head: true }).eq('active', true);
      const { data } = await db.from('notification_messages')
        .select('id,title,status,scheduled_at,sent_count,error_count').order('scheduled_at', { ascending: false }).limit(15);
      return json({ active_devices: count ?? 0, recent: data });
    }
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error', detail: (e as Error).message }, 500);
  }
});
