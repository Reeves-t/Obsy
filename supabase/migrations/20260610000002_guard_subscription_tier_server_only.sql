-- OBS-17 Cluster B: make subscription_tier server-writable only.
--
-- Per OBS-7, the client could UPDATE user_settings.subscription_tier and
-- self-promote to a paid tier. Entitlement is now written exclusively by the
-- RevenueCat webhook (revenuecat-webhook edge function) using the service role.
--
-- A BEFORE UPDATE trigger is used (rather than a column GRANT revoke) because
-- Supabase grants table-level UPDATE to `authenticated`, which makes column-level
-- REVOKEs ineffective without enumerating every other column. The trigger blocks
-- any change to subscription_tier unless the caller is the service role, and
-- leaves all other user_settings updates (counts via SECURITY DEFINER RPCs, tone,
-- flags) and inserts untouched. No client code writes subscription_tier today.

CREATE OR REPLACE FUNCTION public.prevent_client_subscription_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       AND coalesce(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'subscription_tier is set server-side only (RevenueCat webhook)'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_subscription_tier_server_only ON public.user_settings;
CREATE TRIGGER enforce_subscription_tier_server_only
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_client_subscription_tier_change();
