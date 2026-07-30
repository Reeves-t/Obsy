-- Shared Media Verse — friends + exploration surfaces for shared-link entries.
--
-- Design contract (decided in OBS shared-links board expansion):
--   * A published post carries the LINK ONLY. Mood, note, and timestamp never
--     leave the author's wall. This is structural, not conventional: clients
--     cannot INSERT into shared_media_posts at all — publishing goes through
--     `publish_shared_media()`, which copies an explicit column list off the
--     author's own entry. There is no code path where a note or mood can ride along.
--   * Exploration is ANONYMOUS. Exploration rows are not readable through RLS by
--     anyone but the author and their friends; strangers reach them only via
--     `get_exploration_feed()`, which never selects author_id. Anonymity therefore
--     survives someone querying PostgREST directly, not just the UI.
--   * Propagation authority resolves to the ORIGIN post, one hop, at any chain
--     depth. A→B→C asks A, never B.
--   * Revocation is KEEP-AND-FREEZE. Sealing or revoking stops future movement and
--     never reaches into a wall someone already curated. This falls out for free:
--     a save materialises as the saver's OWN entries row, so it is already
--     independent of the origin post's later state.
--   * No public metrics. Reach counts are visible only to the author, via
--     `get_my_reach()`, and only above a floor so they can't be used to
--     triangulate individuals in a small user base.
--
-- Deliberately NOT here: a moderation stack (reports/blocks/takedown). Exploration
-- is scoped to friends-of-friends for exactly that reason — see
-- `get_exploration_feed()`.

-- ============================================================================
-- 1. CONSENT FLAGS
-- ============================================================================

-- Outbound: "my links may leave my wall." The understanding gate. Default OFF —
-- nothing is ever published without an explicit, informed opt-in.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS share_links_outbound boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings.share_links_outbound IS
'Outbound consent gate. Must be true for publish_shared_media() to create any post. Default false.';

-- Inbound: "show me the exploration board." Default OFF; flipped when the user
-- passes the explainer gate.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS explore_inbound boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_settings.explore_inbound IS
'Inbound consent gate for the exploration board. get_exploration_feed() returns nothing while false.';

-- ============================================================================
-- 2. WALL-LEVEL LINK STATE ON entries
-- ============================================================================

-- Seal = "this stays on my wall." Blocks publication outright. Note the wording:
-- a seal governs THIS user's participation, not the URL — someone else who
-- independently saves the same link can still publish it. UI copy must say
-- "stays on your wall", never "keeps this private".
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_media_sealed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entries.shared_media_sealed IS
'Wall-level lock for a shared_link entry: publish_shared_media() refuses to publish it. Distinct from tldraw canvas Pin, which is local board state and never reaches the server.';

-- Lineage for links saved from someone else. Determines whose allow_propagation
-- governs an onward share. Untyped uuid (no FK) to keep the hot `entries` table
-- decoupled from shared_media_posts, following the habit_goals.linked_topic_id
-- precedent.
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS shared_media_origin_post_id uuid;

COMMENT ON COLUMN public.entries.shared_media_origin_post_id IS
'Origin post this entry was saved from (NULL when the user found the link themselves). Onward-share permission resolves to this post''s author.';

-- ============================================================================
-- 3. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shared_media_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- NULL = this author is the origin. Otherwise always the TRUE origin: the
    -- publish RPC flattens the chain, so this is never a mid-chain parent.
    origin_post_id uuid REFERENCES public.shared_media_posts(id) ON DELETE SET NULL,

    canonical_url text NOT NULL,
    -- Dedupe key for exploration: one card per URL, not one per sharer.
    -- md5 is a content key, not a security primitive — no pgcrypto dependency.
    canonical_url_hash text GENERATED ALWAYS AS (md5(canonical_url)) STORED,

    platform text,
    media_type text,
    title text,
    thumbnail_url text,
    digest text,

    -- NO mood. NO note. NO entries reference. See the header contract.

    visibility text NOT NULL DEFAULT 'friends'
        CHECK (visibility IN ('friends', 'exploration')),

    -- May others who save this send it onward? Default on (cold-start), per-link off.
    allow_propagation boolean NOT NULL DEFAULT true,

    -- Withdrawn by the author: hidden from every surface, blocks new saves and
    -- new onward shares. Never cascades into walls that already saved it.
    sealed boolean NOT NULL DEFAULT false,

    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.shared_media_posts IS
