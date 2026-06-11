-- OBS-15 (parent OBS-10 / audit OBS-7): restrict the over-broad profiles SELECT.
--
-- 20251201_create_base_schema.sql created "Users can view all profiles" as
-- FOR SELECT USING (true) (lines 19-21), making every user's profile
-- world-readable to any authenticated (and, with the old voice/anon grants, any)
-- caller. The deferral note in 20260610_enable_topic_rls.sql (lines 9-11) flagged
-- this as a separate, integration-tested follow-up because of its blast radius
-- across the friends / invite / albums cross-user reads. This migration closes it.
--
-- New SELECT surface for `profiles`:
--   * self            -> "Users can view their own profile" (added here). The
--                        pre-existing friend policy does NOT cover your own row,
--                        so without this, own-profile reads (services/profile.ts)
--                        would break.
--   * friends         -> "Users can view friend profiles" (already present from
--                        20251205_friends_table.sql) — kept as-is.
-- All other cross-user reads were pre-relationship lookups (you are NOT yet
-- friends): friend-code discovery, add-by-id, and invite preview. RLS cannot
-- authorise those per-row, so they move to SECURITY DEFINER functions below that
-- return only minimal, intentionally-shareable identity fields for an EXACT key
-- (uuid or 8-char code) the caller already possesses.
--
-- Albums are descoped for MVP (OBS-11); album-scoped cross-user profile reads
-- (album members/creators/authors) are intentionally NOT re-granted here.

-- ── Tighten the table SELECT policy ────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

-- "Users can view friend profiles" (id IN my friends) remains from
-- 20251205_friends_table.sql and is additive with the self policy above.

-- ── SECURITY DEFINER lookups for pre-friendship discovery ──────────────────
-- Exact-match only, minimal fields (id, full_name, avatar_url). No enumeration:
-- the caller must already hold the exact uuid (from an invite link) or the exact
-- 8-char friend code.

CREATE OR REPLACE FUNCTION public.get_profile_for_friending_by_id(target_id uuid)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p.full_name, p.avatar_url
    FROM public.profiles p
    WHERE p.id = target_id;
$$;

CREATE OR REPLACE FUNCTION public.get_profile_for_friending_by_code(target_code text)
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p.full_name, p.avatar_url
    FROM public.profiles p
    WHERE p.friend_code = upper(target_code);
$$;

-- Lock down execution. SECURITY DEFINER funcs default to EXECUTE for PUBLIC;
-- revoke that and grant explicitly.
REVOKE EXECUTE ON FUNCTION public.get_profile_for_friending_by_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile_for_friending_by_code(text) FROM PUBLIC;

-- by-id is used by the invite-preview screen, which may render before sign-in,
-- so allow anon + authenticated. It only returns minimal identity for an exact
-- uuid the caller already holds.
GRANT EXECUTE ON FUNCTION public.get_profile_for_friending_by_id(uuid) TO anon, authenticated;
-- by-code (add-a-friend) is always a signed-in action.
GRANT EXECUTE ON FUNCTION public.get_profile_for_friending_by_code(text) TO authenticated;

COMMENT ON FUNCTION public.get_profile_for_friending_by_id(uuid) IS
'OBS-15: minimal profile lookup by exact id for invite preview / add-by-id, bypassing the relationship-scoped profiles SELECT RLS.';
COMMENT ON FUNCTION public.get_profile_for_friending_by_code(text) IS
'OBS-15: minimal profile lookup by exact friend code for add-by-code, bypassing the relationship-scoped profiles SELECT RLS.';
