import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

// ===== WEBHOOK SIGNATURE VERIFICATION =====
async function verifyRetellSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const webhookSecret = Deno.env.get("RETELL_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.warn("[SECURITY] RETELL_WEBHOOK_SECRET not configured — skipping signature check");
    return true;
  }
  if (!signatureHeader) {
    console.error("[SECURITY] No x-retell-signature header present");
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expectedHex === signatureHeader;
}

// ===== INBOUND DETECTION HELPER =====
async function resolveInboundMetadata(supabase: any, callData: any) {
  const toNumber = callData.to_number || callData.to;
  if (!toNumber) return null;

  const cleaned = toNumber.replace(/\D/g, "");
  const { data: inboundNum } = await supabase
    .from("inbound_numbers")
    .select("id, org_id, project_id, phone_number")
    .or(`phone_number.eq.${toNumber},phone_number.eq.+${cleaned},phone_number.eq.+1${cleaned}`)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!inboundNum || !inboundNum.org_id) return null;

  console.log(`[Inbound] Resolved to_number=${toNumber} -> org=${inboundNum.org_id} project=${inboundNum.project_id} number_id=${inboundNum.id}`);
  return {
    org_id: inboundNum.org_id,
    project_id: inboundNum.project_id,
    inbound_number_id: inboundNum.id,
    caller_phone: callData.from_number || callData.from || null,
  };
}

// ===== CRM UPSERT =====
async function upsertCrmRecord(
  supabase: any,
  metadata: any,
  extractedData: any,
  outcome: string,
  campaignId: string | null
) {
  try {
    const phone = metadata.phone?.replace(/\D/g, "") || "";
    if (!phone || !metadata.org_id) return;

    const name = extractedData?.caller_name || extractedData?.name || metadata.contact_name || null;
    const state = extractedData?.state || null;
    const age = extractedData?.age?.toString() || null;
    const householdSize = extractedData?.household_size?.toString() || null;
    const income = extractedData?.income_est_annual?.toString() || extractedData?.income?.toString() || null;
    const coverageType = extractedData?.coverage_type || null;
    const consent = extractedData?.consent ?? null;
    const qualified = extractedData?.qualified ?? null;
    const transferred = outcome === "transfer_completed" || extractedData?.transferred === true;
    const email = extractedData?.email || null;

    const knownKeys = ["caller_name", "name", "state", "age", "household_size", "income_est_annual", "income", "coverage_type", "consent", "qualified", "transferred", "email"];
    const customFields: Record<string, any> = {};
    if (extractedData && typeof extractedData === "object") {
      for (const [k, v] of Object.entries(extractedData)) {
        if (!knownKeys.includes(k) && v != null) customFields[k] = v;
      }
    }

    const now = new Date().toISOString();

    const { error } = await supabase.rpc("upsert_crm_record", {
      _org_id: metadata.org_id,
      _phone: phone,
      _name: name,
      _email: email,
      _state: state,
      _age: age,
      _household_size: householdSize,
      _income: income,
      _coverage_type: coverageType,
      _consent: consent,
      _qualified: qualified,
      _transferred: transferred,
      _custom_fields: customFields,
      _campaign_id: campaignId,
      _outcome: outcome,
      _now: now,
    });

    if (error) console.error("[CRM upsert] Error:", error);
    else console.log(`[CRM upsert] OK for phone=${phone}`);
  } catch (e) {
    console.error("[CRM upsert] Exception:", e);
  }
}

