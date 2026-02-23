import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt, replaceTemplateVars } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tickStart = Date.now();
  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");
    console.log(`[tick-campaign] ===== START ===== campaign_id=${campaign_id}`);

    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");

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
    console.log(`[tick-campaign] org_id=${orgId}, project_id=${campaign.project_id}, status=${campaign.status}`);
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", orgId).single();
    console.log(`[tick-campaign] Credit balance: ${orgData?.credits_balance ?? 'N/A'}`);
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
    console.log(`[tick-campaign] Trusted outbound numbers: ${trustedNumbers?.length ?? 0}`, trustedNumbers?.map((n: any) => n.phone_number));

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", campaign.project_id).single();
    if (specErr) throw specErr;

    const retellAgentId = spec.retell_agent_id;
    if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
    console.log(`[tick-campaign] retell_agent_id=${retellAgentId}, spec_version=${spec.version}`);

    // Count currently active calls to enforce concurrency limit
    const { count: activeCalls } = await supabase
      .from("contacts").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id).eq("status", "calling");

    const slotsAvailable = campaign.max_concurrent_calls - (activeCalls || 0);
    console.log(`[tick-campaign] Active calls: ${activeCalls}, max: ${campaign.max_concurrent_calls}, slots available: ${slotsAvailable}`);
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

    // Inject HIPAA compliance guardrails when enabled
    const hipaaAppendix = campaign.hipaa_enabled ? `\n\n=== HIPAA COMPLIANCE RULES ===
- This call is recorded. You MUST disclose this at the start: "This call may be recorded for quality and compliance purposes."
- NEVER read back full SSN, date of birth, or policy/member ID numbers. Only confirm last 4 digits.
- Do NOT repeat or store specific medical diagnoses, conditions, or medication names in conversation summaries.
- You MUST obtain explicit verbal consent before collecting any health-related information.
- If leaving a voicemail: leave ONLY a callback number and a generic message. Do NOT include any health information, names of conditions, or reason for calling.
- Minimize collection of Protected Health Information (PHI) to only what is strictly necessary for the conversation objective.` : "";

    // --- Pre-flight: fetch agent, extract llm_id, fix transfer flags ---
    let agentLlmId: string | null = null;
    try {
      const agentCheckRes = await fetch(`https://api.retellai.com/get-agent/${retellAgentId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${RETELL_API_KEY}` },
      });
      const agentCheckData = await agentCheckRes.json();
      agentLlmId = agentCheckData.response_engine?.llm_id || null;

      if (agentCheckRes.ok && agentCheckData.is_transfer_agent) {
        await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
          body: JSON.stringify({ is_transfer_agent: false }),
        });
        if (agentLlmId) {
          await fetch(`https://api.retellai.com/update-retell-llm/${agentLlmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
            body: JSON.stringify({ is_transfer_llm: false }),
          });
        }
        console.log(`Auto-fixed transfer flags on agent ${retellAgentId}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Sync ambient_sound from spec
      const ambientSound = spec.background_track || null;
      if (ambientSound) {
        const ambientRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
          body: JSON.stringify({ ambient_sound: ambientSound }),
        });
        if (ambientRes.ok) {
          console.log(`Set ambient_sound to "${ambientSound}" on agent ${retellAgentId}`);
        } else {
          console.error("Failed to set ambient_sound:", await ambientRes.text());
        }
      }

      // Sync voice_id from spec
      if (spec.voice_id) {
        const voiceRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
          body: JSON.stringify({ voice_id: spec.voice_id }),
        });
        if (voiceRes.ok) {
          console.log(`Synced voice_id to "${spec.voice_id}" on agent ${retellAgentId}`);
        } else {
          console.error("Failed to sync voice_id:", await voiceRes.text());
        }
      }
    } catch (preflight: any) {
      console.error("Transfer agent pre-flight check failed:", preflight.message);
    }

    // --- Inject task prompt into Retell LLM ---
    if (agentLlmId) {
      let taskPrompt = buildTaskPrompt(spec, [], knowledgeBriefing, "") + hipaaAppendix;
      if (taskPrompt.length > 28000) taskPrompt = taskPrompt.substring(0, 28000) + "\n\n[Trimmed for length]";
      // Resolve opening line for begin_message
      const agentName = spec.persona_name || campaign.agent_projects?.name || "Agent";
      const resolvedOpening = spec.opening_line
        ? spec.opening_line
            .replace(/\{\{agent_name\}\}/gi, agentName)
            .replace(/\[Agent Name\]/gi, agentName)
        : null;

      // Build general_tools from spec
      const generalTools: any[] = [
        { type: "end_call", name: "end_call", description: "End the call when conversation is complete." }
      ];
      if (spec.transfer_required && spec.transfer_phone_number) {
        generalTools.push({
          type: "transfer_call",
          name: "transfer_to_agent",
          description: "Transfer the call to a live agent when the lead is qualified and ready.",
          number: spec.transfer_phone_number,
        });
      }

      const llmPatchBody: any = { general_prompt: taskPrompt, general_tools: generalTools };
      if (resolvedOpening) {
        llmPatchBody.begin_message = resolvedOpening;
      }

      try {
        const llmPromptRes = await fetch(`https://api.retellai.com/update-retell-llm/${agentLlmId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
          body: JSON.stringify(llmPatchBody),
        });
        if (llmPromptRes.ok) {
          console.log(`Injected campaign prompt into LLM ${agentLlmId} (${taskPrompt.length} chars, begin_message=${resolvedOpening ? 'set' : 'unchanged'})`);
        } else {
          console.error("Failed to update LLM prompt:", await llmPromptRes.text());
        }
      } catch (promptErr: any) {
        console.error("LLM prompt injection failed:", promptErr.message);
      }
    } else {
      console.warn("No llm_id found on Retell agent – cannot inject task prompt");
    }

    // Determine from_number for batch call
    let fromNumber = spec.from_number || null;
    console.log(`[tick-campaign] spec.from_number=${fromNumber}`);
    if (!fromNumber && trustedNumbers && trustedNumbers.length > 0) {
      const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
      fromNumber = picked.phone_number;
      trustedNumberIndex++;
      await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
    }

    console.log(`[tick-campaign] Selected from_number: ${fromNumber}`);
    // Guard: Retell requires from_number
    if (!fromNumber) {
      return new Response(JSON.stringify({
        error: "No outbound number available. Please add a trusted phone number in Settings > Phone Numbers, or set a From Number on your agent.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build tasks array for Retell batch API
    const tasks = contacts.map((contact: any) => {
      const firstName = contact.name?.trim().split(/\s+/)[0] || "";
      return {
        to_number: contact.phone,
        retell_llm_dynamic_variables: {
          first_name: firstName,
          agent_name: spec.persona_name || campaign.agent_projects?.name || "Agent",
          contact_name: contact.name || "",
          ...(contact.extra_data && typeof contact.extra_data === "object" ? contact.extra_data : {}),
        },
        metadata: {
          org_id: campaign.agent_projects.org_id,
          project_id: campaign.project_id,
          campaign_id,
          contact_id: contact.id,
          version: spec.version,
        },
      };
    });

    const batchPayload: any = {
      from_number: fromNumber,
      tasks,
      override_agent_id: retellAgentId,
    };
    console.log(`[tick-campaign] Batch payload: ${tasks.length} tasks, agent=${retellAgentId}, from=${fromNumber}`);
    console.log(`[tick-campaign] Task phones: ${tasks.map((t: any) => t.to_number).join(", ")}`);

    const retellResp = await fetch("https://api.retellai.com/create-batch-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${RETELL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(batchPayload),
    });
    const retellData = await retellResp.json();
    console.log("Retell Batch API response:", retellResp.status, JSON.stringify(retellData));

    if (!retellResp.ok) {
      throw new Error(`Retell Batch API error [${retellResp.status}]: ${JSON.stringify(retellData)}`);
    }

    const batchId = retellData.batch_call_id || retellData.id;
    if (batchId) {
      await supabase.from("campaigns").update({ retell_batch_id: batchId }).eq("id", campaign_id);
    }

    // Mark all contacts as calling
    const contactIds = contacts.map((c: any) => c.id);
    console.log(`[tick-campaign] Marking ${contactIds.length} contacts as calling: ${contactIds.join(", ")}`);
    await supabase.from("contacts").update({
      status: "calling", called_at: new Date().toISOString(),
    }).in("id", contactIds);

    console.log(`[tick-campaign] ===== DONE ===== ${Date.now() - tickStart}ms`);
    return new Response(JSON.stringify({
      provider: "retell", batch_id: batchId, contacts_dispatched: contacts.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`[tick-campaign] ERROR after ${Date.now() - tickStart}ms:`, err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
