import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const retellApiKey = Deno.env.get("RETELL_API_KEY");
    if (!retellApiKey) throw new Error("RETELL_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all calls missing cost data
    const { data: calls, error } = await supabase
      .from("calls")
      .select("id, retell_call_id, org_id, duration_seconds")
      .is("cost_estimate_usd", null)
      .not("retell_call_id", "is", null)
      .limit(500);

    if (error) throw error;
    if (!calls || calls.length === 0) {
      return new Response(JSON.stringify({ message: "No calls to backfill", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[backfill] Found ${calls.length} calls to process`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const call of calls) {
      try {
        const resp = await fetch(`https://api.retellai.com/v2/get-call/${call.retell_call_id}`, {
          headers: { "Authorization": `Bearer ${retellApiKey}` },
        });

        if (!resp.ok) {
          console.error(`[backfill] Retell API ${resp.status} for ${call.retell_call_id}`);
          errors++;
          continue;
        }

        const data = await resp.json();
        const combinedCostCents = data?.call_cost?.combined_cost;

        if (combinedCostCents == null || combinedCostCents <= 0) {
          skipped++;
          continue;
        }

        const costUsd = combinedCostCents / 100;
        const durationMin = call.duration_seconds ? (call.duration_seconds / 60).toFixed(1) : "0";

        // Update call record
        await supabase.from("calls")
          .update({ cost_estimate_usd: costUsd })
          .eq("id", call.id);

        // Insert credit transaction
        await supabase.from("credit_transactions").insert({
          org_id: call.org_id,
          amount: -costUsd,
          type: "call_charge",
          description: `[Backfill] Call ${call.retell_call_id} (${durationMin} min) - $${costUsd.toFixed(2)}`,
        });

        // Deduct from org balance
        const { data: orgData } = await supabase
          .from("organizations")
          .select("credits_balance")
          .eq("id", call.org_id)
          .single();

        if (orgData) {
          await supabase.from("organizations")
            .update({ credits_balance: (orgData.credits_balance || 0) - costUsd })
            .eq("id", call.org_id);
        }

        updated++;
        console.log(`[backfill] Updated call ${call.retell_call_id}: $${costUsd.toFixed(2)}`);
      } catch (e) {
        console.error(`[backfill] Error processing ${call.retell_call_id}:`, e);
        errors++;
      }
    }

    const summary = { total: calls.length, updated, skipped, errors };
    console.log("[backfill] Complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
