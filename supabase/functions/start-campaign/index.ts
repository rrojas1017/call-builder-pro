import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");
    console.log(`[start-campaign] Starting campaign: ${campaign_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Set campaign to running
    await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign_id);
    console.log(`[start-campaign] Campaign ${campaign_id} set to running`);

    // Trigger tick-campaign
    const tickUrl = `${supabaseUrl}/functions/v1/tick-campaign`;
    const tickResp = await fetch(tickUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ campaign_id }),
    });
    const tickBody = await tickResp.text();
    console.log(`[start-campaign] tick-campaign response: status=${tickResp.status} body=${tickBody.slice(0, 500)}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("start-campaign error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
