// Resolves shared-link metadata (title, thumbnail, caption text, author/track)
// via each platform's structured endpoint (oEmbed / JSON API) where available,
// falling back to OpenGraph tag scraping for the open web.
// Pure best-effort: every path degrades to nulls rather than throwing.
//
// Why structured endpoints matter: TikTok, Instagram, X and Facebook serve bot
// walls or JS-only shells to a plain page fetch, so OpenGraph scraping returns
// nothing usable (or worse, a login-page title). Their oEmbed endpoints return
// the caption, author and thumbnail as JSON with no auth.

import type { LinkMediaType, ResolvedLinkMetadata } from "./types.ts";

const UA = "ObsyLinkBot/1.0 (+https://obsy.app)";

/** Max characters of caption/selftext kept as the digest input. */
const MAX_TEXT_CHARS = 1500;

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Hosts that block plain page fetches. For these, OpenGraph scraping is skipped
 * entirely — it costs latency and can only return a bot-wall title.
 */
function isWalledHost(host: string): boolean {
  return (
    host.endsWith("tiktok.com") ||
    host.endsWith("instagram.com") ||
    host.endsWith("threads.net") ||
    host.endsWith("threads.com") ||
    host.endsWith("facebook.com") ||
    host.endsWith("twitter.com") ||
    host.endsWith("x.com")
  );
}

/** Signed CDN hosts whose image URLs expire within days. */
function isExpiringThumbnailHost(thumbnailUrl: string | null): boolean {
  if (!thumbnailUrl) return false;
  const h = hostOf(thumbnailUrl);
  return (
    h.includes("tiktokcdn") ||
    h.includes("cdninstagram") ||
    h.includes("fbcdn") ||
    /[?&]x-expires=/i.test(thumbnailUrl)
  );
}

export function classifyMediaType(url: string): LinkMediaType {
  const host = hostOf(url);
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch { /* ignore */ }

  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "video";
  if (host.endsWith("spotify.com")) {
    if (path.includes("/playlist")) return "playlist";
    if (path.includes("/episode") || path.includes("/show")) return "podcast";
    return "music"; // track / album / artist
  }
  if (host.endsWith("music.apple.com")) return path.includes("/podcast") ? "podcast" : "music";
  if (host.endsWith("soundcloud.com")) return "music";
  if (host.endsWith("reddit.com")) return "post";
  if (
    host.endsWith("instagram.com") ||
    host.endsWith("tiktok.com") ||
    host.endsWith("twitter.com") ||
    host.endsWith("x.com") ||
    host.endsWith("threads.net") ||
    host.endsWith("threads.com") ||
    host.endsWith("tumblr.com")
  ) {
    return "social";
  }
  return "article";
}

// ─────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function clampText(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) : t;
}

// ─────────────────────────────────────────────────────────────
// oEmbed providers
// ─────────────────────────────────────────────────────────────

interface OEmbedProvider {
  match: (host: string) => boolean;
  endpoint: (url: string) => string;
  /**
   * Optional provider-specific mapping from the raw oEmbed JSON. Providers
   * without one use the standard title/author_name/thumbnail_url fields.
   */
  parse?: (data: Record<string, unknown>) => Partial<ResolvedLinkMetadata>;
}

/**
 * X/Twitter oEmbed returns the tweet body inside the embed blockquote:
 *   <blockquote ...><p ...>TWEET TEXT</p>&mdash; Name (@handle) <a>date</a></blockquote>
 * There is no thumbnail field — media tweets are rendered as text cards client-side.
 */
function parseTweetHtml(html: string): string | null {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (p?.[1]) return clampText(stripTags(p[1]));
  // No <p> (rare, e.g. media-only tweets) — fall back to the blockquote body
  // minus the trailing author/date anchor.
  const bq = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
  if (bq?.[1]) return clampText(stripTags(bq[1].replace(/&mdash;[\s\S]*$/i, "")));
  return null;
}

