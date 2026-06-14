// Resolves shared-link metadata (title, thumbnail, media type, author/track)
// via oEmbed where available, falling back to OpenGraph tag scraping.
// Pure best-effort: every path degrades to nulls rather than throwing.

import type { LinkMediaType, ResolvedLinkMetadata } from "./types.ts";

const UA = "ObsyLinkBot/1.0 (+https://obsy.app)";

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
    host.endsWith("threads.net")
  ) {
    return "social";
  }
  return "article";
}

interface OEmbedProvider {
  match: (host: string) => boolean;
  endpoint: (url: string) => string;
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
];

async function tryOEmbed(url: string): Promise<Partial<ResolvedLinkMetadata> | null> {
  const host = hostOf(url);
  const provider = OEMBED_PROVIDERS.find((p) => p.match(host));
  if (!provider) return null;

  const res = await fetchWithTimeout(provider.endpoint(url), 6000);
  if (!res || !res.ok) return null;

  try {
    const data = await res.json();
    const title: string | null = typeof data.title === "string" ? data.title : null;
    const author: string | null = typeof data.author_name === "string" ? data.author_name : null;
    const thumbnailUrl: string | null = typeof data.thumbnail_url === "string" ? data.thumbnail_url : null;
    return { title, author, thumbnailUrl };
  } catch {
    return null;
  }
}

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

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
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

  const [oembed, og] = await Promise.all([tryOEmbed(url), tryOpenGraph(url)]);

  // oEmbed is more authoritative for title/thumbnail/author; OG fills gaps + description.
  const merged: Partial<ResolvedLinkMetadata> = {
    title: oembed?.title ?? og?.title ?? null,
    thumbnailUrl: oembed?.thumbnailUrl ?? og?.thumbnailUrl ?? null,
    author: oembed?.author ?? null,
    description: og?.description ?? null,
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
  };
}
