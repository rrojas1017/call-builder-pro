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
    console.log("Retell webhook received:", JSON.stringify(body).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Retell sends event type: "call_ended", "call_analyzed", etc.
    const event = body.event || "call_ended";
    if (event !== "call_ended" && event !== "call_analyzed") {
      return new Response(JSON.stringify({ success: true, message: `Ignored event: ${event}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callData = body.call || body;
    const retellCallId = callData.call_id;
    if (!retellCallId) throw new Error("No call_id in Retell webhook");

    const metadata = callData.metadata || {};
    const transcript = callData.transcript || "";
    const recordingUrl = callData.recording_url || null;
    const duration = callData.end_timestamp && callData.start_timestamp
      ? Math.round((callData.end_timestamp - callData.start_timestamp) / 1000)
      : null;

    // Map Retell disconnect reason to our status
    const disconnectReason = callData.disconnect_reason || callData.call_status || "";
    let contactStatus = "completed";
    if (disconnectReason === "no_answer" || disconnectReason === "dial_no_answer") contactStatus = "no_answer";
    else if (disconnectReason === "busy" || disconnectReason === "dial_busy") contactStatus = "busy";
    else if (disconnectReason === "error" || disconnectReason === "machine_detected") contactStatus = "failed";
    else if (disconnectReason === "voicemail_reached") contactStatus = "voicemail";

    // Extract analysis data if available
    let outcome = contactStatus;
    let extractedData: any = null;
    const summary = callData.call_analysis || null;

    if (summary) {
      try {
        extractedData = typeof summary === "string" ? JSON.parse(summary) : summary;
      } catch { /* ignore */ }
    }

    if (extractedData?.qualified === true) outcome = "qualified";
    else if (extractedData?.qualified === false) outcome = "disqualified";

    // ===== TEST LAB FLOW =====
    if (metadata.test_run_contact_id) {
      console.log("Test lab flow (Retell) for contact:", metadata.test_run_contact_id);

      await supabase
        .from("test_run_contacts")
        .update({
          transcript,
          status: contactStatus,
          retell_call_id: retellCallId,
          duration_seconds: duration,
          outcome,
          extracted_data: extractedData,
          called_at: new Date().toISOString(),
          recording_url: recordingUrl,
        } as any)
        .eq("id", metadata.test_run_contact_id);

      // Upsert into calls table
      const callRecord: any = {
        org_id: metadata.org_id,
        project_id: metadata.project_id,
        direction: "outbound",
        retell_call_id: retellCallId,
        voice_provider: "retell",
        started_at: callData.start_timestamp ? new Date(callData.start_timestamp).toISOString() : new Date().toISOString(),
        ended_at: callData.end_timestamp ? new Date(callData.end_timestamp).toISOString() : new Date().toISOString(),
        duration_seconds: duration,
        outcome,
        transcript,
        summary: typeof summary === "object" ? summary : { raw: summary },
        extracted_data: extractedData,
        version: metadata.spec_version || 1,
        recording_url: recordingUrl,
      };

      const { data: upsertedCall, error: callErr } = await supabase
        .from("calls")
        .upsert(callRecord, { onConflict: "retell_call_id" })
        .select("id")
        .single();
      if (callErr) console.error("Error upserting Retell call:", callErr);

      // Trigger evaluate-call
      if (upsertedCall?.id && transcript && contactStatus === "completed") {
        fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ call_id: upsertedCall.id, test_run_contact_id: metadata.test_run_contact_id }),
        }).catch((e) => console.error("Error triggering evaluate-call:", e));
      }

      // Trigger run-test-run to pick next contact
      if (metadata.test_run_id) {
        fetch(`${supabaseUrl}/functions/v1/run-test-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ test_run_id: metadata.test_run_id }),
        }).catch((e) => console.error("Error triggering run-test-run:", e));
      }

      return new Response(JSON.stringify({ success: true, flow: "test_lab" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== STANDARD CAMPAIGN FLOW =====
    const callRecord: any = {
      org_id: metadata.org_id,
      project_id: metadata.project_id,
      campaign_id: metadata.campaign_id || null,
      contact_id: metadata.contact_id || null,
      direction: "outbound",
      retell_call_id: retellCallId,
      voice_provider: "retell",
      started_at: callData.start_timestamp ? new Date(callData.start_timestamp).toISOString() : new Date().toISOString(),
      ended_at: callData.end_timestamp ? new Date(callData.end_timestamp).toISOString() : new Date().toISOString(),
      duration_seconds: duration,
      outcome,
      transcript,
      summary: typeof summary === "object" ? summary : { raw: summary },
      extracted_data: extractedData,
      version: metadata.version || 1,
      recording_url: recordingUrl,
    };

    const { data: upsertedCall, error: callErr } = await supabase
      .from("calls")
      .upsert(callRecord, { onConflict: "retell_call_id" })
      .select("id")
      .single();
    if (callErr) console.error("Error upserting Retell call:", callErr);

    // Update contact status
    if (metadata.contact_id) {
      await supabase
        .from("contacts")
        .update({ status: contactStatus })
        .eq("id", metadata.contact_id);
    }

    // Trigger evaluate-call
    if (upsertedCall?.id && transcript && contactStatus === "completed") {
      fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ call_id: upsertedCall.id }),
      }).catch((e) => console.error("Error triggering evaluate-call:", e));
    }

    // Trigger tick-campaign
    if (metadata.campaign_id) {
      fetch(`${supabaseUrl}/functions/v1/tick-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ campaign_id: metadata.campaign_id }),
      }).catch((e) => console.error("Error triggering tick:", e));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("receive-retell-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
