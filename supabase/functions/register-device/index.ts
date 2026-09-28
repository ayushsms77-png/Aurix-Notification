import { createClient } from 'npm:@supabase/supabase-js@2';

// Public endpoint. It can ONLY upsert a device's own push token -- it cannot
// send anything or read anything back.
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 2000) return json({ error: 'too_large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const token = body.expo_push_token;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return json({ error: 'invalid_token' }, 400);
  const platform = body.platform === 'ios' ? 'ios' : 'android';
  const appVersion = typeof body.app_version === 'string' ? body.app_version.slice(0, 32) : null;

  const { error } = await db.from('devices').upsert(
    {
      expo_push_token: token,
      platform,
      app_version: appVersion,
      active: true,
      disabled_reason: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );
  if (error) {
    console.error('register failed', error.message);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true });
});
