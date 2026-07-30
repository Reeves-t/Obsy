/**
 * Shared Media Verse — client service.
 *
 * Every mutation here is a thin call onto an RPC. That is deliberate: the rules
 * that matter (mood/note never leave a wall, exploration stays anonymous,
 * propagation answers to the origin author) are enforced by triggers, grants and
 * RLS in `20260730000001_create_shared_media_verse.sql`. Nothing in this file is
 * load-bearing for any of them — a client check is a nicety, not a permission.
 *
 * Rules are covered by `supabase/tests/shared_media_verse_test.sql`.
 */

import { supabase } from '@/lib/supabase';
import type {
    ExplorationCard,
    FriendWallPost,
    SavedMediaPayload,
    SharedMediaConsent,
    SharedMediaPost,
    SharedMediaReach,
    SharedMediaVisibility,
} from '@/types/sharedMedia';

// The RPCs raise with a `shared_media: <reason>` prefix. Surfacing the raw
// Postgres text to a user would be poor, so map the ones a user can actually
// trigger onto copy they can act on.
const ERROR_COPY: Array<{ match: string; message: string }> = [
    { match: 'outbound sharing is off', message: 'Turn on sharing for your links before sending this off.' },
    { match: 'sealed to your wall', message: 'This link is sealed. Unseal it first if you want to send it off.' },
    { match: 'has sealed this link', message: 'The person who shared this has since sealed it.' },
    { match: 'not allowed onward sharing', message: 'The original sharer hasn\'t allowed this one to travel further.' },
    { match: 'has been withdrawn', message: 'This link has been withdrawn.' },
    { match: 'already your link', message: 'This one is already on your wall.' },
    { match: 'not available to you', message: 'This link isn\'t available to you.' },
    { match: 'not a shared link', message: 'Only saved links can be shared.' },
];

export class SharedMediaError extends Error {
    readonly raw: string;
    constructor(raw: string) {
        super(ERROR_COPY.find(e => raw.includes(e.match))?.message ?? 'Something went wrong. Please try again.');
        this.name = 'SharedMediaError';
        this.raw = raw;
    }
}

function rethrow(error: { message: string } | null): void {
    if (error) throw new SharedMediaError(error.message);
}

async function requireUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('NOT_SIGNED_IN');
    return user.id;
}

// ─────────────────────────────────────────────────────────────
// Consent
// ─────────────────────────────────────────────────────────────

export async function fetchConsent(): Promise<SharedMediaConsent> {
    const userId = await requireUserId();
    const { data, error } = await (supabase as any)
        .from('user_settings')
        .select('share_links_outbound, explore_inbound')
        .eq('user_id', userId)
        .maybeSingle();
    rethrow(error);
    return {
        shareLinksOutbound: data?.share_links_outbound ?? false,
        exploreInbound: data?.explore_inbound ?? false,
    };
}

/**
 * The outbound gate — "my links may leave my wall". Off until the user passes
 * the explainer. Flipping it off later doesn't retract anything already
 * published; use {@link sealPost} for that.
 */
export async function setOutboundSharing(enabled: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('user_settings')
        .update({ share_links_outbound: enabled })
        .eq('user_id', userId);
    rethrow(error);
}

/** The inbound gate — the exploration board returns nothing until this is on. */
export async function setExploreInbound(enabled: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('user_settings')
        .update({ explore_inbound: enabled })
        .eq('user_id', userId);
    rethrow(error);
}

// ─────────────────────────────────────────────────────────────
// Wall-level link state
// ─────────────────────────────────────────────────────────────

/**
 * Seal — "this stays on my wall." Blocks publication server-side.
 *
 * Not the same thing as Pin, which is tldraw canvas state and never leaves the
 * device. And note the honest limit: a seal governs this user's participation,
 * not the URL. Someone who independently saves the same link can still publish
 * it, so UI copy must say "stays on your wall", never "keeps this private".
 */
export async function setEntrySealed(entryId: string, sealed: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('entries')
        .update({ shared_media_sealed: sealed })
        .eq('id', entryId)
        .eq('user_id', userId);
    rethrow(error);
}

/**
 * Records which post an entry was saved from, so an onward share can be checked
 * against the right author's permission.
 *
 * Separate call for now because `captureStore.createSharedLinkEntry` doesn't
 * carry lineage yet; folding this into that signature belongs with the UI work.
 */
export async function linkEntryToOrigin(entryId: string, originPostId: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('entries')
        .update({ shared_media_origin_post_id: originPostId })
        .eq('id', entryId)
        .eq('user_id', userId);
    rethrow(error);
}

