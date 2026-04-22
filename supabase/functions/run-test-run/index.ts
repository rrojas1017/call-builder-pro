import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildTaskPrompt, replaceTemplateVars, resolveBeginMessage } from "../_shared/buildTaskPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { test_run_id } = await req.json();
    if (!test_run_id) throw new Error("test_run_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const retellApiKey = Deno.env.get("RETELL_API_KEY");
    if (!retellApiKey) throw new Error("RETELL_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load test run
    const { data: testRun, error: trErr } = await supabase
      .from("test_runs").select("*").eq("id", test_run_id).single();
    if (trErr) throw trErr;

    // Check org credit balance
    const { data: orgData } = await supabase
      .from("organizations").select("credits_balance").eq("id", testRun.org_id).single();
    if (!orgData || orgData.credits_balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits. Please top up your balance." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check concurrency
    const { data: callingContacts } = await supabase
      .from("test_run_contacts").select("id").eq("test_run_id", test_run_id).eq("status", "calling");

    const slotsAvailable = testRun.concurrency - (callingContacts?.length || 0);
    if (slotsAvailable <= 0) {
      return new Response(JSON.stringify({ initiated_count: 0, message: "All slots busy" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get queued contacts
    const { data: queuedContacts, error: qErr } = await supabase
      .from("test_run_contacts").select("*")
      .eq("test_run_id", test_run_id).eq("status", "queued")
      .order("created_at", { ascending: true }).limit(slotsAvailable);
    if (qErr) throw qErr;

    if (!queuedContacts?.length) {
      const { data: remaining } = await supabase
        .from("test_run_contacts").select("id")
        .eq("test_run_id", test_run_id).in("status", ["queued", "calling"]);
      if (!remaining?.length) {
        await supabase.from("test_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", test_run_id);
      }
      return new Response(JSON.stringify({ initiated_count: 0, message: "No queued contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load agent spec
    const { data: spec } = await supabase
      .from("agent_specs").select("*").eq("project_id", testRun.project_id).single();

    // Load trusted outbound numbers for rotation
    const { data: trustedNumbers } = await supabase
      .from("outbound_numbers").select("id, phone_number")
      .eq("org_id", testRun.org_id).eq("status", "trusted")
      .order("last_used_at", { ascending: true, nullsFirst: true });
    let trustedNumberIndex = 0;

    // Summarize agent knowledge via AI
    let knowledgeBriefing = "";
    try {
      const { data: summaryData, error: summaryErr } = await supabase.functions.invoke("summarize-agent-knowledge", {
        body: { project_id: testRun.project_id },
      });
      if (summaryErr) {
        console.error("Knowledge summarization error:", summaryErr);
      } else if (summaryData?.briefing) {
        knowledgeBriefing = summaryData.briefing;
        console.log(`Knowledge briefing: ${summaryData.entries_count} entries → ${knowledgeBriefing.length} chars`);
      }
    } catch (sumErr: any) {
      console.error("Failed to invoke summarize-agent-knowledge:", sumErr.message);
    }

    // Load global human behaviors (limit 10)
    const { data: globalBehaviors } = await supabase
      .from("global_human_behaviors").select("content")
      .order("created_at", { ascending: false })
      .limit(10);

    const globalTechniques = (globalBehaviors || []).map((g: any) => g.content as string);

    // Merge global behaviors into spec's humanization_notes (deduped)
    if (spec && globalTechniques.length > 0) {
      const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
      const existingLower = new Set(currentNotes.map((n: string) => n.toLowerCase().trim()));
      const newGlobal = globalTechniques.filter((t: string) => !existingLower.has(t.toLowerCase().trim()));
      spec.humanization_notes = [...currentNotes, ...newGlobal];
    }

    let retellAgentId = spec?.retell_agent_id;

    // Auto-provision if retell_agent_id is missing
    if (!retellAgentId && spec) {
      console.log(`retell_agent_id missing for spec ${spec.id} — auto-provisioning…`);
      try {
        const provisionRes = await supabase.functions.invoke("manage-retell-agent", {
          body: {
            action: "create",
            config: {
              agent_name: spec.persona_name || "Appendify Agent",
              voice_id: spec.voice_id || undefined,
              language: spec.language || "en",
              general_prompt: agentInstructionsText || spec.opening_line || undefined,
              opening_line: spec.opening_line || undefined,
              temperature: spec.temperature ?? undefined,
              speaking_speed: spec.speaking_speed ?? undefined,
              interruption_threshold: spec.interruption_threshold ?? undefined,
              voicemail_message: spec.voicemail_message || undefined,
              pronunciation_guide: spec.pronunciation_guide || undefined,
              transfer_required: spec.transfer_required ?? false,
              transfer_phone_number: spec.transfer_phone_number || undefined,
              must_collect_fields: spec.must_collect_fields || undefined,
            },
          },
        });
        if (provisionRes.error) throw new Error(`Provisioning invoke error: ${provisionRes.error.message}`);
        const provisionData = provisionRes.data as any;
        if (provisionData?.error) throw new Error(`Provisioning returned error: ${provisionData.error}`);
        const newAgentId = provisionData?.agent_id;
        if (newAgentId) {
          retellAgentId = newAgentId;
          // Persist to spec so future runs don't re-provision
          await supabase.from("agent_specs").update({ retell_agent_id: newAgentId }).eq("id", spec.id);
          console.log(`✅ Auto-provisioned retell agent: ${retellAgentId}`);
          // Update spec in-memory for the rest of this run
          spec.retell_agent_id = retellAgentId;
        } else {
          throw new Error(provisionData?.error || "No agent_id returned from provisioning");
        }
      } catch (provErr: any) {
        console.error("Auto-provisioning failed:", provErr.message);
        throw new Error(`Agent not provisioned and auto-provisioning failed: ${provErr.message}`);
      }
    }

    if (!retellAgentId) throw new Error("retell_agent_id not set on agent spec");

    const callIds: string[] = [];

    // Pre-flight: fetch agent to get llm_id, fix transfer flag, and sync ambient_sound
    let agentLlmId: string | null = null;
    try {
      const agentCheckRes = await fetch(`https://api.retellai.com/get-agent/${retellAgentId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${retellApiKey}` },
      });
      const agentCheckData = await agentCheckRes.json();

      agentLlmId = agentCheckData.response_engine?.llm_id || null;

      if (agentCheckRes.ok && agentCheckData.is_transfer_agent) {
        const agentPatchRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
          body: JSON.stringify({ is_transfer_agent: false }),
        });
        if (agentPatchRes.ok) {
          console.log(`Auto-switched agent ${retellAgentId} is_transfer_agent to false`);
        } else {
          console.error("Failed to patch agent is_transfer_agent:", await agentPatchRes.text());
        }

        if (agentLlmId) {
          const llmPatchRes = await fetch(`https://api.retellai.com/update-retell-llm/${agentLlmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
            body: JSON.stringify({ is_transfer_llm: false }),
          });
          if (llmPatchRes.ok) {
            console.log(`Auto-switched LLM ${agentLlmId} is_transfer_llm to false`);
          } else {
            console.error("Failed to patch LLM is_transfer_llm:", await llmPatchRes.text());
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Sync ambient_sound and post_call_analysis_data from spec
      const agentPatch: Record<string, unknown> = {};
      if (spec?.voice_id) agentPatch.voice_id = spec.voice_id;
      if (spec?.persona_name) agentPatch.agent_name = spec.persona_name;
      const ambientSound = spec?.background_track || null;
      if (ambientSound) agentPatch.ambient_sound = ambientSound;
      // Sync voice tuning settings
      if (spec?.speaking_speed != null) agentPatch.voice_speed = Number(spec.speaking_speed);
      if (spec?.interruption_threshold != null) {
        agentPatch.interruption_sensitivity = Math.min(1, Math.max(0, Number(spec.interruption_threshold) / 100));
      }

      // Build comprehensive post_call_analysis_data
      const standardFields = [
        { name: "qualified", type: "boolean", description: "Whether the lead was qualified for transfer" },
        { name: "caller_name", type: "string", description: "The caller's full name" },
        { name: "email", type: "string", description: "The caller's email address" },
        { name: "state", type: "string", description: "The caller's US state" },
        { name: "zip_code", type: "string", description: "The caller's 5-digit zip code" },
        { name: "age", type: "string", description: "The caller's age" },
        { name: "household_size", type: "string", description: "Number of people in household" },
        { name: "income_est_annual", type: "string", description: "Estimated annual household income" },
        { name: "coverage_type", type: "string", description: "Current health coverage type" },
        { name: "consent", type: "boolean", description: "Whether the caller gave consent to continue" },
        { name: "transferred", type: "boolean", description: "Whether the call was transferred" },
        { name: "call_summary", type: "string", description: "Brief summary of the call" },
      ];
      const existingNames = new Set(standardFields.map(f => f.name));
      if (Array.isArray(spec?.must_collect_fields)) {
        for (const field of spec.must_collect_fields) {
          const fieldName = typeof field === "string" ? field : (field as any)?.name;
          if (fieldName && !existingNames.has(fieldName)) {
            standardFields.push({ name: fieldName, type: "string", description: `Custom field: ${fieldName}` });
            existingNames.add(fieldName);
          }
        }
      }
      agentPatch.post_call_analysis_data = standardFields;

      if (Object.keys(agentPatch).length > 0) {
        const patchRes = await fetch(`https://api.retellai.com/update-agent/${retellAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
          body: JSON.stringify(agentPatch),
        });
        if (patchRes.ok) {
          console.log(`Synced agent settings (ambient_sound, post_call_analysis_data) on ${retellAgentId}`);
        } else {
          console.error("Failed to sync agent settings:", await patchRes.text());
        }
      }
    } catch (preflight: any) {
      console.error("Transfer agent pre-flight check failed:", preflight.message);
    }

    // Build the task prompt — always rebuild from latest spec so feedback-driven changes are picked up
    const retellTaskPrompt = spec
      ? buildTaskPrompt(spec, [], knowledgeBriefing, "")
      : (testRun.agent_instructions_text || "Conduct a professional outbound call.");
    const trimmedRetellPrompt = retellTaskPrompt.length > 28000
      ? retellTaskPrompt.substring(0, 28000) + "\n\n[Trimmed for length]"
      : retellTaskPrompt;

    // Inject prompt into the Retell LLM
    if (agentLlmId) {
      try {
        // Build general_tools from spec
        const generalTools: any[] = [
          { type: "end_call", name: "end_call", description: "End the call when conversation is complete." }
        ];
        if (spec?.transfer_required && spec?.transfer_phone_number) {
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

        // Resolve begin_message: strip {{first_name}} since it's a static LLM field
        const agentName = spec?.persona_name || "Agent";
        const resolvedOpening = spec?.opening_line
          ? resolveBeginMessage(spec.opening_line, agentName)
          : null;

        const llmPatchBody: Record<string, unknown> = {
          general_prompt: trimmedRetellPrompt,
          general_tools: generalTools,
        };
        if (resolvedOpening) {
          llmPatchBody.begin_message = resolvedOpening;
        }
        if (spec?.temperature != null) {
          llmPatchBody.model_temperature = Number(spec.temperature);
        }

        const llmPromptRes = await fetch(`https://api.retellai.com/update-retell-llm/${agentLlmId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
          body: JSON.stringify(llmPatchBody),
        });
        if (llmPromptRes.ok) {
          console.log(`Injected task prompt into LLM ${agentLlmId} (${trimmedRetellPrompt.length} chars)`);
        } else {
          console.error("Failed to update LLM prompt:", await llmPromptRes.text());
        }
      } catch (promptErr: any) {
        console.error("LLM prompt injection failed:", promptErr.message);
      }
    } else {
      console.warn("No llm_id found on Retell agent – cannot inject task prompt");
    }

    for (const contact of queuedContacts) {
      try {
        const firstName = contact.name?.trim().split(/\s+/)[0] || "";
        const retellPayload: any = {
          override_agent_id: retellAgentId,
          to_number: contact.phone,
          retell_llm_dynamic_variables: {
            first_name: firstName,
            agent_name: spec?.persona_name || "",
            contact_name: contact.name?.trim() || "",
          },
          metadata: {
            test_run_id, test_run_contact_id: contact.id,
            org_id: testRun.org_id, project_id: testRun.project_id,
            spec_version: testRun.spec_version,
            language: spec?.language || "en-US",
          },
        };
        if (spec?.from_number) {
          retellPayload.from_number = spec.from_number;
        } else if (trustedNumbers && trustedNumbers.length > 0) {
          const picked = trustedNumbers[trustedNumberIndex % trustedNumbers.length];
          retellPayload.from_number = picked.phone_number;
          trustedNumberIndex++;
          await supabase.from("outbound_numbers").update({ last_used_at: new Date().toISOString() }).eq("id", picked.id);
        }

        // Guard: Retell requires from_number
        if (!retellPayload.from_number) {
          await supabase.from("test_run_contacts").update({
            status: "failed",
            error: "No outbound number available. Please add a trusted phone number in Settings > Phone Numbers, or set a From Number on your agent.",
          }).eq("id", contact.id);
          continue;
        }

        // Retry loop for transfer agent propagation delay
        let retellData: any = {};
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const retellResp = await fetch("https://api.retellai.com/v2/create-phone-call", {
            method: "POST",
            headers: { Authorization: `Bearer ${retellApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(retellPayload),
          });
          retellData = await retellResp.json();
          console.log(`Retell API response (attempt ${attempt}):`, retellResp.status, JSON.stringify(retellData));

          const errMsg = retellData.message || retellData.error || "";
          if (typeof errMsg === "string" && errMsg.includes("Transfer agents cannot be used for outbound calls") && attempt < maxRetries) {
            console.warn(`Transfer agent not yet propagated, retrying in 3s (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
          break;
        }

        if (retellData.call_id) {
          callIds.push(retellData.call_id);
          // Build initial transcript from the opening line so the UI shows it immediately
          const agentName = spec?.persona_name || "Agent";
          const resolvedOpening = spec?.opening_line
            ? spec.opening_line.replace(/\{\{agent_name\}\}/gi, agentName)
            : null;
          const initialTranscript = resolvedOpening ? `Agent: ${resolvedOpening}` : null;
          await supabase.from("test_run_contacts").update({
            status: "calling", retell_call_id: retellData.call_id, called_at: new Date().toISOString(),
            ...(initialTranscript ? { transcript: initialTranscript } : {}),
          } as any).eq("id", contact.id);
        } else {
          await supabase.from("test_run_contacts").update({
            status: "failed", error: retellData.message || retellData.error || JSON.stringify(retellData),
          }).eq("id", contact.id);
        }
      } catch (callErr: any) {
        await supabase.from("test_run_contacts").update({ status: "failed", error: callErr.message }).eq("id", contact.id);
      }
    }

    if (testRun.status === "draft") {
      await supabase.from("test_runs").update({ status: "running" }).eq("id", test_run_id);
    }

    return new Response(JSON.stringify({
      initiated_count: callIds.length,
      call_ids: callIds,
      provider: "retell",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("run-test-run error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
