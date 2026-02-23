import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETELL_BASE = "https://api.retellai.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const retellKey = Deno.env.get("RETELL_API_KEY");
    if (!retellKey) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const body = req.method === "POST" ? await req.json() : {};
    const mode = body.mode || "dry_run"; // "dry_run" or "delete"

    // 1. List all agents from Retell
    const retellRes = await fetch(`${RETELL_BASE}/list-agents`, {
      method: "GET",
      headers: { Authorization: `Bearer ${retellKey}` },
    });
    const retellAgents = await retellRes.json();
    if (!retellRes.ok) throw new Error(`Retell list-agents failed: ${JSON.stringify(retellAgents)}`);

    // 2. Get all retell_agent_ids from our DB
    const { data: specs, error: dbErr } = await db
      .from("agent_specs")
      .select("retell_agent_id")
      .not("retell_agent_id", "is", null);

    if (dbErr) throw new Error(`DB query failed: ${dbErr.message}`);

    const dbAgentIds = new Set((specs || []).map((s: any) => s.retell_agent_id));

    // 3. Find orphans
    const orphans = retellAgents.filter((ra: any) => !dbAgentIds.has(ra.agent_id));
    const kept = retellAgents.filter((ra: any) => dbAgentIds.has(ra.agent_id));

    console.log(`Found ${orphans.length} orphans out of ${retellAgents.length} total agents`);

    const results: Array<{ agent_id: string; agent_name: string; voice_id: string; status: string; error?: string }> = [];

    if (mode === "delete") {
      for (const orphan of orphans) {
        try {
          // Delete the agent's LLM first if it exists
          const llmId = orphan.response_engine?.llm_id;
          if (llmId) {
            const llmDelRes = await fetch(`${RETELL_BASE}/delete-retell-llm/${llmId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${retellKey}` },
            });
            if (!llmDelRes.ok) {
              console.warn(`Failed to delete LLM ${llmId}:`, await llmDelRes.text());
            } else {
              console.log(`Deleted orphan LLM: ${llmId}`);
            }
          }

          // Delete the agent
          const delRes = await fetch(`${RETELL_BASE}/delete-agent/${orphan.agent_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${retellKey}` },
          });
          if (!delRes.ok) {
            const errData = await delRes.json();
            throw new Error(errData.error_message || JSON.stringify(errData));
          }

          results.push({
            agent_id: orphan.agent_id,
            agent_name: orphan.agent_name || "Unknown",
            voice_id: orphan.voice_id || "unknown",
            status: "deleted",
          });
          console.log(`🗑️ Deleted orphan: ${orphan.agent_name} (${orphan.agent_id})`);
        } catch (e) {
          results.push({
            agent_id: orphan.agent_id,
            agent_name: orphan.agent_name || "Unknown",
            voice_id: orphan.voice_id || "unknown",
            status: "error",
            error: e.message,
          });
          console.error(`Failed to delete ${orphan.agent_id}:`, e);
        }
      }
    } else {
      // Dry run: just list them
      for (const orphan of orphans) {
        results.push({
          agent_id: orphan.agent_id,
          agent_name: orphan.agent_name || "Unknown",
          voice_id: orphan.voice_id || "unknown",
          status: "orphan (dry_run)",
        });
      }
    }

    return new Response(JSON.stringify({
      mode,
      total_retell_agents: retellAgents.length,
      db_tracked_agents: dbAgentIds.size,
      orphans_found: orphans.length,
      kept: kept.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cleanup-retell-agents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
