// Shared types for the shared-link digestion pipeline.

export type LinkMediaType =
  | "article"
  | "post"
  | "video"
  | "music"
  | "playlist"
  | "podcast"
  | "social"
  | "link";

/** What the metadata resolver returns. All fields best-effort / nullable. */
export interface ResolvedLinkMetadata {
  mediaType: LinkMediaType;
  title: string | null;
  thumbnailUrl: string | null;
  /** Page/description text (og:description) — light context, used as a Gemini fallback. */
  description: string | null;
  /** Artist / channel / uploader, when resolvable. */
  author: string | null;
  /** Track name for music links (often == title, but kept distinct). */
  track: string | null;
  /**
   * The post's own words: TikTok/Instagram caption, tweet body, Reddit selftext.
   * This is the digest input for social posts — those platforms serve bot walls
   * to page fetches, so their caption is the only content we can read.
   */
  text: string | null;
  /**
   * True when `thumbnailUrl` points at a signed CDN URL that expires within days
   * (TikTok, Meta). Such URLs MUST be re-hosted rather than persisted verbatim.
   * Re-hosting happens for every thumbnail regardless; this flags the ones where
   * skipping it would visibly rot the card.
   */
  thumbnailExpires: boolean;
}

/** Final digest outcome written back to the entry row. */
export interface LinkDigestResult {
  digest: string | null;
  mediaType: LinkMediaType;
  title: string | null;
  thumbnailUrl: string | null;
}
