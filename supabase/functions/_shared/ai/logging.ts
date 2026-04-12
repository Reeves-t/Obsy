import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { AiProviderRunLog } from "./types.ts";

export async function logAiProviderRun(entry: AiProviderRunLog): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      `[AI_ROUTER_LOG_SKIP] requestId=${entry.request_id} provider=${entry.provider} reason=missing_service_role_env`
    );
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.from("ai_provider_runs").insert(entry);
    if (error) {
      console.error(
        `[AI_ROUTER_LOG_ERROR] requestId=${entry.request_id} provider=${entry.provider} message=${error.message}`
      );
    }
  } catch (error: any) {
    console.error(
      `[AI_ROUTER_LOG_ERROR] requestId=${entry.request_id} provider=${entry.provider} message=${error?.message ?? "Unknown logging error"}`
    );
  }
}
