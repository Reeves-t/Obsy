\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- Helpers ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION t_ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF cond THEN RAISE NOTICE 'PASS  %', label;
    ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END; $$;

-- Asserts that `sql` raises, and that the message matches `frag`.
CREATE OR REPLACE FUNCTION t_raises(sql text, frag text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE m text;
BEGIN
    BEGIN
        EXECUTE sql;
        RAISE EXCEPTION 'FAIL  % (expected an error, got none)', label;
    EXCEPTION WHEN OTHERS THEN
        m := SQLERRM;
        IF m LIKE '%FAIL  %' THEN RAISE; END IF;
        IF position(frag in m) = 0 THEN
            RAISE EXCEPTION 'FAIL  % (wrong error: %)', label, m;
        END IF;
        RAISE NOTICE 'PASS  %', label;
    END;
END; $$;

-- Fixtures ───────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', 'a@t'),   -- A: origin author
 ('bbbbbbbb-0000-0000-0000-000000000002', 'b@t'),   -- B: friend of A
 ('cccccccc-0000-0000-0000-000000000003', 'c@t'),   -- C: friend of B (A's FoF)
 ('dddddddd-0000-0000-0000-000000000004', 'd@t');   -- D: unconnected stranger

INSERT INTO public.user_settings (user_id) SELECT id FROM auth.users;

-- Bidirectional friendship rows, as services/friends.ts writes them.
INSERT INTO public.friends (user_id, friend_id) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001'),
 ('bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003'),
 ('cccccccc-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000002');

-- A's link entry, carrying a mood and a note that must never travel.
INSERT INTO public.entries (id, user_id, note, mood_name_snapshot, source_type,
                            shared_link_url, shared_link_platform, shared_link_title,
                            shared_link_digest, shared_link_media_type)
VALUES ('e0000000-0000-0000-0000-0000000000a1',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'felt wrecked at 2am', 'Ashamed', 'shared_link',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x&si=abc',
        'YouTube', 'Never Gonna Give You Up', 'A pop song about commitment.', 'video');

\echo ''
\echo '── 1. URL canonicalisation ──────────────────────────────────────────'
SELECT t_ok(public.canonicalize_link_url('https://www.youtube.com/watch?v=abc&utm_source=news&si=xyz')
            = 'https://youtube.com/watch?v=abc', 'strips utm_/si, drops www');
SELECT t_ok(public.canonicalize_link_url('https://youtu.be/abc?t=30')
            = 'https://youtube.com/watch?v=abc', 'youtu.be collapses onto youtube.com/watch');
SELECT t_ok(public.canonicalize_link_url('http://example.com/a/b/')
            = 'https://example.com/a/b', 'http→https and trailing slash dropped');
SELECT t_ok(public.canonicalize_link_url('https://x.com/p?b=2&a=1')
            = public.canonicalize_link_url('https://x.com/p?a=1&b=2'), 'param order cannot fork the key');
SELECT t_ok(public.canonicalize_link_url('https://twitter.com/u/status/1')
            = 'https://x.com/u/status/1', 'twitter.com unifies to x.com');
SELECT t_ok(public.canonicalize_link_url('https://site.com/Path#frag')
            = 'https://site.com/Path', 'fragment dropped, path case kept');
SELECT t_ok(public.canonicalize_link_url('  ') IS NULL, 'blank input yields NULL');

\echo ''
\echo '── 2. Outbound consent gate ─────────────────────────────────────────'
SET ROLE authenticated;
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT t_raises(
  $$SELECT public.publish_shared_media('e0000000-0000-0000-0000-0000000000a1','friends',true)$$,
  'outbound sharing is off', 'publish refused while outbound consent is off');

RESET ROLE;
UPDATE public.user_settings SET share_links_outbound = true
 WHERE user_id IN ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
SET ROLE authenticated;

\echo ''
\echo '── 3. Publish strips mood and note ──────────────────────────────────'
SELECT public.publish_shared_media('e0000000-0000-0000-0000-0000000000a1','exploration',true) AS post_a \gset

SELECT t_ok((SELECT count(*) FROM public.shared_media_posts WHERE id = :'post_a') = 1,
            'post created');
SELECT t_ok((SELECT canonical_url FROM public.shared_media_posts WHERE id = :'post_a')
            = 'https://youtube.com/watch?v=dQw4w9WgXcQ',
            'stored URL is the canonical form, tracking params gone');
-- The strongest assertion available: no column anywhere in the published row
-- holds the mood or the note.
SELECT t_ok(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_media_posts'
      AND column_name IN ('mood_id','mood_name_snapshot','note','entry_id','source_entry_id')
), 'posts table has no mood/note/entry column at all');
SELECT t_ok((SELECT to_jsonb(p)::text FROM public.shared_media_posts p WHERE id = :'post_a')
            NOT LIKE '%wrecked%', 'note text absent from the published row');
SELECT t_ok((SELECT to_jsonb(p)::text FROM public.shared_media_posts p WHERE id = :'post_a')
            NOT LIKE '%Ashamed%', 'mood absent from the published row');

SELECT t_ok(public.publish_shared_media('e0000000-0000-0000-0000-0000000000a1','exploration',true) = :'post_a',
            'republishing the same link is idempotent, not a duplicate card');

\echo ''
\echo '── 4. Direct table writes are impossible ────────────────────────────'
SELECT t_raises(
  $$INSERT INTO public.shared_media_posts (author_id, canonical_url)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','https://evil.test')$$,
  'permission denied', 'client cannot INSERT a post directly');
SELECT t_raises(
  $$INSERT INTO public.shared_media_saves (user_id, post_id, origin_post_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001','$$ || :'post_a' || $$','$$ || :'post_a' || $$')$$,
  'permission denied', 'client cannot INSERT a save directly');
SELECT t_raises($$SELECT count(*) FROM public.shared_media_taxonomy$$,
  'permission denied', 'taxonomy is unreadable by clients');

\echo ''
\echo '── 5. Seal blocks publication ───────────────────────────────────────'
RESET ROLE;
INSERT INTO public.entries (id, user_id, source_type, shared_link_url, shared_media_sealed)
VALUES ('e0000000-0000-0000-0000-0000000000a2','aaaaaaaa-0000-0000-0000-000000000001',
        'shared_link','https://example.com/sealed', true);
SET ROLE authenticated;
SELECT t_raises(
  $$SELECT public.publish_shared_media('e0000000-0000-0000-0000-0000000000a2','friends',true)$$,
  'sealed to your wall', 'a sealed entry cannot be published');

\echo ''
\echo '── 6. Read scope: author, friend, stranger ──────────────────────────'
SELECT t_ok((SELECT count(*) FROM public.shared_media_posts) = 1, 'author sees own post');
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_ok((SELECT count(*) FROM public.shared_media_posts) = 1, 'friend sees it, with attribution');
SET test.uid = 'dddddddd-0000-0000-0000-000000000004';
SELECT t_ok((SELECT count(*) FROM public.shared_media_posts) = 0,
            'stranger cannot read the row — so cannot learn the author');

\echo ''
\echo '── 7. Exploration feed: gate, anonymity, scope ──────────────────────'
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 0,
            'feed is empty while inbound consent is off');
RESET ROLE;
UPDATE public.user_settings SET explore_inbound = true;
SET ROLE authenticated;
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 1, 'friend sees the card');
SELECT t_ok(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'get_exploration_feed' AND column_name LIKE '%author%'
), 'feed result exposes no author column');

