import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt, replaceTemplateVars } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");

    const BLAND_API_KEY = Deno.env.get("BLAND_API_KEY");
    if (!BLAND_API_KEY) throw new Error("BLAND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*, agent_projects!campaigns_agent_project_id_fkey(id, org_id)")
      .eq("id", campaign_id)
      .single();
    if (campErr) throw campErr;
    if (campaign.status !== "running") {
      return new Response(JSON.stringify({ message: "Campaign not running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check org credit balance
    const orgId = campaign.agent_projects.org_id;
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", orgId).single();
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load trusted outbound numbers for rotation
    const { data: trustedNumbers } = await supabase
      .from("outbound_numbers").select("id, phone_number")
      .eq("org_id", orgId).eq("status", "trusted")
      .order("last_used_at", { ascending: true, nullsFirst: true });
    let trustedNumberIndex = 0;

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", campaign.project_id).single();
    if (specErr) throw specErr;

    // Count currently active calls to enforce concurrency limit
    const { count: activeCalls } = await supabase
      .from("contacts").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).eq("status", "calling");

    const slotsAvailable = campaign.max_concurrent_calls - (activeCalls || 0);
    if (slotsAvailable <= 0) {
      return new Response(JSON.stringify({ message: "All concurrent slots busy", active: activeCalls, max: campaign.max_concurrent_calls }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch only as many queued contacts as we have slots for
    const { data: contacts } = await supabase
      .from("contacts").select("*")
      .eq("campaign_id", campaign_id).eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (!contacts || contacts.length === 0) {
      const { count: remaining } = await supabase
        .from("contacts").select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign_id).in("status", ["queued", "calling"]);
      if ((remaining || 0) === 0) {
        // === REDIAL PASS ===
        const maxAttempts = campaign.max_attempts || 1;
        const redialDelayMin = campaign.redial_delay_minutes || 60;
        const redialStatuses: string[] = campaign.redial_statuses || ["voicemail", "no_answer", "busy"];

        if (maxAttempts > 1 && redialStatuses.length > 0) {
          const cutoff = new Date(Date.now() - redialDelayMin * 60 * 1000).toISOString();
          const { data: retryable } = await supabase
            .from("contacts")
            .select("id, attempts")
            .eq("campaign_id", campaign_id)
            .in("status", redialStatuses)
            .lt("called_at", cutoff)
            .lt("attempts", maxAttempts);

          if (retryable && retryable.length > 0) {
            const retryIds = retryable.map((r: any) => r.id);
            await supabase.from("contacts").update({ status: "queued" }).in("id", retryIds);
            console.log(`Re-queued ${retryIds.length} contacts for redial`);
            // Don't mark completed — there are now queued contacts again
            return new Response(JSON.stringify({ message: "Re-queued contacts for redial", count: retryIds.length }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign_id);
      }
      return new Response(JSON.stringify({ message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Summarize agent knowledge via AI
    let knowledgeBriefing = "";
    try {
      const { data: summaryData, error: summaryErr } = await supabase.functions.invoke("summarize-agent-knowledge", {
        body: { project_id: campaign.project_id },
      });
      if (summaryErr) {
        console.error("Knowledge summarization error:", summaryErr);
      } else if (summaryData?.briefing) {
        knowledgeBriefing = summaryData.briefing;
        console.log(`Campaign knowledge briefing: ${summaryData.entries_count} entries → ${knowledgeBriefing.length} chars`);
      }
    } catch (sumErr: any) {
      console.error("Failed to invoke summarize-agent-knowledge:", sumErr.message);
    }

    // Load global human behaviors (limit 10)
    const { data: globalBehaviors } = await supabase
      .from("global_human_behaviors").select("content")
      .order("created_at", { ascending: false }).limit(10);

    const globalTechniques = (globalBehaviors || []).map((g: any) => g.content as string);

    // Merge global behaviors into spec's humanization_notes (deduped)
    if (globalTechniques.length > 0) {
      const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
      const existingLower = new Set(currentNotes.map((n: string) => n.toLowerCase().trim()));
      const newGlobal = globalTechniques.filter((t: string) => !existingLower.has(t.toLowerCase().trim()));
      spec.humanization_notes = [...currentNotes, ...newGlobal];
    }

    // Build task prompt using shared builder (now consumes qualification_rules, humanization_notes, knowledge)
    let task = buildTaskPrompt(spec, [], knowledgeBriefing);

    const MAX_TASK_LENGTH = 28000;
    if (task.length > MAX_TASK_LENGTH) {
      console.warn(`Campaign prompt too long (${task.length} chars), truncating`);
      task = task.substring(0, MAX_TASK_LENGTH) + "\n\n[Trimmed for length]";
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/receive-bland-webhook`;
    const voiceProvider = spec.voice_provider || "bland";

    if (voiceProvider === "retell") {
      // ===== RETELL AI BRANCH =====
      const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
      if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");
      const retellAgentId = spec.retell_agent_id;
      if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
      const retellWebhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

      const callIds: string[] = [];
      for (const contact of contacts) {
        try {
          const retellPayload: any = {
            agent_id: retellAgentId,
            phone_number: contact.phone,
            metadata: {
              org_id: campaign.agent_projects.org_id,
              project_id: campaign.project_id,
              campaign_id, contact_id: contact.id,
              version: spec.version,
            },
            webhook_url: retellWebhookUrl,
          };
          if (spec.from_number) {
            retellPayload.from_number = spec.from_number;
          } else if (trustedNumbers && trustedNumbers.length > 0) {
            const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
            retellPayload.from_number = picked.phone_number;
            trustedNumberIndex++;
            await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
          }

          const retellResp = await fetch("https://api.retellai.com/v2/create-phone-call", {
            method: "POST",
            headers: { Authorization: `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(retellPayload),
          });
          const retellData = await retellResp.json();
          console.log("Retell API response:", retellResp.status, JSON.stringify(retellData));

          if (retellData.call_id) {
            callIds.push(retellData.call_id);
            await supabase.from("contacts").update({
              status: "calling", attempts: 1, called_at: new Date().toISOString(),
            }).eq("id", contact.id);
          } else {
            await supabase.from("contacts").update({
              status: "failed", last_error: retellData.message || JSON.stringify(retellData),
            }).eq("id", contact.id);
          }
        } catch (callErr: any) {
          console.error("Retell call error:", callErr);
          await supabase.from("contacts").update({
            status: "failed", last_error: callErr.message,
          }).eq("id", contact.id);
        }
      }

      return new Response(JSON.stringify({
        provider: "retell", calls_initiated: callIds.length, contacts_dispatched: contacts.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // ===== BLAND AI BRANCH =====
      const callObjects = contacts.map((contact: any) => ({
        phone_number: contact.phone,
        first_sentence: replaceTemplateVars(
          spec.opening_line || "Hey {{first_name}}, you got a quick minute? I'm calling about the health coverage thing you looked at.",
          contact
        ),
        metadata: {
          org_id: campaign.agent_projects.org_id,
          project_id: campaign.project_id,
          campaign_id, contact_id: contact.id,
          version: spec.version,
        },
      }));

      const globalSettings: any = {
        task, record: true, webhook: webhookUrl,
        summary_prompt: "Return JSON with: consent (bool), caller_name, state, age (int), household_size (int), income_est_annual (int), coverage_type, qualified (bool), disqual_reason, transfer_attempted (bool), transfer_completed (bool)",
        model: "base", language: spec.language || "en",
      };

      // Voice + training parameters (mirror run-test-run for parity)
      globalSettings.voice = spec.voice_id || "maya";
      globalSettings.temperature = spec.temperature ?? 0.7;
      globalSettings.interruption_threshold = spec.interruption_threshold ?? 100;
      globalSettings.noise_cancellation = true;

      if (spec.speaking_speed && spec.speaking_speed !== 1.0) {
        globalSettings.voice_settings = { speed: spec.speaking_speed };
      }
      if (spec.pronunciation_guide && Array.isArray(spec.pronunciation_guide) && spec.pronunciation_guide.length > 0) {
        globalSettings.pronunciation_guide = spec.pronunciation_guide;
      }
      if (spec.transfer_required && spec.transfer_phone_number) {
        const digits = spec.transfer_phone_number.replace(/\D/g, "");
        if (digits.length >= 10) {
          globalSettings.transfer_phone_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
        }
      }

      // Use spec.from_number if set, otherwise pick from trusted pool
      if (spec.from_number) {
        globalSettings.from = spec.from_number;
      } else if (trustedNumbers && trustedNumbers.length > 0) {
        const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
        globalSettings.from = picked.phone_number;
        trustedNumberIndex++;
        // Update last_used_at
        await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
      }
      if (spec.background_track && spec.background_track !== "none") globalSettings.background_track = spec.background_track;
      globalSettings.answering_machine_detection = true;

      const blandResp = await fetch("https://api.bland.ai/v2/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": BLAND_API_KEY },
        body: JSON.stringify({ global: globalSettings, call_objects: callObjects }),
      });

      const blandData = await blandResp.json();
      if (!blandResp.ok) throw new Error(`Bland Batch API error [${blandResp.status}]: ${JSON.stringify(blandData)}`);

      const batchId = blandData.batch_id || blandData.id;
      await supabase.from("campaigns").update({ bland_batch_id: batchId }).eq("id", campaign_id);

      const contactIds = contacts.map((c: any) => c.id);
      await supabase.from("contacts").update({
        status: "calling", attempts: 1, called_at: new Date().toISOString(),
      }).in("id", contactIds);

      // Best-effort: resolve individual call IDs from batch so LiveCallMonitor works
      try {
        await new Promise(r => setTimeout(r, 3000));
        const batchDetailResp = await fetch(
          `https://api.bland.ai/v2/batches/${batchId}`,
          { headers: { Authorization: BLAND_API_KEY } }
        );
        if (batchDetailResp.ok) {
          const batchDetail = await batchDetailResp.json();
          const batchCalls = batchDetail.call_data || batchDetail.calls || [];
          for (const bc of batchCalls) {
            const callId = bc.call_id || bc.id;
            const phone = bc.phone_number || bc.to;
            if (callId && phone) {
              const match = contacts.find((c: any) => c.phone === phone);
              if (match) {
                await supabase.from("contacts")
                  .update({ bland_call_id: callId })
                  .eq("id", match.id);
              }
            }
          }
          console.log(`Resolved ${batchCalls.length} call IDs from batch ${batchId}`);
        }
      } catch (e) {
        console.error("Failed to resolve batch call IDs (non-fatal):", e);
      }

      return new Response(JSON.stringify({
        batch_id: batchId, contacts_dispatched: contacts.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("tick-campaign error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
