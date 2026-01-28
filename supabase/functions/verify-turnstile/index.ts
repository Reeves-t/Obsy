// Supabase Edge Function: verify-turnstile
// Verifies Cloudflare Turnstile tokens for bot protection on signup
// 
// Setup:
// 1. Create Turnstile widget at https://dash.cloudflare.com/turnstile
// 2. Add TURNSTILE_SECRET_KEY to Supabase Edge Function secrets
// 3. Add site key to app config

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TurnstileResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    "error-codes"?: string[];
    action?: string;
    cdata?: string;
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { token } = await req.json();

        if (!token) {
            return new Response(
                JSON.stringify({ success: false, error: "Missing turnstile token" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
        if (!secretKey) {
            console.error("TURNSTILE_SECRET_KEY not configured");
            // In development, allow requests without verification
            if (Deno.env.get("ENVIRONMENT") === "development") {
                return new Response(
                    JSON.stringify({ success: true, message: "Skipped in development" }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            return new Response(
                JSON.stringify({ success: false, error: "Bot protection not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Verify with Cloudflare
        const formData = new FormData();
        formData.append("secret", secretKey);
        formData.append("response", token);

        const verifyResponse = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                body: formData,
            }
        );

        const result: TurnstileResponse = await verifyResponse.json();

        if (result.success) {
            return new Response(
                JSON.stringify({ success: true }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        } else {
            console.warn("Turnstile verification failed:", result["error-codes"]);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Bot verification failed",
                    codes: result["error-codes"],
                }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

    } catch (error) {
        console.error("Turnstile verification error:", error);
        return new Response(
            JSON.stringify({ success: false, error: "Verification error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