SET test.uid = 'cccccccc-0000-0000-0000-000000000003';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 1,
            'friend-of-friend is within reach');
SET test.uid = 'dddddddd-0000-0000-0000-000000000004';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 0,
            'unconnected stranger is out of reach (no moderation surface)');
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 0,
            'author is not shown their own contribution');

\echo ''
\echo '── 8. Save, and the saver''s copy is independent ─────────────────────'
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT canonical_url AS saved_url, origin_post_id AS saved_origin
FROM public.save_shared_media(:'post_a') \gset
SELECT t_ok(:'saved_url' = 'https://youtube.com/watch?v=dQw4w9WgXcQ', 'save returns a usable URL');
SELECT t_ok(:'saved_origin' = :'post_a', 'origin resolves to A''s post');
SELECT t_ok((SELECT count(*) FROM public.shared_media_saves WHERE user_id = auth.uid()) = 1,
            'save recorded');

-- B materialises their own wall copy, carrying the lineage.
RESET ROLE;
INSERT INTO public.entries (id, user_id, source_type, shared_link_url, shared_media_origin_post_id)
VALUES ('e0000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002',
        'shared_link', :'saved_url', :'saved_origin');
SET ROLE authenticated;
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_ok((SELECT count(*) FROM public.get_exploration_feed()) = 0,
            'a card already on my wall stops being offered');

\echo ''
\echo '── 9. Onward propagation answers to the origin ──────────────────────'
SELECT public.publish_shared_media('e0000000-0000-0000-0000-0000000000b1','exploration',true) AS post_b \gset
SELECT t_ok((SELECT origin_post_id FROM public.shared_media_posts WHERE id = :'post_b') = :'post_a',
            'B''s onward post points at A as origin');

-- C saves from B, then publishes: authority must still resolve to A, not B.
SET test.uid = 'cccccccc-0000-0000-0000-000000000003';
SELECT origin_post_id AS c_origin FROM public.save_shared_media(:'post_b') \gset
SELECT t_ok(:'c_origin' = :'post_a', 'chain flattens — C answers to A, not B');