// ===== COST TRACKING =====
async function trackCallCost(supabase: any, orgId: string, retellCallId: string, duration: number | null, phoneLabel: string) {
  try {
    const retellApiKey = Deno.env.get("RETELL_API_KEY");
    if (!retellApiKey) return;

    const costResp = await fetch(`https://api.retellai.com/v2/get-call/${retellCallId}`, {
      headers: { "Authorization": `Bearer ${retellApiKey}` },
    });
    if (!costResp.ok) {
      console.error("Failed to fetch Retell call cost:", costResp.status);
      return;
    }
    const costData = await costResp.json();
    const combinedCostCents = costData?.call_cost?.combined_cost;
    if (combinedCostCents == null || combinedCostCents <= 0) return;

    const costUsd = combinedCostCents / 100;
    const durationMin = duration ? (duration / 60).toFixed(1) : "0";

    await supabase.from("calls")
      .update({ cost_estimate_usd: costUsd })
      .eq("retell_call_id", retellCallId);

    await supabase.from("credit_transactions").insert({
      org_id: orgId,
      amount: -costUsd,
      type: "call_charge",
      description: `Call to ${phoneLabel} (${durationMin} min) - $${costUsd.toFixed(2)}`,
    });

    const { data: orgData } = await supabase
      .from("organizations")
      .select("credits_balance")
      .eq("id", orgId)
      .single();
    if (orgData) {
      await supabase.from("organizations")
        .update({ credits_balance: (orgData.credits_balance || 0) - costUsd })
        .eq("id", orgId);
    }

    console.log(`Cost tracked: $${costUsd.toFixed(2)} for call ${retellCallId}`);
  } catch (costErr) {
    console.error("Error fetching/saving call cost:", costErr);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-retell-signature");
    const isValid = await verifyRetellSignature(rawBody, signatureHeader);
    if (!isValid) {
      console.error("[SECURITY] Webhook signature verification FAILED");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[SECURITY] Webhook signature verified");
    const body = JSON.parse(rawBody);
    console.log("[receive-retell-webhook] Payload:", JSON.stringify(body).slice(0, 1000));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const event = body.event || "call_ended";

    // ===== CALL STARTED =====
    if (event === "call_started") {
      const callData = body.call || body;
      const metadata = callData.metadata || {};
      const retellCallId = callData.call_id;

      if (retellCallId && metadata.org_id && metadata.project_id) {
        await supabase.from("calls").upsert({
          org_id: metadata.org_id,
          project_id: metadata.project_id,
          campaign_id: metadata.campaign_id || null,
          contact_id: metadata.contact_id || null,
          direction: "outbound",
          retell_call_id: retellCallId,
          voice_provider: "retell",
          started_at: new Date().toISOString(),
          outcome: "in_progress",
          version: metadata.version || 1,
        }, { onConflict: "retell_call_id" });
      } else if (retellCallId) {
        const inbound = await resolveInboundMetadata(supabase, callData);
        if (inbound && inbound.project_id) {
          await supabase.from("calls").upsert({
            org_id: inbound.org_id,
            project_id: inbound.project_id,
            inbound_number_id: inbound.inbound_number_id,
            direction: "inbound",
            retell_call_id: retellCallId,
            voice_provider: "retell",
            started_at: new Date().toISOString(),
            outcome: "in_progress",
            version: 1,
          }, { onConflict: "retell_call_id" });
          console.log(`[call_started] Inbound call tracked: ${retellCallId}`);
        }
      }
      return new Response(JSON.stringify({ success: true, event: "call_started" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== TRANSFER EVENTS =====
    if (event === "transfer_started" || event === "transfer_bridged" || event === "transfer_ended") {
      const callData = body.call || body;
      const retellCallId = callData.call_id;
      if (retellCallId) {
        const transferStatus = event === "transfer_ended" ? "transfer_completed" : "transfer_in_progress";
        await supabase.from("calls")
          .update({ outcome: transferStatus })
          .eq("retell_call_id", retellCallId);
      }
      return new Response(JSON.stringify({ success: true, event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== IGNORE OTHER EVENTS =====
    if (event !== "call_ended" && event !== "call_analyzed") {
      return new Response(JSON.stringify({ success: true, message: `Ignored event: ${event}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== CALL ENDED / ANALYZED =====
    const callData = body.call || body;
    const retellCallId = callData.call_id;
    if (!retellCallId) throw new Error("No call_id in Retell webhook");

    let metadata = callData.metadata || {};
    let direction = "outbound";
    let inboundNumberId: string | null = null;

    // ===== INBOUND DETECTION =====
    if (!metadata.org_id || !metadata.project_id) {
      const inbound = await resolveInboundMetadata(supabase, callData);
      if (inbound) {
        metadata = {
          ...metadata,
          org_id: inbound.org_id,
          project_id: inbound.project_id,
          phone: inbound.caller_phone,
        };
        inboundNumberId = inbound.inbound_number_id;
        direction = "inbound";
        console.log(`[Inbound] Detected inbound call ${retellCallId}, direction set to inbound`);
      }
    }

    if (!metadata.org_id || !metadata.project_id) {
      console.log(`[receive-retell-webhook] No org/project for call ${retellCallId}, skipping`);
      return new Response(JSON.stringify({ success: true, message: "Unattributed call, skipped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = callData.transcript || "";
    const recordingUrl = callData.recording_url || null;
    const duration = callData.end_timestamp && callData.start_timestamp
      ? Math.round((callData.end_timestamp - callData.start_timestamp) / 1000)
      : null;

    const disconnectReason = callData.disconnect_reason || callData.call_status || "";
    let contactStatus = "completed";
    if (disconnectReason === "no_answer" || disconnectReason === "dial_no_answer") contactStatus = "no_answer";
    else if (disconnectReason === "busy" || disconnectReason === "dial_busy") contactStatus = "busy";
    else if (disconnectReason === "error" || disconnectReason === "machine_detected") contactStatus = "failed";
    else if (disconnectReason === "voicemail_reached") contactStatus = "voicemail";
    else if (disconnectReason === "dnc" || disconnectReason === "do_not_call") contactStatus = "dnc";
    else if (disconnectReason === "disconnected" || disconnectReason === "invalid_number") contactStatus = "disconnected";
    else if (disconnectReason === "call_me_later" || disconnectReason === "callback") contactStatus = "call_me_later";
    else if (disconnectReason === "not_available") contactStatus = "not_available";

    const answeredBy = callData.answered_by || null;
    const hasRealConversation = transcript && transcript.includes("user:") && transcript.length > 200;
    if ((answeredBy === "voicemail" || answeredBy === "machine") && !hasRealConversation) {
      contactStatus = "voicemail";
    }
    if (answeredBy === "unknown" && !hasRealConversation) {
      contactStatus = "voicemail";
    }

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
    console.log(`[receive-retell-webhook] call_id=${retellCallId} direction=${direction} disconnectReason=${disconnectReason} answeredBy=${answeredBy} contactStatus=${contactStatus} outcome=${outcome}`);

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

      if (upsertedCall?.id && transcript) {
        fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ call_id: upsertedCall.id, test_run_contact_id: metadata.test_run_contact_id }),
        }).catch((e) => console.error("Error triggering evaluate-call:", e));
      }

      if (metadata.test_run_id) {
        fetch(`${supabaseUrl}/functions/v1/run-test-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ test_run_id: metadata.test_run_id }),
        }).catch((e) => console.error("Error triggering run-test-run:", e));
      }

      if (metadata.org_id && retellCallId) {
        const phoneLabel = metadata.phone || "test";
        await trackCallCost(supabase, metadata.org_id, retellCallId, duration, phoneLabel);
      }

      return new Response(JSON.stringify({ success: true, flow: "test_lab" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== STANDARD FLOW (OUTBOUND + INBOUND) =====
    const callRecord: any = {
      org_id: metadata.org_id,
      project_id: metadata.project_id,
      campaign_id: metadata.campaign_id || null,
      contact_id: metadata.contact_id || null,
      inbound_number_id: inboundNumberId,
      direction,
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

    // ===== COST TRACKING =====
    if (metadata.org_id && retellCallId) {
      const phoneLabel = metadata.phone || callData.from_number || "unknown";
      await trackCallCost(supabase, metadata.org_id, retellCallId, duration, phoneLabel);
    }

    if (metadata.contact_id) {
      const { data: currentContact } = await supabase
        .from("contacts")
        .select("attempts")
        .eq("id", metadata.contact_id)
        .single();
      const newAttempts = ((currentContact as any)?.attempts || 0) + 1;
      await supabase
        .from("contacts")
        .update({ status: contactStatus, attempts: newAttempts, called_at: new Date().toISOString() })
        .eq("id", metadata.contact_id);
    }

    if (upsertedCall?.id && transcript) {
      fetch(`${supabaseUrl}/functions/v1/evaluate-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ call_id: upsertedCall.id }),
      }).catch((e) => console.error("Error triggering evaluate-call:", e));
    }

    if (metadata.campaign_id) {
      console.log(`[receive-retell-webhook] Re-triggering tick-campaign for campaign=${metadata.campaign_id}`);
      fetch(`${supabaseUrl}/functions/v1/tick-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ campaign_id: metadata.campaign_id }),
      }).then((r) => console.log(`[receive-retell-webhook] tick-campaign re-trigger status=${r.status}`))
        .catch((e) => console.error("[receive-retell-webhook] Error triggering tick:", e));
    }

    if (metadata.org_id && metadata.phone) {
      let skipCrm = false;
      if (metadata.campaign_id) {
        const { data: camp } = await supabase
          .from("campaigns")
          .select("is_test")
          .eq("id", metadata.campaign_id)
          .single();
        if (camp?.is_test) {
          skipCrm = true;
          console.log(`[CRM] Skipping upsert for test campaign ${metadata.campaign_id}`);
        }
      }
      if (!skipCrm) {
        await upsertCrmRecord(supabase, metadata, extractedData, outcome, metadata.campaign_id || null);
      }
    }

    return new Response(JSON.stringify({ success: true, direction }), {
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
