import { supabase } from "@/lib/supabase";

export const MAX_RECOMMENDATION_LENGTH = 1000;

/**
 * Submit a free-text recommendation / feature request from Settings.
 *
 * Persists to the owner-scoped `recommendations` table. Requires a signed-in
 * user — guests should be routed to sign-up before calling this.
 *
 * Throws `NOT_SIGNED_IN` when there is no authenticated user, or the underlying
 * Supabase error on insert failure.
 */
export async function submitRecommendation(message: string): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) throw new Error("EMPTY_MESSAGE");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("NOT_SIGNED_IN");

    const { error } = await (supabase as any)
        .from("recommendations")
        .insert({
            user_id: user.id,
            message: trimmed.slice(0, MAX_RECOMMENDATION_LENGTH),
        });

    if (error) throw error;
}
