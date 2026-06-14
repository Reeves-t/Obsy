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
}

/** Final digest outcome written back to the entry row. */
export interface LinkDigestResult {
  digest: string | null;
  mediaType: LinkMediaType;
  title: string | null;
  thumbnailUrl: string | null;
}