\echo ''
\echo '── 10. Revocation: forward-only, keep-and-freeze ────────────────────'
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.shared_media_posts SET allow_propagation = false WHERE id = :'post_a';

RESET ROLE;
UPDATE public.user_settings SET share_links_outbound = true
 WHERE user_id = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.entries (id, user_id, source_type, shared_link_url, shared_media_origin_post_id)
VALUES ('e0000000-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-000000000003',
        'shared_link','https://youtube.com/watch?v=dQw4w9WgXcQ', :'post_a');
SET ROLE authenticated;
SET test.uid = 'cccccccc-0000-0000-0000-000000000003';

SELECT t_raises(
  $$SELECT public.publish_shared_media('e0000000-0000-0000-0000-0000000000c1','exploration',true)$$,
  'not allowed onward sharing', 'revoking stops NEW onward shares');
SELECT t_ok((SELECT count(*) FROM public.entries
             WHERE id = 'e0000000-0000-0000-0000-0000000000b1') = 1,
            'B''s already-saved wall copy survives untouched (keep-and-freeze)');
SELECT t_ok((SELECT count(*) FROM public.shared_media_posts WHERE id = :'post_b') = 1,
            'B''s existing onward post is not retracted');

-- Sealing after the fact behaves the same way: forward-only.
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.shared_media_posts SET sealed = true WHERE id = :'post_a';
SET test.uid = 'dddddddd-0000-0000-0000-000000000004';
SELECT t_raises($$SELECT * FROM public.save_shared_media('$$ || :'post_a' || $$')$$,
  'withdrawn', 'a sealed post can no longer be saved');

\echo ''
\echo '── 11. Post mutation guard ──────────────────────────────────────────'
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT t_raises(
  $$UPDATE public.shared_media_posts SET title = 'rewritten' WHERE id = '$$ || :'post_a' || $$'$$,
  'only visibility, allow_propagation and sealed may change',
  'payload cannot be edited out from under people who saved it');
SELECT t_raises(
  $$UPDATE public.shared_media_posts SET canonical_url = 'https://evil.test' WHERE id = '$$ || :'post_a' || $$'$$,
  'only visibility, allow_propagation and sealed may change',
  'URL cannot be swapped after publication');
-- Pulling back to friends is always allowed; pushing back out while sealed is not.
UPDATE public.shared_media_posts SET visibility = 'friends' WHERE id = :'post_a';
SELECT t_ok((SELECT visibility FROM public.shared_media_posts WHERE id = :'post_a') = 'friends',
            'de-escalating to friends is unrestricted');
SELECT t_raises(
  $$UPDATE public.shared_media_posts SET visibility = 'exploration' WHERE id = '$$ || :'post_a' || $$'$$,
  'sealed post cannot be sent to exploration',
  'a sealed post cannot be escalated back to exploration');

-- Protective actions stay available even with consent switched off.
RESET ROLE;
UPDATE public.user_settings SET share_links_outbound = false
 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.shared_media_posts SET sealed = true WHERE id = :'post_a';
SELECT t_ok(true, 'sealing still works after outbound consent is turned off');

\echo ''
\echo '── 12. Private reach, with a floor ──────────────────────────────────'
SELECT saves AS r_saves, onward_shares AS r_onward, below_floor AS r_floor
FROM public.get_my_reach(5) WHERE post_id = :'post_a' \gset
SELECT t_ok(:'r_floor' = 't', 'below the floor, reach is withheld');
SELECT t_ok(:'r_saves' = '0' AND :'r_onward' = '0',
            'withheld counts are zeroed server-side, not just hidden by the client');

SELECT saves AS f_saves, onward_shares AS f_onward, below_floor AS f_floor
FROM public.get_my_reach(1) WHERE post_id = :'post_a' \gset
SELECT t_ok(:'f_floor' = 'f', 'above the floor, reach is shown');
SELECT t_ok(:'f_saves' = '2', 'counts B and C saves');
SELECT t_ok(:'f_onward' = '1', 'counts B''s onward share');

SET test.uid = 'dddddddd-0000-0000-0000-000000000004';
SELECT t_ok((SELECT count(*) FROM public.get_my_reach(1)) = 0,
            'reach only ever reports your own posts');

\echo ''
\echo '── 13. Saves stay private to the saver ──────────────────────────────'
SET test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT t_ok((SELECT count(*) FROM public.shared_media_saves) = 0,
            'the author cannot see WHO saved — only counts, so saving is anonymous');
SET test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_ok((SELECT count(*) FROM public.shared_media_saves) = 1, 'a saver sees their own saves');

RESET ROLE;
\echo ''
\echo 'ALL TESTS PASSED'
