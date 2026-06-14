/**
 * Supabase Edge Function: digest-shared-link
 *
 * Enriches a shared_link entry with a Gemini-generated content digest, a resolved
 * media type, a real title, and a thumbnail. Strategy by media type:
 *   - video             → Gemini watches the YouTube URL
 *   - music             → resolve track/artist, fetch lyrics (LRCLIB), Gemini distills
 *                         themes/tone (lyrics are NOT persisted)
 *   - article/post/etc. → Gemini url_context reads the page
 *
 * Always degrades gracefully: if digestion fails, it still backfills the resolved
 * title/thumbnail/media_type so the entry is richer than raw URL-slug parsing.
 *
 * Envelope: { ok, entryId, digest?, mediaType?, title?, thumbnailUrl?, error? }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { resolveLinkMetadata } from "../_shared/links/metadata.ts";
import { fetchLyrics } from "../_shared/links/lyrics.ts";
import { digestLinkWithGemini } from "../_shared/links/gemini.ts";

interface DigestRequest {
  entryId: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_DIGEST_CHARS = 800;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse({ ok: false, error: "missing_auth" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "missing_supabase_env" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let body: DigestRequest;
  try {
    body = (await req.json()) as DigestRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (!body?.entryId) {
    return jsonResponse({ ok: false, error: "missing_entryId" }, 400);
  }

  // Load the entry (RLS gates this to the owner).
  const { data: entry, error: rowError } = await supabase
    .from("entries")
    .select("id, source_type, shared_link_url, shared_link_title, shared_link_thumbnail_url")
    .eq("id", body.entryId)
    .single();

  if (rowError || !entry) {
    return jsonResponse({ ok: false, error: "entry_not_found", details: rowError?.message }, 404);
  }
  if (entry.source_type !== "shared_link" || !entry.shared_link_url) {
    return jsonResponse({ ok: false, error: "not_a_shared_link" }, 400);
  }

  const url: string = entry.shared_link_url;

  // 1. Resolve metadata (oEmbed → OpenGraph). Best-effort.
  const resolved = await resolveLinkMetadata(url);

  // 2. Lyrics for music (only feeds Gemini; never stored).
  const lyrics = resolved.mediaType === "music"
    ? await fetchLyrics(resolved.author, resolved.track ?? resolved.title)
    : null;

  // 3. Content digest. Null on failure → falls back to resolved metadata only.
  let digest: string | null = null;
  try {
    digest = await digestLinkWithGemini(url, resolved, lyrics);
  } catch {
    digest = null;
  }
  if (digest) digest = digest.slice(0, MAX_DIGEST_CHARS);

  // 4. Merge: prefer resolved title/thumbnail (richer than URL-slug parsing),
  //    keep existing as fallback. media_type is always set.
  const title = resolved.title ?? entry.shared_link_title ?? null;
  const thumbnailUrl = resolved.thumbnailUrl ?? entry.shared_link_thumbnail_url ?? null;

  const update: Record<string, unknown> = {
    shared_link_digest: digest,
    shared_link_media_type: resolved.mediaType,
    shared_link_title: title,
    shared_link_thumbnail_url: thumbnailUrl,
  };

  const { error: updateError } = await supabase
    .from("entries")
    .update(update)
    .eq("id", entry.id);

  if (updateError) {
    return jsonResponse({ ok: false, error: "update_failed", details: updateError.message }, 502);
  }

  return jsonResponse({
    ok: true,
    entryId: entry.id,
    digest,
    mediaType: resolved.mediaType,
    title,
    thumbnailUrl,
  });
});
