import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt, resolveBeginMessage } from "../_shared/buildTaskPrompt.ts";
import { corsHeaders, requireAuth, requireOrgAccess, AuthError, unauthorizedResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let auth;
    try { auth = await requireAuth(req); } catch (e) {
      if (e instanceof AuthError) return unauthorizedResponse(e.message);
      throw e;
    }
    console.log(`[start-campaign] Authenticated user=${auth.userId} org=${auth.orgId}`);

    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");
    console.log(`[start-campaign] Starting campaign: ${campaign_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RETELL_API_KEY = Deno.env.get("RETELL_API_KEY");
    if (!RETELL_API_KEY) throw new Error("RETELL_API_KEY not configured");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch campaign with org info
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*, agent_projects!campaigns_agent_project_id_fkey(id, org_id)")
      .eq("id", campaign_id)
      .single();
    if (campErr) throw campErr;

    // Verify org access
    requireOrgAccess(auth, campaign.agent_projects.org_id);

    // Get spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", campaign.project_id).single();
    if (specErr) throw specErr;

    const retellAgentId = spec.retell_agent_id;
    if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");
    console.log(`[start-campaign] retell_agent_id=${retellAgentId}, spec_version=${spec.version}`);

    // ===== PRE-FLIGHT: Knowledge summarization =====
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

    // ===== PRE-FLIGHT: Load global human behaviors =====
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

    // ===== PRE-FLIGHT: HIPAA compliance injection =====
    const hipaaAppendix = campaign.hipaa_enabled ? `\n\n=== HIPAA COMPLIANCE RULES ===
- This call is recorded. You MUST disclose this at the start: "This call may be recorded for quality and compliance purposes."
- NEVER read back full SSN, date of birth, or policy/member ID numbers. Only confirm last 4 digits.
- Do NOT repeat or store specific medical diagnoses, conditions, or medication names in conversation summaries.
- You MUST obtain explicit verbal consent before collecting any health-related information.
- If leaving a voicemail: leave ONLY a callback number and a generic message. Do NOT include any health information, names of conditions, or reason for calling.
- Minimize collection of Protected Health Information (PHI) to only what is strictly necessary for the conversation objective.` : "";

    // ===== PRE-FLIGHT: Fetch agent, fix transfer flags, sync settings =====
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

      // Sync agent-level settings from spec (voice, name, ambient sound, speed, interruption)
      const agentSyncPatch: Record<string, unknown> = {};
      if (spec.voice_id) agentSyncPatch.voice_id = spec.voice_id;
      if (spec.persona_name) agentSyncPatch.agent_name = spec.persona_name;
      const ambientSound = spec.background_track || null;
      if (ambientSound) agentSyncPatch.ambient_sound = ambientSound;
      if (spec.speaking_speed != null) agentSyncPatch.voice_speed = Number(spec.speaking_speed);
      if (spec.interruption_threshold != null) {
        agentSyncPatch.interruption_sensitivity = Math.min(1, Math.max(0, Number(spec.interruption_threshold) / 100));
      }

      if (Object.keys(agentSyncPatch).length > 0) {
        const syncRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RETELL_API_KEY}` },
          body: JSON.stringify(agentSyncPatch),
        });
        if (syncRes.ok) {
          console.log(`Synced agent settings on ${retellAgentId}`);
        } else {
          console.error("Failed to sync agent settings:", await syncRes.text());
        }
      }
    } catch (preflight: any) {
      console.error("Transfer agent pre-flight check failed:", preflight.message);
    }

    // ===== PRE-FLIGHT: Inject task prompt into Retell LLM =====
    if (agentLlmId) {
      let taskPrompt = buildTaskPrompt(spec, [], knowledgeBriefing, "") + hipaaAppendix;
      if (taskPrompt.length > 28000) taskPrompt = taskPrompt.substring(0, 28000) + "\n\n[Trimmed for length]";
      const agentName = spec.persona_name || campaign.agent_projects?.name || "Agent";
      const resolvedOpening = spec.opening_line
        ? resolveBeginMessage(spec.opening_line, agentName)
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
          transfer_destination: {
            type: "predefined",
            number: spec.transfer_phone_number,
            ignore_e164_validation: false,
          },
          transfer_option: {
            type: "cold_transfer",
            show_transferee_as_caller: false,
          },
        });
      }

      const llmPatchBody: any = {
        general_prompt: taskPrompt,
        general_tools: generalTools,
      };
      if (resolvedOpening) {
        llmPatchBody.begin_message = resolvedOpening;
      }
      if (spec.temperature != null) {
        llmPatchBody.model_temperature = Number(spec.temperature);
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
    if (err instanceof AuthError) return unauthorizedResponse(err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
