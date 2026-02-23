import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { call_id, contact_id } = await req.json();
    if (!call_id) throw new Error("call_id is required");

    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");

    const stopRes = await fetch("https://api.retellai.com/v2/end-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ call_id }),
    });

    if (!stopRes.ok) {
      const stopData = await stopRes.json().catch(() => ({}));
      console.error("Retell stop response:", JSON.stringify(stopData));
      throw new Error(`Retell API error: ${stopData.message || stopData.error_message || stopRes.statusText}`);
    }
    console.log("Retell call stopped:", call_id);

    // Update test_run_contacts status to cancelled if contact_id provided
    if (contact_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await supabase
        .from("test_run_contacts")
        .update({ status: "cancelled" })
        .eq("id", contact_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stop-call error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
