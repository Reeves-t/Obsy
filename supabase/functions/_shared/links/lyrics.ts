// Fetches plain lyrics for a song from LRCLIB (free, no API key).
// Used ONLY to feed Gemini for theme/tone distillation — the verbatim lyrics
// are never persisted (copyright). Returns null on any miss/failure.

const UA = "ObsyLinkBot/1.0 (+https://obsy.app)";

const MAX_LYRICS_CHARS = 6000; // plenty for theme extraction; bounds the prompt

export async function fetchLyrics(artist: string | null, track: string | null): Promise<string | null> {
  if (!artist || !track) return null;

  const params = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  const endpoint = `https://lrclib.net/api/get?${params.toString()}`;

  try {
    const res = await fetch(endpoint, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null; // 404 = no match

    const data = await res.json();
    const plain: unknown = data?.plainLyrics;
    if (typeof plain !== "string" || !plain.trim()) return null;

    return plain.trim().slice(0, MAX_LYRICS_CHARS);
  } catch {
    return null;
  }
}
