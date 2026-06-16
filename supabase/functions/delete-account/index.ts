// Supabase Edge Function: delete-account
//
// Apple Guideline 5.1.1(v) requires apps with accounts to let users initiate
// account + data deletion from inside the app. This function:
//   1. Verifies the caller's JWT and resolves their user id.
//   2. Purges all of the user's objects from storage (under the `${userId}/` prefix).
//   3. Deletes the auth user with the service role; row data in public tables is
//      removed via ON DELETE CASCADE foreign keys to auth.users.
//
// Requires the default Supabase secrets (auto-injected): SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Buckets that may hold user-scoped objects under a `${userId}/...` prefix.
const USER_STORAGE_BUCKETS = ['voice-notes', 'entries', 'avatars', 'topic-attachments'];

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  // Only echo an allow-origin for explicitly allow-listed web origins. Native
  // app requests send no Origin header and don't require CORS.
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// Recursively list + remove every object under `${prefix}` in a bucket.
async function purgeBucketPrefix(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data: items, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !items || items.length === 0) return;

  const filePaths: string[] = [];
  for (const item of items) {
    const path = `${prefix}/${item.name}`;
    // A null `id` indicates a sub-folder (prefix), not a file.
    if (item.id === null) {
      await purgeBucketPrefix(admin, bucket, path);
    } else {
      filePaths.push(path);
    }
  }
  if (filePaths.length > 0) {
    await admin.storage.from(bucket).remove(filePaths);
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error('[delete-account] Missing Supabase environment configuration');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // 1. Verify the caller's JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authedClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  // 2 + 3. Purge storage, then delete the auth user (cascades public row data).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    for (const bucket of USER_STORAGE_BUCKETS) {
      try {
        await purgeBucketPrefix(admin, bucket, userId);
      } catch (storageErr) {
        // Don't abort the whole deletion if one bucket is missing/empty.
        console.error(`[delete-account] storage purge failed for ${bucket}:`, storageErr);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account]', err);
    return new Response(JSON.stringify({ error: 'Account deletion failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
