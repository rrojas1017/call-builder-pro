import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    if (!action) throw new Error("action is required");

    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");
    const RETELL_BASE = "https://api.retellai.com";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ===== ASSIGN =====
    if (action === "assign") {
      const { number_id, project_id } = body;
      if (!number_id || !project_id) throw new Error("number_id and project_id required");

      const { data: num, error: numErr } = await supabase
        .from("inbound_numbers").select("*").eq("id", number_id).single();
      if (numErr) throw numErr;

      const { data: spec, error: specErr } = await supabase
        .from("agent_specs").select("retell_agent_id").eq("project_id", project_id).single();
      if (specErr || !spec?.retell_agent_id) throw new Error("This agent hasn't been deployed yet. Please open the agent and click 'Create Append Agent' first.");

      // Look up org_id for this number
      const { data: numRow } = await supabase
        .from("inbound_numbers").select("org_id").eq("id", number_id).single();

      const retellResp = await fetch(`${RETELL_BASE}/update-phone-number/${encodeURIComponent(num.phone_number)}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inbound_agent_id: spec.retell_agent_id,
          nickname: `${numRow?.org_id || ""}::${project_id}`,
        }),
      });
      const retellData = await retellResp.json();
      console.log("Retell assign response:", JSON.stringify(retellData));
      if (!retellResp.ok) throw new Error(`Retell assign error: ${JSON.stringify(retellData)}`);

      await supabase.from("inbound_numbers").update({ project_id }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== UNASSIGN =====
    if (action === "unassign") {
      const { number_id } = body;
      if (!number_id) throw new Error("number_id required");

      const { data: num } = await supabase
        .from("inbound_numbers").select("*").eq("id", number_id).single();
      if (!num) throw new Error("Number not found");

      const retellResp = await fetch(`${RETELL_BASE}/update-phone-number/${encodeURIComponent(num.phone_number)}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inbound_agent_id: null }),
      });
      const retellData = await retellResp.json();
      console.log("Retell unassign response:", JSON.stringify(retellData));
      if (!retellResp.ok) throw new Error(`Retell unassign error: ${JSON.stringify(retellData)}`);

      await supabase.from("inbound_numbers").update({ project_id: null }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== RELEASE =====
    if (action === "release") {
      const { number_id } = body;
      if (!number_id) throw new Error("number_id required");

      await supabase.from("inbound_numbers").update({ status: "released", project_id: null }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== UPDATE LABEL =====
    if (action === "update_label") {
      const { number_id, label } = body;
      if (!number_id) throw new Error("number_id required");

      await supabase.from("inbound_numbers").update({ label }).eq("id", number_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SYNC =====
    if (action === "sync") {
      const { org_id } = body;
      if (!org_id) throw new Error("org_id required");

      // Fetch all phone numbers from Retell
      const retellResp = await fetch(`${RETELL_BASE}/list-phone-numbers`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${RETELL_API_KEY}` },
      });
      if (!retellResp.ok) {
        const errData = await retellResp.text();
        throw new Error(`Retell list error: ${errData}`);
      }
      const retellNumbers = await retellResp.json();

      // Get existing DB numbers for this org
      const { data: dbNumbers } = await supabase
        .from("inbound_numbers")
        .select("phone_number")
        .eq("org_id", org_id)
        .neq("status", "released");

      const existingSet = new Set((dbNumbers || []).map((n: any) => n.phone_number));
      let synced = 0;

      // Retell returns an array of phone number objects
      for (const rn of (retellNumbers || [])) {
        const phoneNumber = rn.phone_number;
        if (!phoneNumber || existingSet.has(phoneNumber)) continue;
        // Only sync numbers that aren't already tracked
        await supabase.from("inbound_numbers").insert({
          org_id,
          phone_number: phoneNumber,
          area_code: phoneNumber.replace(/\D/g, "").slice(1, 4),
          label: rn.nickname || `Retell ${phoneNumber.replace(/\D/g, "").slice(1, 4)}`,
          monthly_cost_usd: 2,
          status: "active",
        });
        synced++;
      }

      return new Response(JSON.stringify({ success: true, synced }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error("manage-inbound-numbers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
