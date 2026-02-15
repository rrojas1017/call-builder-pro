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
    // Compute duration from timestamps (reliable) instead of trusting call_length
    const startedAt = body.created_at ? new Date(body.created_at) : null;
    const endedAt = body.end_at ? new Date(body.end_at) : null;
    let duration: number | null = null;
    if (startedAt && endedAt) {
      duration = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    } else {
      duration = body.call_length || body.duration || null;
    }
    const recordingUrl = body.recording_url || body.recordingUrl || null;

    // Map Bland status to our contact status
    let contactStatus = "completed";
    if (status === "no-answer" || status === "no_answer") contactStatus = "no_answer";
    else if (status === "voicemail") contactStatus = "voicemail";
    else if (status === "busy") contactStatus = "busy";
    else if (status === "error" || status === "failed") contactStatus = "failed";
    else if (status === "dnc" || status === "do_not_call") contactStatus = "dnc";
    else if (status === "disconnected" || status === "invalid_number") contactStatus = "disconnected";
    else if (status === "call_me_later" || status === "callback") contactStatus = "call_me_later";
    else if (status === "not_available") contactStatus = "not_available";

    // Override with answering machine detection result (transcript-aware)
    const answeredBy = body.answered_by || null;
    const hasRealConversation = transcript && transcript.includes("user:") && transcript.length > 200;
    if ((answeredBy === "voicemail" || answeredBy === "machine") && !hasRealConversation) {
      contactStatus = "voicemail";
    }
    if (answeredBy === "unknown" && !hasRealConversation) {
      contactStatus = "voicemail";
    }

    // Determine outcome
    let outcome = contactStatus;
    let extractedData: any = null;

    if (summary) {
      try {
        if (typeof summary === "string") {
          const jsonMatch = summary.match(/\{[\s\S]*\}/);
          if (jsonMatch) extractedData = JSON.parse(jsonMatch[0]);
        } else {
          extractedData = summary;
        }
      } catch { /* ignore parse errors */ }
    }

    if (extractedData?.qualified === true) outcome = "qualified";
    else if (extractedData?.qualified === false) outcome = "disqualified";

    // ===== TEST LAB FLOW =====
    if (metadata.test_run_contact_id) {
      console.log("Test lab flow for contact:", metadata.test_run_contact_id);

      // Update test_run_contacts row
      const { error: updateErr } = await supabase
        .from("test_run_contacts")
        .update({
          transcript,
          status: contactStatus,
          bland_call_id: blandCallId,
          duration_seconds: typeof duration === "number" ? Math.round(duration) : null,
          outcome,
          extracted_data: extractedData,
          called_at: new Date().toISOString(),
          recording_url: recordingUrl,
        })
        .eq("id", metadata.test_run_contact_id);

      if (updateErr) console.error("Error updating test_run_contacts:", updateErr);

      // Also upsert into calls table for evaluate-call compatibility
      const callData: any = {
        org_id: metadata.org_id,
        project_id: metadata.project_id,
        direction: "outbound",
        bland_call_id: blandCallId,
        started_at: body.created_at || new Date().toISOString(),
        ended_at: body.end_at || new Date().toISOString(),
        duration_seconds: typeof duration === "number" ? Math.round(duration) : null,
        outcome,
        transcript,
        summary: typeof summary === "object" ? summary : { raw: summary },
        extracted_data: extractedData,
        version: metadata.spec_version || 1,
        recording_url: recordingUrl,
      };

      const { data: upsertedCall, error: callErr } = await supabase
        .from("calls")
        .upsert(callData, { onConflict: "bland_call_id" })
        .select("id")
        .single();
      if (callErr) console.error("Error upserting call:", callErr);

      // Trigger evaluate-call for completed calls
      if (upsertedCall?.id && transcript && contactStatus === "completed") {
        const evalUrl = `${supabaseUrl}/functions/v1/evaluate-call`;
        fetch(evalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            call_id: upsertedCall.id,
            test_run_contact_id: metadata.test_run_contact_id,
          }),
        }).catch((e) => console.error("Error triggering evaluate-call:", e));
      }

      // Trigger run-test-run to pick next queued contact
      if (metadata.test_run_id) {
        fetch(`${supabaseUrl}/functions/v1/run-test-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ test_run_id: metadata.test_run_id }),
        }).catch((e) => console.error("Error triggering run-test-run:", e));
      }

      return new Response(JSON.stringify({ success: true, flow: "test_lab" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== INBOUND CALL FLOW =====
    const toNumber = body.to || body.to_number || null;
    if (!metadata.campaign_id && !metadata.contact_id && toNumber) {
      // Check if this is an inbound call to one of our numbers
      const { data: inboundNum } = await supabase
        .from("inbound_numbers")
        .select("*")
        .eq("phone_number", toNumber)
        .eq("status", "active")
        .maybeSingle();

      if (inboundNum) {
        console.log("Inbound call flow for number:", toNumber);

        const inboundCallData: any = {
          org_id: inboundNum.org_id,
          project_id: inboundNum.project_id || metadata.project_id,
          direction: "inbound",
          inbound_number_id: inboundNum.id,
          bland_call_id: blandCallId,
          started_at: body.created_at || new Date().toISOString(),
          ended_at: body.end_at || new Date().toISOString(),
          duration_seconds: typeof duration === "number" ? Math.round(duration) : null,
          outcome,
          transcript,
          summary: typeof summary === "object" ? summary : { raw: summary },
          extracted_data: extractedData,
          recording_url: recordingUrl,
          version: 1,
        };

        const { data: upsertedInbound, error: inboundErr } = await supabase
          .from("calls")
          .upsert(inboundCallData, { onConflict: "bland_call_id" })
          .select("id")
          .single();
        if (inboundErr) console.error("Error upserting inbound call:", inboundErr);

        // Trigger evaluate-call for completed inbound calls
        if (upsertedInbound?.id && transcript && contactStatus === "completed") {
          fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ call_id: upsertedInbound.id }),
          }).catch((e) => console.error("Error triggering evaluate-call for inbound:", e));
        }

        return new Response(JSON.stringify({ success: true, flow: "inbound" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== STANDARD CAMPAIGN FLOW =====
    const callData: any = {
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
      recording_url: recordingUrl,
    };

    const { data: upsertedCall, error: callErr } = await supabase
      .from("calls")
      .upsert(callData, { onConflict: "bland_call_id" })
      .select("id")
      .single();
    if (callErr) console.error("Error upserting call:", callErr);

    // Update contact status and increment attempts
    if (metadata.contact_id) {
      // Fetch current attempts to increment
      const { data: currentContact } = await supabase
        .from("contacts")
        .select("attempts")
        .eq("id", metadata.contact_id)
        .single();
      const newAttempts = ((currentContact as any)?.attempts || 0) + 1;
      await supabase
        .from("contacts")
        .update({ status: contactStatus, bland_call_id: blandCallId, attempts: newAttempts, called_at: new Date().toISOString() })
        .eq("id", metadata.contact_id);
    }

    // Trigger evaluate-call for completed calls with transcripts
    if (upsertedCall?.id && transcript && contactStatus === "completed") {
      const evalUrl = `${supabaseUrl}/functions/v1/evaluate-call`;
      fetch(evalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ call_id: upsertedCall.id }),
      }).catch((e) => console.error("Error triggering evaluate-call:", e));
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
