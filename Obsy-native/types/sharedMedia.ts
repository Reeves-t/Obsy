/**
 * Shared Media Verse — client types.
 *
 * Mirrors the shapes returned by the RPCs in
 * `supabase/migrations/20260730000001_create_shared_media_verse.sql`.
 *
 * Note what is absent from every type here: mood, note, and (on exploration)
 * the author. That isn't an oversight in the client model — the database never
 * sends those fields, so there is nothing to type.
 */

/** Where a published link is visible. Sealing is separate — see `sealed`. */
export type SharedMediaVisibility = 'friends' | 'exploration';

/**
 * A link the signed-in user has published, or one published by a friend.
 * Friend-visible posts carry attribution; exploration cards never do.
 */
export interface SharedMediaPost {
    id: string;
    author_id: string;
    /** NULL when this author is the origin of the chain. */
    origin_post_id: string | null;
    canonical_url: string;
    platform: string | null;
    media_type: string | null;
    title: string | null;
    thumbnail_url: string | null;
    digest: string | null;
    visibility: SharedMediaVisibility;
    /** May people who save this send it onward? Author-controlled, default on. */
    allow_propagation: boolean;
    /** Withdrawn: hidden everywhere, blocks new saves. Never retracts existing ones. */
    sealed: boolean;
    created_at: string;
}

/** A friend's post joined with just enough profile to attribute it. */
export interface FriendWallPost extends SharedMediaPost {
    author_name: string | null;
    author_avatar_url: string | null;
}

/**
 * One exploration card. Deduped by URL across everyone who shared it, so
 * `post_id` is the representative (earliest) post — that's the one to save from.
 *
 * There is no author field and no save count, by design.
 */
export interface ExplorationCard {
    post_id: string;
    canonical_url: string;
    platform: string | null;
    media_type: string | null;
    title: string | null;
    thumbnail_url: string | null;
    digest: string | null;
    allow_propagation: boolean;
    first_shared_at: string;
}

/** The payload `save_shared_media` hands back so the saver can build their own entry. */
export interface SavedMediaPayload {
    post_id: string;
    origin_post_id: string;
    canonical_url: string;
    platform: string | null;
    media_type: string | null;
    title: string | null;
    thumbnail_url: string | null;
    digest: string | null;
}

/**
 * Private reach for one of the user's own posts. Counts only, never identities.
 * While `below_floor` is true the counts are zeroed server-side — don't render
 * them as a real zero, render "not yet".
 */
export interface SharedMediaReach {
    post_id: string;
    canonical_url: string;
    title: string | null;
    visibility: SharedMediaVisibility;
    saves: number;
    onward_shares: number;
    below_floor: boolean;
}

/** The two consent gates, held on `user_settings`. */
export interface SharedMediaConsent {
    /** "My links may leave my wall." Required to publish anything. */
    shareLinksOutbound: boolean;
    /** "Show me the exploration board." */
    exploreInbound: boolean;
}
