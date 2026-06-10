// Supabase Edge Function: revenuecat-webhook  (OBS-17)
//
// Authoritative server-side entitlement writer. RevenueCat POSTs subscription
// lifecycle events here; we verify the shared secret, map the RC app_user_id to
// the Supabase user id (the app calls Purchases.logIn(user.id), so they match),
// and write user_settings.subscription_tier with the SERVICE ROLE. The client can
// never set subscription_tier itself (guarded by a trigger — see migration
// 20260610_guard_subscription_tier_server_only.sql).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected), and
// RC_WEBHOOK_SECRET (the Authorization value configured in the RevenueCat
// dashboard webhook). Board provisions RC_WEBHOOK_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUS_ENTITLEMENT = 'plus';

// Event types that grant/keep the entitlement vs. that revoke it. CANCELLATION /
// BILLING_ISSUE leave access in place until EXPIRATION (auto-renew off but still
// entitled), so they are intentionally no-ops here.
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);
const REVOKE_EVENTS = new Set(['EXPIRATION']);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SECRET = Deno.env.get('RC_WEBHOOK_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[revenuecat-webhook] missing RC_WEBHOOK_SECRET / Supabase config');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  // 1. Verify the shared secret (RevenueCat sends it as the Authorization header).
  const auth = req.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (presented !== SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // 2. Parse the event.
  let event: any;
  try {
    const body = await req.json();
    event = body?.event ?? body;
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  const type: string = event?.type ?? '';
  const appUserId: string = event?.app_user_id ?? '';
  const entitlementIds: string[] = event?.entitlement_ids
    ?? (event?.entitlement_id ? [event.entitlement_id] : []);

  // Only act on events for the Plus entitlement (when the field is present).
  if (entitlementIds.length > 0 && !entitlementIds.includes(PLUS_ENTITLEMENT)) {
    return json({ ok: true, ignored: 'entitlement-not-plus' }, 200);
  }

  // app_user_id is the Supabase user UUID (set via Purchases.logIn). Skip anon ids.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appUserId);
  if (!isUuid) {
    return json({ ok: true, ignored: 'non-uuid-app-user-id' }, 200);
  }

  let tier: 'plus' | 'free' | null = null;
  if (GRANT_EVENTS.has(type)) tier = 'plus';
  else if (REVOKE_EVENTS.has(type)) tier = 'free';

  if (!tier) {
    return json({ ok: true, ignored: `no-op-event:${type}` }, 200);
  }

  // 3. Write the tier with the service role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin
    .from('user_settings')
    .update({ subscription_tier: tier })
    .eq('user_id', appUserId);

  if (error) {
    console.error('[revenuecat-webhook] update failed:', error);
    return json({ error: 'Update failed' }, 500);
  }

  return json({ ok: true, user_id: appUserId, tier, type }, 200);
});
