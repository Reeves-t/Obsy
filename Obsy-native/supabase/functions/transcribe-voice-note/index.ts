// Supabase Edge Function: transcribe-voice-note
//
// Hardened per OBS-10 (audit OBS-7 / H2):
//   - Requires a valid caller JWT (no anonymous access).
//   - CORS restricted to an allow-list (native requests send no Origin).
//   - Takes a `storagePath` the caller must OWN (must start with `${userId}/`)
//     and downloads the object with the service role from the private bucket.
//     This removes the previous arbitrary `audioUrl` server-side fetch (SSRF).
//
// Requires secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// OPENAI_API_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VOICE_BUCKET = 'voice-notes';

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
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', transcript: '' }, 405, cors);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error('[transcribe-voice-note] Missing Supabase environment configuration');
    return json({ error: 'Server misconfiguration', transcript: '' }, 500, cors);
  }
  if (!OPENAI_API_KEY) {
    console.error('[transcribe-voice-note] OPENAI_API_KEY not set');
    return json({ error: 'Transcription service unavailable', transcript: '' }, 503, cors);
  }

  // 1. Require + verify the caller's JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization', transcript: '' }, 401, cors);
  }
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authedClient.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'Invalid or expired session', transcript: '' }, 401, cors);
  }
  const userId = userData.user.id;

  // 2. Resolve + ownership-check the storage path.
  let storagePath = '';
  let language = 'en';
  try {
    const body = await req.json();
    storagePath = String(body.storagePath ?? '');
    if (body.language) language = String(body.language);
  } catch {
    return json({ error: 'Invalid request body', transcript: '' }, 400, cors);
  }
  if (!storagePath) {
    return json({ error: 'storagePath is required', transcript: '' }, 400, cors);
  }
  // The first path segment is the owner's user id (see voice upload path).
  if (!storagePath.startsWith(`${userId}/`) || storagePath.includes('..')) {
    return json({ error: 'Forbidden', transcript: '' }, 403, cors);
  }

  // 3. Download the audio from the private bucket with the service role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: audioBlob, error: downloadError } = await admin.storage
    .from(VOICE_BUCKET)
    .download(storagePath);
  if (downloadError || !audioBlob) {
    console.error('[transcribe-voice-note] download failed:', downloadError);
    return json({ error: 'Audio not found', transcript: '' }, 404, cors);
  }

  // 4. Transcribe via Whisper.
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-note.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', language);

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw new Error(`Whisper API error: ${whisperResponse.status} ${errText}`);
    }

    const result = await whisperResponse.json();
    return json({ transcript: result.text || '', error: null }, 200, cors);
  } catch (err) {
    console.error('[transcribe-voice-note]', err);
    return json({ transcript: '', error: 'Transcription failed' }, 500, cors);
  }
});
