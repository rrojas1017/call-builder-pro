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
    console.log("Bland webhook received:", JSON.stringify(body).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const blandCallId = body.call_id;
    if (!blandCallId) throw new Error("No call_id in webhook");

    const metadata = body.metadata || {};
    const transcript = body.concatenated_transcript || body.transcript || "";
    const summary = body.summary || body.analysis || null;
    const status = body.status || body.call_status || "completed";
    const duration = body.call_length || body.duration || null;

    // Map Bland status to our contact status
    let contactStatus = "completed";
    if (status === "no-answer" || status === "no_answer") contactStatus = "no_answer";
    else if (status === "voicemail") contactStatus = "voicemail";
    else if (status === "busy") contactStatus = "busy";
    else if (status === "error" || status === "failed") contactStatus = "failed";

    // Determine outcome
    let outcome = contactStatus;
    let extractedData: any = null;

    // Try to parse summary for extracted data
    if (summary) {
      try {
        if (typeof summary === "string") {
          // Try to find JSON in the summary
          const jsonMatch = summary.match(/\{[\s\S]*\}/);
          if (jsonMatch) extractedData = JSON.parse(jsonMatch[0]);
        } else {
          extractedData = summary;
        }
      } catch { /* ignore parse errors */ }
    }

    if (extractedData?.qualified === true) outcome = "qualified";
    else if (extractedData?.qualified === false) outcome = "disqualified";

    // Upsert call record
    const callData = {
      org_id: metadata.org_id,
      project_id: metadata.project_id,
      campaign_id: metadata.campaign_id || null,
      contact_id: metadata.contact_id || null,
      direction: "outbound",
      bland_call_id: blandCallId,
      started_at: body.created_at || new Date().toISOString(),
      ended_at: body.end_at || new Date().toISOString(),
      duration_seconds: typeof duration === "number" ? Math.round(duration) : null,
      outcome,
      transcript,
      summary: typeof summary === "object" ? summary : { raw: summary },
      extracted_data: extractedData,
      version: metadata.version || 1,
    };

    const { error: callErr } = await supabase
      .from("calls")
      .upsert(callData, { onConflict: "bland_call_id" });
    if (callErr) console.error("Error upserting call:", callErr);

    // Update contact status
    if (metadata.contact_id) {
      await supabase
        .from("contacts")
        .update({ status: contactStatus, bland_call_id: blandCallId })
        .eq("id", metadata.contact_id);
    }

    // Trigger tick-campaign to continue processing
    if (metadata.campaign_id) {
      const tickUrl = `${supabaseUrl}/functions/v1/tick-campaign`;
      fetch(tickUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ campaign_id: metadata.campaign_id }),
      }).catch((e) => console.error("Error triggering tick:", e));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("receive-bland-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
