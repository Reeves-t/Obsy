// Digests a shared link's CONTENT with Gemini, picking a strategy by media type:
//   - video             → YouTube video ingestion (fileData)
//   - music             → distill themes/tone from lyrics, else from title+artist
//   - article/post/etc. → url_context (Gemini fetches & reads the page)
// Returns a short plain-text digest, or null on any failure (caller falls back).

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

  // Everything else (article/post/playlist/podcast/social/link) — read the page.
  return {
    contents: [{ role: "user", parts: [{ text: `${WEB_PROMPT}\n\nURL: ${url}` }] }],
    generationConfig,
    tools: [{ url_context: {} }],
  };
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
