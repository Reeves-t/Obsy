// Digests a shared link's CONTENT with Gemini, picking a strategy by media type:
//   - video             → YouTube video ingestion (fileData)
//   - music             → distill themes/tone from lyrics, else from title+artist
//   - social/post w/text → digest the post's own caption / body text
//   - article/etc.      → url_context (Gemini fetches & reads the page)
// Returns a short plain-text digest, or null on any failure (caller falls back).
//
// Social posts get the caption path rather than url_context because TikTok,
// Instagram and X serve bot walls to Gemini's fetcher exactly as they do to us —
// url_context silently returns nothing for them. The caption resolved by
// metadata.ts is the only content available, and for a journal digest it is
// usually enough: it is what the post said about itself.

import type { ResolvedLinkMetadata } from "./types.ts";

const GEMINI_MODEL = Deno.env.get("AI_GEMINI_MODEL") ?? "gemini-2.5-flash";

const WEB_PROMPT =
  `Summarize what this link is, in 1-2 plain sentences, for a personal journal. ` +
  `State what it's about and why someone might save it. No preamble, no markdown, no quotes.`;

const VIDEO_PROMPT =
  `In 1-2 plain sentences, summarize what this video is about for a personal journal. ` +
  `No preamble, no markdown.`;

const MUSIC_PROMPT_LYRICS =
  `You are given a song's lyrics. In 1-2 plain sentences, distill the song's themes and ` +
  `emotional tone for a personal journal. Do NOT reproduce or quote the lyrics. No preamble, no markdown.`;

const MUSIC_PROMPT_KNOWLEDGE =
  `In one plain sentence, describe this song's general mood/genre/themes for a personal journal, ` +
  `only if reasonably known. If unsure, describe it neutrally by title and artist. No preamble, no markdown.`;

const SOCIAL_PROMPT =
  `You are given a social media post's own caption or body text. In 1-2 plain sentences, ` +
  `describe what the post is about for a personal journal, and why someone might have saved it. ` +
  `Do not quote the caption verbatim and do not list its hashtags. If the caption is too thin to ` +
  `tell what the post is about, say plainly what it appears to be. No preamble, no markdown, no quotes.`;

interface GeminiPart {
  text?: string;
  fileData?: { fileUri: string };
}

interface GeminiBody {
  contents: Array<{ role: string; parts: GeminiPart[] }>;
  generationConfig: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
}

function buildBody(resolved: ResolvedLinkMetadata, url: string, lyrics: string | null): GeminiBody {
  const generationConfig = {
    temperature: 0.4,
    maxOutputTokens: 256,
    thinkingConfig: { thinkingBudget: 0 },
  };

  // Video — let Gemini watch the YouTube URL directly.
  if (resolved.mediaType === "video") {
    return {
      contents: [{ role: "user", parts: [{ fileData: { fileUri: url } }, { text: VIDEO_PROMPT }] }],
      generationConfig,
    };
  }

  // Music — lyrics if we have them, otherwise general knowledge from title+artist.
  if (resolved.mediaType === "music") {
    const songLabel = `"${resolved.track ?? resolved.title ?? "this song"}"${resolved.author ? ` by ${resolved.author}` : ""}`;
    const text = lyrics
      ? `${MUSIC_PROMPT_LYRICS}\n\nSong: ${songLabel}\n\nLyrics:\n${lyrics}`
      : `${MUSIC_PROMPT_KNOWLEDGE}\n\nSong: ${songLabel}`;
    return {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig,
    };
  }

  // Social posts (and any post whose body we resolved) — digest the text we have.
  // No url_context: these hosts block Gemini's fetcher, so the caption is all
  // there is. Falls through to the page-reading path when no text resolved.
  if ((resolved.mediaType === "social" || resolved.mediaType === "post") && resolved.text) {
    const source = [
      platformLabel(url),
      resolved.author ? `by ${resolved.author}` : null,
    ].filter(Boolean).join(" ");
    const text = `${SOCIAL_PROMPT}\n\nPost: ${source || "social media post"}\n\nCaption:\n${resolved.text}`;
    return {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig,
    };
  }

  // Everything else (article/playlist/podcast/link) — read the page. Ordinary
  // websites do not bot-wall, so url_context genuinely fetches and reads them;
  // this is the full-HTML digest path. Any og:description we resolved rides
  // along so the model still has something to work with when the fetch is
  // blocked or the page is JS-only.
  const context = resolved.text
    ? `${WEB_PROMPT}\n\nURL: ${url}\n\nThe page summarises itself as:\n${resolved.text}`
    : `${WEB_PROMPT}\n\nURL: ${url}`;

  return {
    contents: [{ role: "user", parts: [{ text: context }] }],
    generationConfig,
    tools: [{ url_context: {} }],
  };
}

/** Human-readable platform name from a URL, for prompt context. */
function platformLabel(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
  if (host.endsWith("tiktok.com")) return "TikTok post";
  if (host.endsWith("instagram.com")) return "Instagram post";
  if (host.endsWith("twitter.com") || host.endsWith("x.com")) return "X post";
  if (host.endsWith("threads.net") || host.endsWith("threads.com")) return "Threads post";
  if (host.endsWith("facebook.com")) return "Facebook post";
  if (host.endsWith("tumblr.com")) return "Tumblr post";
  if (host.endsWith("reddit.com")) return "Reddit post";
  return host ? `post from ${host}` : "";
}

function extractText(data: unknown): string {
  const parts = (data as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p: any) => typeof p?.text === "string" && p.thought !== true)
    .map((p: any) => p.text)
    .join("")
    .trim();
}

export async function digestLinkWithGemini(
  url: string,
  resolved: ResolvedLinkMetadata,
  lyrics: string | null,
): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(resolved, url, lyrics)),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const text = extractText(data);
    return text || null;
  } catch {
    return null;
  }
}