'Copy-on-share publication of a shared-link entry. Link payload only — never mood or note. Written exclusively by publish_shared_media().';

CREATE INDEX IF NOT EXISTS idx_shared_media_posts_author
    ON public.shared_media_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_media_posts_origin
    ON public.shared_media_posts(origin_post_id);
-- Drives the exploration dedupe scan.
CREATE INDEX IF NOT EXISTS idx_shared_media_posts_exploration
    ON public.shared_media_posts(canonical_url_hash, created_at)
    WHERE visibility = 'exploration' AND sealed = false;

-- Records the act of saving: powers reach counts and lineage. The saver's actual
-- wall copy is their own `entries` row, which is why revocation can't touch it.
CREATE TABLE IF NOT EXISTS public.shared_media_saves (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id uuid NOT NULL REFERENCES public.shared_media_posts(id) ON DELETE CASCADE,
    origin_post_id uuid NOT NULL REFERENCES public.shared_media_posts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_media_saves_origin
    ON public.shared_media_saves(origin_post_id);
CREATE INDEX IF NOT EXISTS idx_shared_media_saves_user
    ON public.shared_media_saves(user_id, created_at DESC);

-- The hidden categorisation layer that drives recommendation. Kept in its own
-- table with zero grants and zero policies so no client-facing view, join, or
-- future RLS mistake can expose it. Service role only.
CREATE TABLE IF NOT EXISTS public.shared_media_taxonomy (
    post_id uuid PRIMARY KEY REFERENCES public.shared_media_posts(id) ON DELETE CASCADE,
    categories text[] NOT NULL DEFAULT '{}',
    affinity jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at timestamptz
);

COMMENT ON TABLE public.shared_media_taxonomy IS
'Server-side categorisation of published links. Never exposed to clients: RLS on with no policies, and all grants revoked. Populated by the service role.';

-- ============================================================================
-- 4. URL CANONICALISATION
-- ============================================================================

-- Normalises a link so the same content shared by different people collapses to
-- one exploration card. Lives in SQL rather than the client because publish reads
-- the URL off the entry — a client-supplied canonical form could be used to
-- misattribute a card to the wrong link.
--
-- Deliberately a DROP list, not a keep list: an allowlist of query params would
-- silently break every site whose parameters we didn't anticipate.
CREATE OR REPLACE FUNCTION public.canonicalize_link_url(p_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    -- Tracking and session noise. `si` is Spotify/YouTube share attribution;
    -- `t` is a video timestamp, which is a position, not a different video.
    c_drop CONSTANT text[] := ARRAY[
        'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'igsh', 'si', 't',
        'ref', 'ref_src', 'ref_url', 'referrer', 'source', 'share_id',
        'feature', 'spm', 'mc_cid', 'mc_eid', 'yclid', '_branch_match_id',
        '__twitter_impression', 'is_from_webapp', 'sender_device', 'web_id'
    ];
    v text;
    v_body text;
    v_query text;
    v_host text;
    v_path text;
    v_param text;
    v_key text;
    v_kept text[] := '{}';
BEGIN
    v := btrim(COALESCE(p_url, ''));
    IF v = '' THEN
        RETURN NULL;
    END IF;

    v := regexp_replace(v, '#.*$', '');                 -- fragment
    v := regexp_replace(v, '^https?://', '', 'i');      -- scheme
    v := regexp_replace(v, '^www\.', '', 'i');          -- www

    v_query := substring(v from '\?(.*)$');
    v_body  := regexp_replace(v, '\?.*$', '');

    v_host := lower(split_part(v_body, '/', 1));
    v_path := COALESCE(substring(v_body from '^[^/]*(/.*)$'), '');
    v_path := regexp_replace(v_path, '/+$', '');        -- trailing slash

    -- Short forms resolve to their canonical host so the two spellings of the
    -- same video collapse together.
    IF v_host = 'youtu.be' AND v_path <> '' THEN
        v_query := 'v=' || ltrim(v_path, '/')
                   || CASE WHEN v_query IS NULL THEN '' ELSE '&' || v_query END;
        v_host := 'youtube.com';
        v_path := '/watch';
    ELSIF v_host IN ('m.youtube.com', 'music.youtube.com') THEN
        v_host := 'youtube.com';
    ELSIF v_host = 'mobile.twitter.com' OR v_host = 'twitter.com' THEN
        v_host := 'x.com';
    ELSIF v_host IN ('old.reddit.com', 'np.reddit.com', 'm.reddit.com') THEN
        v_host := 'reddit.com';
    END IF;

    IF v_query IS NOT NULL AND v_query <> '' THEN
        FOREACH v_param IN ARRAY string_to_array(v_query, '&') LOOP
            v_key := lower(split_part(v_param, '=', 1));
            IF v_param <> ''
               AND v_key <> ''
               AND NOT (v_key = ANY (c_drop))
               AND v_key NOT LIKE 'utm\_%' THEN
                v_kept := array_append(v_kept, v_param);
            END IF;
        END LOOP;
    END IF;

    -- Scheme is re-attached (always https) so the canonical form stays a working
    -- URL: it is handed to savers as the link they open, not just a dedupe key.
    -- http and https collapse to one card, which is the intent.
    IF array_length(v_kept, 1) IS NOT NULL THEN
        -- Sorted so parameter order can't fork the dedupe key.
        SELECT array_agg(q ORDER BY q) INTO v_kept FROM unnest(v_kept) AS q;
        RETURN 'https://' || v_host || v_path || '?' || array_to_string(v_kept, '&');
    END IF;

    RETURN 'https://' || v_host || v_path;
END;
$$;

-- ============================================================================
-- 5. SOCIAL REACH HELPERS
-- ============================================================================

-- SECURITY DEFINER so reading `friends` here can't re-enter friends RLS
-- (see 20251203_fix_rls_recursion.sql for why that matters in this schema).
CREATE OR REPLACE FUNCTION public.is_friend_of(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.friends
        WHERE user_id = auth.uid() AND friend_id = p_other
    );
$$;

-- Friends-of-friends. This is the scope of the exploration board in v1, and it
-- is the single line that keeps this feature out of UGC-moderation territory:
-- content only ever reaches people within two hops of the author. Widening to
-- global requires reports, blocks, and a takedown path first.
CREATE OR REPLACE FUNCTION public.is_within_social_reach(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_other = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.friends
            WHERE user_id = auth.uid() AND friend_id = p_other
        )
        OR EXISTS (
            SELECT 1
            FROM public.friends f1
            JOIN public.friends f2 ON f2.user_id = f1.friend_id
            WHERE f1.user_id = auth.uid() AND f2.friend_id = p_other
        );
$$;

-- ============================================================================
-- 6. RLS
-- ============================================================================

ALTER TABLE public.shared_media_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_media_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_media_taxonomy ENABLE ROW LEVEL SECURITY;

-- Taxonomy: no policies, no grants. Deny-all by construction.
REVOKE ALL ON public.shared_media_taxonomy FROM anon, authenticated;

-- Posts are readable by the author and by their friends (attribution is fine
-- inside a relationship). Exploration readers are NOT covered here on purpose —
-- they go through get_exploration_feed(), which strips the author.
DROP POLICY IF EXISTS "Shared media posts readable by author and friends" ON public.shared_media_posts;
CREATE POLICY "Shared media posts readable by author and friends"
    ON public.shared_media_posts FOR SELECT
    TO authenticated
    USING (author_id = auth.uid() OR public.is_friend_of(author_id));

-- No INSERT policy: publishing is only possible through publish_shared_media().
REVOKE INSERT ON public.shared_media_posts FROM anon, authenticated;

DROP POLICY IF EXISTS "Shared media posts updatable by author" ON public.shared_media_posts;
CREATE POLICY "Shared media posts updatable by author"
    ON public.shared_media_posts FOR UPDATE
    TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Shared media posts deletable by author" ON public.shared_media_posts;
CREATE POLICY "Shared media posts deletable by author"
    ON public.shared_media_posts FOR DELETE
    TO authenticated
    USING (author_id = auth.uid());

-- Saves are private to the saver. Authors learn reach through get_my_reach(),
-- which returns counts and never identities — that's what keeps saving anonymous.
DROP POLICY IF EXISTS "Shared media saves readable by saver" ON public.shared_media_saves;
CREATE POLICY "Shared media saves readable by saver"
    ON public.shared_media_saves FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Shared media saves deletable by saver" ON public.shared_media_saves;
CREATE POLICY "Shared media saves deletable by saver"
    ON public.shared_media_saves FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Writing a save goes through save_shared_media() so visibility and seal state
-- are checked against posts the caller may not be able to SELECT.
REVOKE INSERT ON public.shared_media_saves FROM anon, authenticated;

-- ============================================================================
-- 7. MUTATION GUARD ON POSTS
-- ============================================================================

-- Only the three author-controlled switches may change after publication.
-- Identity, lineage and payload are frozen — otherwise an author could edit a
-- post that others have already saved out from under them.
CREATE OR REPLACE FUNCTION public.enforce_shared_media_post_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_outbound boolean;
BEGIN
    IF NEW.author_id IS DISTINCT FROM OLD.author_id
       OR NEW.canonical_url IS DISTINCT FROM OLD.canonical_url
       OR NEW.origin_post_id IS DISTINCT FROM OLD.origin_post_id
       OR NEW.platform IS DISTINCT FROM OLD.platform
       OR NEW.media_type IS DISTINCT FROM OLD.media_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
       OR NEW.digest IS DISTINCT FROM OLD.digest
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'shared_media: only visibility, allow_propagation and sealed may change after publication';
    END IF;

    -- Escalating to exploration is a fresh act of publication, so it re-checks
    -- outbound consent. Sealing and revoking are always allowed — a protective
    -- action must never be blocked by a consent flag the user just turned off.
    IF NEW.visibility = 'exploration' AND OLD.visibility IS DISTINCT FROM 'exploration' THEN
        SELECT COALESCE(share_links_outbound, false) INTO v_outbound
        FROM public.user_settings WHERE user_id = NEW.author_id;

        IF NOT COALESCE(v_outbound, false) THEN
            RAISE EXCEPTION 'shared_media: outbound sharing is off for this account';
        END IF;

        IF NEW.sealed OR OLD.sealed THEN
            RAISE EXCEPTION 'shared_media: a sealed post cannot be sent to exploration';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_shared_media_post_update_trigger ON public.shared_media_posts;
CREATE TRIGGER enforce_shared_media_post_update_trigger
    BEFORE UPDATE ON public.shared_media_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_shared_media_post_update();

-- ============================================================================
-- 8. PUBLISH
-- ============================================================================

-- Publishes one of the caller's own shared_link entries.
--
-- The payload is read off the entry by an explicit column list — the client
-- supplies only an entry id and two switches. That is what makes "mood and note
-- never leave your wall" a structural guarantee rather than a promise.
CREATE OR REPLACE FUNCTION public.publish_shared_media(
    p_entry_id uuid,
    p_visibility text DEFAULT 'friends',
    p_allow_propagation boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_entry public.entries;
    v_origin public.shared_media_posts;
    v_outbound boolean;
    v_post_id uuid;
    v_canonical text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'shared_media: not authenticated';
    END IF;

    IF p_visibility NOT IN ('friends', 'exploration') THEN
        RAISE EXCEPTION 'shared_media: visibility must be friends or exploration';
    END IF;

    SELECT COALESCE(share_links_outbound, false) INTO v_outbound
    FROM public.user_settings WHERE user_id = v_uid;

    IF NOT COALESCE(v_outbound, false) THEN
        RAISE EXCEPTION 'shared_media: outbound sharing is off for this account';
    END IF;

    SELECT * INTO v_entry FROM public.entries
    WHERE id = p_entry_id AND user_id = v_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'shared_media: entry not found';
    END IF;
    IF v_entry.source_type IS DISTINCT FROM 'shared_link' OR v_entry.shared_link_url IS NULL THEN
        RAISE EXCEPTION 'shared_media: entry is not a shared link';
    END IF;
    IF v_entry.shared_media_sealed THEN
        RAISE EXCEPTION 'shared_media: this link is sealed to your wall';
    END IF;

    -- Onward share: authority is the origin author's, and it is checked here
    -- rather than on the client because a toggle read in JS is not a permission.
    IF v_entry.shared_media_origin_post_id IS NOT NULL THEN
        SELECT * INTO v_origin FROM public.shared_media_posts
        WHERE id = v_entry.shared_media_origin_post_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'shared_media: origin post no longer exists';
        END IF;
        IF v_origin.sealed THEN
            RAISE EXCEPTION 'shared_media: the original sharer has sealed this link';
        END IF;
        IF NOT v_origin.allow_propagation THEN
            RAISE EXCEPTION 'shared_media: the original sharer has not allowed onward sharing';
        END IF;

        -- Flatten: a chain of any depth still answers to the first author.
        v_origin.id := COALESCE(v_origin.origin_post_id, v_origin.id);
    END IF;

    v_canonical := public.canonicalize_link_url(v_entry.shared_link_url);
    IF v_canonical IS NULL THEN
        RAISE EXCEPTION 'shared_media: link URL could not be canonicalised';
    END IF;

    -- Republishing the same link at the same visibility is a no-op rather than
    -- an error, so a double tap can't spawn duplicate cards.
    SELECT id INTO v_post_id FROM public.shared_media_posts
    WHERE author_id = v_uid
      AND canonical_url = v_canonical
      AND visibility = p_visibility
      AND sealed = false
    LIMIT 1;

    IF v_post_id IS NOT NULL THEN
        RETURN v_post_id;
    END IF;

    INSERT INTO public.shared_media_posts (
        author_id, origin_post_id, canonical_url, platform, media_type,
        title, thumbnail_url, digest, visibility, allow_propagation
    ) VALUES (
        v_uid,
        v_origin.id,
        v_canonical,
        v_entry.shared_link_platform,
        v_entry.shared_link_media_type,
        v_entry.shared_link_title,
        v_entry.shared_link_thumbnail_url,
        v_entry.shared_link_digest,
        p_visibility,
        p_allow_propagation
    )
    RETURNING id INTO v_post_id;

    RETURN v_post_id;
END;
$$;

-- ============================================================================
-- 9. SAVE
-- ============================================================================

-- Records a save and hands back the link payload so the caller can create their
-- own entry from it. Two steps on purpose: the save row is what the origin
-- author's reach count is built from, and the entry is the saver's own private
-- copy — independent from the moment it exists, which is what makes
-- keep-and-freeze automatic.
CREATE OR REPLACE FUNCTION public.save_shared_media(p_post_id uuid)
RETURNS TABLE (
    post_id uuid,
    origin_post_id uuid,
    canonical_url text,
    platform text,
    media_type text,
    title text,
    thumbnail_url text,
    digest text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- This function's OUT parameters (post_id, origin_post_id) share names with the
-- columns of shared_media_saves, which makes the ON CONFLICT inference clause
-- below ambiguous. Column names win.
#variable_conflict use_column
DECLARE
    v_uid uuid := auth.uid();
    v_post public.shared_media_posts;
    v_origin_id uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'shared_media: not authenticated';
    END IF;

    SELECT * INTO v_post FROM public.shared_media_posts WHERE id = p_post_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'shared_media: post not found';
    END IF;
    IF v_post.sealed THEN
        RAISE EXCEPTION 'shared_media: this post has been withdrawn';
    END IF;
    IF v_post.author_id = v_uid THEN
        RAISE EXCEPTION 'shared_media: this is already your link';
    END IF;

    -- Friends' posts are visible either way; exploration posts are only
    -- reachable within social reach.
    IF NOT (
        public.is_friend_of(v_post.author_id)
        OR (v_post.visibility = 'exploration' AND public.is_within_social_reach(v_post.author_id))
    ) THEN
        RAISE EXCEPTION 'shared_media: post not available to you';
    END IF;

    v_origin_id := COALESCE(v_post.origin_post_id, v_post.id);

    INSERT INTO public.shared_media_saves (user_id, post_id, origin_post_id)
    VALUES (v_uid, v_post.id, v_origin_id)
    ON CONFLICT (user_id, post_id) DO NOTHING;

    RETURN QUERY
    SELECT v_post.id, v_origin_id, v_post.canonical_url, v_post.platform,
           v_post.media_type, v_post.title, v_post.thumbnail_url, v_post.digest;
END;
$$;

-- ============================================================================
-- 10. EXPLORATION FEED
-- ============================================================================

-- Anonymous, deduped, bounded.
--
--   anonymous — author_id is never in the result, and exploration rows aren't
--               RLS-readable, so this is the only way to reach them.
--   deduped   — one card per canonical URL. Twelve people saving the same video
--               is one card, which is most of the difference between a curated
--               wall and a feed.
--   bounded   — a date-seeded ordering plus a hard cap. The set is stable for the
--               day and rearranges tomorrow. There is no cursor, so this endpoint
--               cannot be turned into an infinite scroll.
--
-- No counts are returned, by design: visible metrics are what turn a wall into a
-- leaderboard.
CREATE OR REPLACE FUNCTION public.get_exploration_feed(p_limit integer DEFAULT 24)
RETURNS TABLE (
    post_id uuid,
    canonical_url text,
    platform text,
    media_type text,
    title text,
    thumbnail_url text,
    digest text,
    allow_propagation boolean,
    first_shared_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_inbound boolean;
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(explore_inbound, false) INTO v_inbound
    FROM public.user_settings WHERE user_id = v_uid;

    IF NOT COALESCE(v_inbound, false) THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH visible AS (
        SELECT p.*
        FROM public.shared_media_posts p
        WHERE p.visibility = 'exploration'
          AND p.sealed = false
          AND p.author_id <> v_uid
          AND public.is_within_social_reach(p.author_id)
          -- Already on my wall, in any form — don't show it back to me.
          AND NOT EXISTS (
              SELECT 1
              FROM public.shared_media_saves s
              JOIN public.shared_media_posts sp ON sp.id = s.post_id
              WHERE s.user_id = v_uid
                AND sp.canonical_url_hash = p.canonical_url_hash
          )
          -- Or already saved under its own steam, before any of this existed.
          -- Narrowed by entries_source_type_idx (user_id, source_type) so the
          -- per-row canonicalise only runs over this user's link entries.
          AND NOT EXISTS (
              SELECT 1 FROM public.entries e
              WHERE e.user_id = v_uid
                AND e.source_type = 'shared_link'
                AND e.shared_link_url IS NOT NULL
                AND public.canonicalize_link_url(e.shared_link_url) = p.canonical_url
          )
    ),
    ranked AS (
        SELECT v.*,
               ROW_NUMBER() OVER (
                   PARTITION BY v.canonical_url_hash
                   ORDER BY v.created_at ASC, v.id ASC
               ) AS rn
        FROM visible v
    )
    SELECT r.id, r.canonical_url, r.platform, r.media_type, r.title,
           r.thumbnail_url, r.digest, r.allow_propagation, r.created_at
    FROM ranked r
    WHERE r.rn = 1
    ORDER BY md5(r.canonical_url_hash || to_char(current_date, 'YYYY-MM-DD'))
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 60));
END;
$$;

-- ============================================================================
-- 11. PRIVATE REACH
-- ============================================================================

-- "Your content moved people" — counts only, only your own posts, and only above
-- a floor. The floor exists because in a small user base a count of 1 alongside a
-- single known share is enough to identify who saved it.
--
-- Saves are counted; views are not, and there is deliberately no view to count.
-- A save is someone putting the link on their own wall, which is effortful and
-- real. Impressions are noise, and displaying them is the first step toward a feed.
CREATE OR REPLACE FUNCTION public.get_my_reach(p_floor integer DEFAULT 5)
RETURNS TABLE (
    post_id uuid,
    canonical_url text,
    title text,
    visibility text,
    saves bigint,
    onward_shares bigint,
    below_floor boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_floor integer := GREATEST(0, COALESCE(p_floor, 5));
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH mine AS (
        SELECT p.id, p.canonical_url, p.title, p.visibility
        FROM public.shared_media_posts p
        WHERE p.author_id = v_uid AND p.origin_post_id IS NULL
    ),
    tallied AS (
        SELECT m.id, m.canonical_url, m.title, m.visibility,
               (SELECT count(*) FROM public.shared_media_saves s
                 WHERE s.origin_post_id = m.id) AS saves,
               (SELECT count(*) FROM public.shared_media_posts d
                 WHERE d.origin_post_id = m.id AND d.author_id <> v_uid) AS onward
        FROM mine m
    )
    SELECT t.id, t.canonical_url, t.title, t.visibility,
           CASE WHEN (t.saves + t.onward) < v_floor THEN 0::bigint ELSE t.saves END,
           CASE WHEN (t.saves + t.onward) < v_floor THEN 0::bigint ELSE t.onward END,
           (t.saves + t.onward) < v_floor
    FROM tallied t
    ORDER BY (t.saves + t.onward) DESC, t.canonical_url;
END;
$$;

-- ============================================================================
-- 12. GRANTS
-- ============================================================================

-- Granted explicitly rather than leaning on Supabase's default privileges plus
-- the REVOKEs above: if defaults ever differ, the intended matrix still holds.
-- Note what is absent — INSERT on either table. Publishing and saving are only
-- reachable through the RPCs.
GRANT SELECT, UPDATE, DELETE ON public.shared_media_posts TO authenticated;
GRANT SELECT, DELETE ON public.shared_media_saves TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_friend_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_social_reach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_shared_media(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_shared_media(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exploration_feed(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_reach(integer) TO authenticated;
