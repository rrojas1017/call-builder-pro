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

    const { data: specs, error: dbErr } = await db
      .from("agent_specs")
      .select("id, retell_agent_id, agent_projects(name)")
      .not("retell_agent_id", "is", null);

    if (dbErr) throw new Error(`DB query failed: ${dbErr.message}`);
    if (!specs || specs.length === 0) {
      return new Response(JSON.stringify({ fixed: 0, total: 0, results: [], message: "No agents with Retell IDs found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ agent_name: string; retell_agent_id: string; status: string; error?: string }> = [];

    for (const spec of specs) {
      const agentName = (spec as any).agent_projects?.name || "Unnamed";
      const retellId = spec.retell_agent_id!;

      try {
        // 1. GET agent to find llm_id
        const getRes = await fetch(`${RETELL_BASE}/get-agent/${retellId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${retellKey}` },
        });
        const agentData = await getRes.json();
        if (!getRes.ok) throw new Error(agentData.error_message || JSON.stringify(agentData));

        const llmId = agentData.response_engine?.llm_id;

        // 2. PATCH LLM to remove transfer flag
        if (llmId) {
          const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellKey}` },
            body: JSON.stringify({ is_transfer_llm: false }),
          });
          if (!llmRes.ok) {
            const llmErr = await llmRes.json();
            console.error(`Failed to patch LLM ${llmId}:`, llmErr);
          }
        }

        // 3. PATCH agent to remove transfer flag
        const patchRes = await fetch(`${RETELL_BASE}/update-agent/${retellId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellKey}` },
          body: JSON.stringify({ is_transfer_agent: false }),
        });
        if (!patchRes.ok) {
          const patchErr = await patchRes.json();
          throw new Error(patchErr.error_message || JSON.stringify(patchErr));
        }

        results.push({ agent_name: agentName, retell_agent_id: retellId, status: "fixed" });
        console.log(`✅ Fixed ${agentName} (${retellId})`);
      } catch (e) {
        console.error(`❌ Failed ${agentName}:`, e);
        results.push({ agent_name: agentName, retell_agent_id: retellId, status: "error", error: e.message });
      }
    }

    const fixed = results.filter(r => r.status === "fixed").length;
    return new Response(JSON.stringify({ fixed, total: specs.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("bulk-fix-transfer-agents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