const OEMBED_PROVIDERS: OEmbedProvider[] = [
  {
    match: (h) => h === "youtube.com" || h === "youtu.be" || h === "m.youtube.com",
    endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    match: (h) => h.endsWith("spotify.com"),
    endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    match: (h) => h.endsWith("soundcloud.com"),
    endpoint: (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    // TikTok: no auth, no key. `title` is the full caption including hashtags —
    // that caption is what we digest, since the video itself is not readable.
    match: (h) => h.endsWith("tiktok.com"),
    endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
    parse: (d) => ({
      title: typeof d.title === "string" ? d.title : null,
      text: typeof d.title === "string" ? clampText(d.title) : null,
      author: typeof d.author_name === "string" ? d.author_name : null,
      thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : null,
    }),
  },
  {
    // Instagram — tokenless since 2026-06-15 (public content only, lower rate
    // limits than the token route). Returns the caption in `title` for most posts.
    match: (h) => h.endsWith("instagram.com"),
    endpoint: (u) =>
      `https://graph.facebook.com/v21.0/instagram_oembed?omitscript=true&url=${encodeURIComponent(u)}`,
    parse: (d) => ({
      title: typeof d.title === "string" ? d.title : null,
      text: typeof d.title === "string" ? clampText(d.title) : null,
      author: typeof d.author_name === "string" ? d.author_name : null,
      thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : null,
    }),
  },
  {
    match: (h) => h.endsWith("threads.net") || h.endsWith("threads.com"),
    endpoint: (u) => `https://graph.threads.net/oembed?url=${encodeURIComponent(u)}`,
    parse: (d) => ({
      title: typeof d.title === "string" ? d.title : null,
      text: typeof d.title === "string" ? clampText(d.title) : null,
      author: typeof d.author_name === "string" ? d.author_name : null,
      thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : null,
    }),
  },
  {
    match: (h) => h.endsWith("facebook.com"),
    endpoint: (u) =>
      `https://graph.facebook.com/v21.0/oembed_post?omitscript=true&url=${encodeURIComponent(u)}`,
    parse: (d) => ({
      title: typeof d.title === "string" ? d.title : null,
      text: typeof d.title === "string" ? clampText(d.title) : null,
      author: typeof d.author_name === "string" ? d.author_name : null,
      thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : null,
    }),
  },
  {
    // X/Twitter: text-only. No thumbnail field exists in the official response,
    // and the unofficial media routes are too unstable to depend on.
    match: (h) => h.endsWith("twitter.com") || h.endsWith("x.com"),
    endpoint: (u) =>
      `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(u)}`,
    parse: (d) => {
      const html = typeof d.html === "string" ? d.html : "";
      const text = html ? parseTweetHtml(html) : null;
      const author = typeof d.author_name === "string" ? d.author_name : null;
      return {
        // The tweet body doubles as the title; the card truncates it.
        title: text ?? (author ? `Post by ${author}` : null),
        text,
        author,
        thumbnailUrl: null,
      };
    },
  },
  {
    match: (h) => h.endsWith("tumblr.com"),
    endpoint: (u) => `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(u)}`,
    parse: (d) => {
      const summary = typeof d.summary === "string" ? d.summary : null;
      return {
        title: typeof d.title === "string" ? d.title : summary,
        text: clampText(summary),
        author: typeof d.author_name === "string" ? d.author_name : null,
        thumbnailUrl: typeof d.thumbnail_url === "string" ? d.thumbnail_url : null,
      };
    },
  },
];

async function tryOEmbed(url: string): Promise<Partial<ResolvedLinkMetadata> | null> {
  const host = hostOf(url);
  const provider = OEMBED_PROVIDERS.find((p) => p.match(host));
  if (!provider) return null;

  const res = await fetchWithTimeout(provider.endpoint(url), 6000);
  if (!res || !res.ok) return null;

  try {
    const data = await res.json() as Record<string, unknown>;
    if (provider.parse) return provider.parse(data);
    return {
      title: typeof data.title === "string" ? data.title : null,
      author: typeof data.author_name === "string" ? data.author_name : null,
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Reddit (JSON API — no auth, richer than oEmbed)
// ─────────────────────────────────────────────────────────────

/**
 * Reddit serves the full post as JSON when `.json` is appended to any post URL:
 * title, selftext (the digest input for text posts), and preview images.
 */
async function tryRedditJson(url: string): Promise<Partial<ResolvedLinkMetadata> | null> {
  let jsonUrl: string;
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/$/, "") + ".json";
    jsonUrl = u.toString();
  } catch {
    return null;
  }

  const res = await fetchWithTimeout(jsonUrl, 7000, { headers: { Accept: "application/json" } });
  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post || typeof post !== "object") return null;

    const title: string | null = typeof post.title === "string" ? post.title : null;
    const selftext: string | null = typeof post.selftext === "string" ? post.selftext : null;
    const author: string | null = typeof post.author === "string" ? `u/${post.author}` : null;

    // preview.images[0].source.url is HTML-escaped in Reddit's payload.
    let thumbnailUrl: string | null = null;
    const previewUrl = post?.preview?.images?.[0]?.source?.url;
    if (typeof previewUrl === "string") {
      thumbnailUrl = decodeHtml(previewUrl);
    } else if (typeof post.thumbnail === "string" && /^https?:\/\//.test(post.thumbnail)) {
      // "self"/"default"/"nsfw" are placeholders, not URLs.
      thumbnailUrl = post.thumbnail;
    }

    return {
      title,
      // Link posts have an empty selftext — the title is then the only content.
      text: clampText(selftext) ?? clampText(title),
      author,
      thumbnailUrl,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// OpenGraph (open web fallback)
// ─────────────────────────────────────────────────────────────

function metaTag(html: string, property: string): string | null {
  // Match <meta property="og:x" content="..."> or name="x" in either attribute order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return null;
}

async function tryOpenGraph(url: string): Promise<Partial<ResolvedLinkMetadata> | null> {
  const res = await fetchWithTimeout(url, 7000, { headers: { Accept: "text/html" } });
  if (!res || !res.ok) return null;

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html")) return null;

  let html = "";
  try {
    // Cap the body we scan — og tags live in <head>.
    html = (await res.text()).slice(0, 200_000);
  } catch {
    return null;
  }

  const ogTitle = metaTag(html, "og:title");
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return {
    title: ogTitle ?? (titleTag ? decodeHtml(titleTag.trim()) : null),
    description: metaTag(html, "og:description"),
    thumbnailUrl: metaTag(html, "og:image"),
  };
}

/**
 * Parse "Track" + "Artist" for a music link from whatever signals we have.
 * SoundCloud oEmbed gives "Track by Artist"; Spotify gives track in title and
 * artist buried in og:description ("Artist · Song · 2020").
 */
function parseArtistTrack(
  host: string,
  merged: Partial<ResolvedLinkMetadata>,
): { track: string | null; author: string | null } {
  let track = merged.title ?? null;
  let author = merged.author ?? null;

  if (track && / by /i.test(track) && !author) {
    const [t, a] = track.split(/ by /i);
    track = t.trim();
    author = a?.trim() ?? null;
  }

  if (!author && host.endsWith("spotify.com") && merged.description) {
    // "Artist · Song · 2020" — the first segment is the artist.
    const first = merged.description.split("·")[0]?.trim();
    if (first && !/^listen\b/i.test(first)) author = first;
  }

  return { track, author };
}

export async function resolveLinkMetadata(url: string): Promise<ResolvedLinkMetadata> {
  const mediaType = classifyMediaType(url);
  const host = hostOf(url);

  // Reddit has a dedicated JSON resolver; walled hosts skip the OG fetch, which
  // could only return a login-page title for them.
  const isReddit = host.endsWith("reddit.com");
  const [structured, og] = await Promise.all([
    isReddit ? tryRedditJson(url) : tryOEmbed(url),
    isWalledHost(host) || isReddit ? Promise.resolve(null) : tryOpenGraph(url),
  ]);

  // Structured sources are authoritative for title/thumbnail/author/text;
  // OG fills gaps and supplies the description.
  const merged: Partial<ResolvedLinkMetadata> = {
    title: structured?.title ?? og?.title ?? null,
    thumbnailUrl: structured?.thumbnailUrl ?? og?.thumbnailUrl ?? null,
    author: structured?.author ?? null,
    description: og?.description ?? null,
    text: structured?.text ?? null,
  };

  const isMusic = mediaType === "music" || mediaType === "playlist";
  const { track, author } = isMusic
    ? parseArtistTrack(host, merged)
    : { track: null, author: merged.author ?? null };

  return {
    mediaType,
    title: merged.title,
    thumbnailUrl: merged.thumbnailUrl,
    description: merged.description ?? null,
    author,
    track,
    text: merged.text ?? null,
    thumbnailExpires: isExpiringThumbnailHost(merged.thumbnailUrl ?? null),
  };
}