// ─────────────────────────────────────────────────────────────
// Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Sends one of the user's own link entries off to friends or exploration.
 *
 * Only the entry id and the two switches cross the wire — the payload is read
 * off the entry inside the RPC. That's what makes "mood and note never leave
 * your wall" structural rather than something this file has to remember.
 *
 * Idempotent: publishing the same link at the same visibility returns the
 * existing post instead of creating a duplicate card.
 */
export async function publishSharedLink(
    entryId: string,
    visibility: SharedMediaVisibility = 'friends',
    allowPropagation = true,
): Promise<string> {
    const { data, error } = await (supabase as any).rpc('publish_shared_media', {
        p_entry_id: entryId,
        p_visibility: visibility,
        p_allow_propagation: allowPropagation,
    });
    rethrow(error);
    return data as string;
}

/** Per-link control over whether savers may send it onward. Default on. */
export async function setAllowPropagation(postId: string, allow: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('shared_media_posts')
        .update({ allow_propagation: allow })
        .eq('id', postId)
        .eq('author_id', userId);
    rethrow(error);
}

/**
 * Withdraws a published post: hidden from every surface, no new saves, no new
 * onward shares. Keep-and-freeze — walls that already saved it are untouched,
 * which is the promise the UI must make at the moment of sending.
 */
export async function sealPost(postId: string, sealed = true): Promise<void> {
    const userId = await requireUserId();
    const { error } = await (supabase as any)
        .from('shared_media_posts')
        .update({ sealed })
        .eq('id', postId)
        .eq('author_id', userId);
    rethrow(error);
}

// ─────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────

/** The user's own published posts, newest first. */
export async function fetchMyPosts(): Promise<SharedMediaPost[]> {
    const userId = await requireUserId();
    const { data, error } = await (supabase as any)
        .from('shared_media_posts')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });
    rethrow(error);
    return (data ?? []) as SharedMediaPost[];
}

/**
 * Friends' walls. Attribution is intact here — inside a relationship a name is
 * the point. RLS scopes this to friends on its own; the filter is just clarity.
 */
export async function fetchFriendsWall(limit = 60): Promise<FriendWallPost[]> {
    const userId = await requireUserId();
    const { data, error } = await (supabase as any)
        .from('shared_media_posts')
        .select('*, profiles:author_id (full_name, avatar_url)')
        .neq('author_id', userId)
        .eq('sealed', false)
        .order('created_at', { ascending: false })
        .limit(limit);
    rethrow(error);
    return ((data ?? []) as any[]).map(row => ({
        ...row,
        author_name: row.profiles?.full_name ?? null,
        author_avatar_url: row.profiles?.avatar_url ?? null,
    })) as FriendWallPost[];
}

/**
 * The exploration board: anonymous, deduped by URL, and bounded.
 *
 * There is no cursor and no page 2 — the RPC returns a set that is stable for
 * the day and rearranges tomorrow. That's deliberate, so don't wrap this in an
 * infinite scroll; it can't feed one.
 *
 * Returns empty while the inbound gate is off.
 */
export async function fetchExploration(limit = 24): Promise<ExplorationCard[]> {
    const { data, error } = await (supabase as any).rpc('get_exploration_feed', { p_limit: limit });
    rethrow(error);
    return (data ?? []) as ExplorationCard[];
}

/**
 * Records a save and returns the link payload.
 *
 * Two steps on purpose: this marks the save (which is what the origin author's
 * reach is built from) and hands back the fields, but the caller creates their
 * own entry from them — with their own mood attached. The link arrives stripped
 * and the saver re-moods it, which is also why their copy is independent of
 * whatever the origin author does later.
 *
 * Follow with `linkEntryToOrigin(newEntryId, payload.origin_post_id)`.
 */
export async function saveSharedMedia(postId: string): Promise<SavedMediaPayload> {
    const { data, error } = await (supabase as any).rpc('save_shared_media', { p_post_id: postId });
    rethrow(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new SharedMediaError('shared_media: post not found');
    return row as SavedMediaPayload;
}

/**
 * Private reach on the user's own posts — "your content moved people".
 *
 * Counts saves and onward shares; there is no view count and deliberately no
 * way to add one. Below the floor the server returns zeros with
 * `below_floor: true`, so a small user base can't be used to work out who saved
 * what. Render that state as "not yet", not as a zero.
 */
export async function fetchMyReach(floor = 5): Promise<SharedMediaReach[]> {
    const { data, error } = await (supabase as any).rpc('get_my_reach', { p_floor: floor });
    rethrow(error);
    return (data ?? []) as SharedMediaReach[];
}
