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
    const apiKey = Deno.env.get("RETELL_API_KEY");
    if (!apiKey) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, area_code, org_id, phone_number_id, agent_id, number_id } = await req.json();

    if (action === "purchase") {
      if (!area_code || !org_id) throw new Error("area_code and org_id required for purchase");

      const purchaseBody: Record<string, unknown> = { area_code: parseInt(area_code, 10) };
      if (agent_id) purchaseBody.outbound_agent_id = agent_id;

      const res = await fetch(`${RETELL_BASE}/create-phone-number`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(purchaseBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      // Save to inbound_numbers table
      const phoneNumber = data.phone_number || data.number;
      const { data: savedNumber, error: saveErr } = await supabase.from("inbound_numbers").insert({
        org_id,
        phone_number: phoneNumber,
        area_code: area_code.toString(),
        status: "active",
        monthly_cost_usd: 2,
        label: `Retell ${area_code}`,
      }).select().single();
      if (saveErr) console.error("Failed to save number to DB:", saveErr);

      return new Response(JSON.stringify({ number: savedNumber || data, retell_data: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const res = await fetch(`${RETELL_BASE}/list-phone-numbers`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "assign_agent") {
      if (!phone_number_id || !agent_id) throw new Error("phone_number_id and agent_id required");

      const res = await fetch(`${RETELL_BASE}/update-phone-number/${phone_number_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ outbound_agent_id: agent_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "release") {
      if (!phone_number_id) throw new Error("phone_number_id required for release");

      const res = await fetch(`${RETELL_BASE}/delete-phone-number/${phone_number_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error_message || data.message || JSON.stringify(data));
      }

      // Update DB if number_id provided
      if (number_id) {
        await supabase.from("inbound_numbers").update({ status: "released" }).eq("id", number_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}. Use "purchase", "list", "assign_agent", or "release".`);
  } catch (err) {
    console.error("manage-retell-numbers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
