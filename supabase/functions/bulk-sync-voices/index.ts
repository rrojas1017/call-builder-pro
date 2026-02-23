import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETELL_BASE = "https://api.retellai.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const retellKey = Deno.env.get("RETELL_API_KEY");
    if (!retellKey) throw new Error("RETELL_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load all specs with a retell_agent_id
    const { data: specs, error } = await supabase
      .from("agent_specs")
      .select("id, retell_agent_id, voice_id, persona_name, project_id")
      .not("retell_agent_id", "is", null);

    if (error) throw new Error(`DB error: ${error.message}`);

    const results = [];

    for (const spec of specs || []) {
      const label = spec.persona_name || spec.id;
      
      // GET current voice from Retell
      let oldVoice = "unknown";
      try {
        const getRes = await fetch(`${RETELL_BASE}/get-agent/${spec.retell_agent_id}`, {
          headers: { Authorization: `Bearer ${retellKey}` },
        });
        if (getRes.ok) {
          const agent = await getRes.json();
          oldVoice = agent.voice_id || "none";
        }
      } catch {}

      if (!spec.voice_id) {
        results.push({ agent: label, retell_id: spec.retell_agent_id, old_voice: oldVoice, new_voice: null, status: "skipped_no_voice" });
        continue;
      }

      // PATCH with correct voice
      try {
        const patchRes = await fetch(`${RETELL_BASE}/update-agent/${spec.retell_agent_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellKey}` },
          body: JSON.stringify({ voice_id: spec.voice_id }),
        });
        const patchData = await patchRes.json();
        results.push({
          agent: label,
          retell_id: spec.retell_agent_id,
          old_voice: oldVoice,
          new_voice: spec.voice_id,
          status: patchRes.ok ? "synced" : `error: ${patchData.error_message || JSON.stringify(patchData)}`,
        });
      } catch (e) {
        results.push({ agent: label, retell_id: spec.retell_agent_id, old_voice: oldVoice, new_voice: spec.voice_id, status: `error: ${e.message}` });
      }
    }

    return new Response(JSON.stringify({ total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
