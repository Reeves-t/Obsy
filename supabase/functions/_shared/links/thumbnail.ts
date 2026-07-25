// Re-hosts a shared link's preview image into the private `link-thumbnails`
// bucket so it survives the source CDN's expiry.
//
// TikTok and Meta hand back signed URLs (`x-expires=...`) that lapse within
// days; persisting them verbatim means every social thumbnail in a journal goes
// broken within a week. Downloading once and serving from our own bucket makes
// the saved entry outlive the post it came from.
//
// Best-effort by contract: every failure path returns null and the caller keeps
// the original URL as a fallback. A thumbnail is never worth failing a digest over.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const BUCKET = "link-thumbnails";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — thumbnails are far smaller; this is a guard.
const DOWNLOAD_TIMEOUT_MS = 8000;

/**
 * Downloads `sourceUrl` and stores it at `<userId>/<entryId>.jpg`.
 *
 * The object key always ends `.jpg` to keep the path deterministic across
 * re-digests (no orphaned objects when a source switches format); the true
 * media type travels in the object's contentType, which is what Storage serves
 * and what the image client honours.
 *
 * @returns the storage path on success, or null if anything went wrong.
 */
export async function rehostThumbnail(
  supabase: SupabaseClient,
  sourceUrl: string,
  userId: string,
  entryId: string,
): Promise<string | null> {
  if (!sourceUrl || !userId || !entryId) return null;

  let bytes: ArrayBuffer;
  let contentType: string;

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        // Some CDNs (notably Meta's) 403 requests with no UA or Accept header.
        "User-Agent": "ObsyLinkBot/1.0 (+https://obsy.app)",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    // Reject oversized payloads before buffering when the server declares a size.
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BYTES) return null;

    bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
  } catch {
    return null;
  }

  const path = `${userId}/${entryId}.jpg`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType,
        upsert: true,
      });
    if (error) return null;
  } catch {
    return null;
  }

  return path;
}
