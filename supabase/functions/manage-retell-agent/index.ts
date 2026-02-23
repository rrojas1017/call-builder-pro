import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETELL_BASE = "https://api.retellai.com";

/** Standard extraction fields for post-call analysis */
const STANDARD_ANALYSIS_FIELDS = [
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

/** Build post_call_analysis_data, merging standard fields with any custom must_collect_fields */
function buildPostCallAnalysisFields(mustCollectFields?: unknown): Array<{ name: string; type: string; description: string }> {
  const fields = [...STANDARD_ANALYSIS_FIELDS];
  const existingNames = new Set(fields.map(f => f.name));

  if (Array.isArray(mustCollectFields)) {
    for (const field of mustCollectFields) {
      const fieldName = typeof field === "string" ? field : field?.name;
      if (fieldName && !existingNames.has(fieldName)) {
        fields.push({ name: fieldName, type: "string", description: `Custom field: ${fieldName}` });
        existingNames.add(fieldName);
      }
    }
  }
  return fields;
}

function buildAgentBody(config: Record<string, any>, webhookUrl: string): Record<string, unknown> {
  const voiceId = config.voice_id || "11labs-Adrian";
  const body: Record<string, unknown> = {
    agent_name: config.agent_name || "Appendify Agent",
    voice_id: voiceId,
    language: config.language || "en-US",
    webhook_url: webhookUrl,
    // Enhanced Retell features
    normalize_for_speech: true,
    enable_backchannel: config.enable_backchannel !== false,
    enable_dynamic_voice_speed: true,
    post_call_analysis_data: buildPostCallAnalysisFields(config?.must_collect_fields),
  };

  // Voice speed from spec's speaking_speed
  if (config.speaking_speed != null) {
    body.voice_speed = Number(config.speaking_speed);
  }

  // Interruption sensitivity: spec uses 0-100, Retell uses 0-1
  if (config.interruption_threshold != null) {
    body.interruption_sensitivity = Math.min(1, Math.max(0, Number(config.interruption_threshold) / 100));
  }

  // Voicemail detection + message
  if (config.voicemail_message) {
    body.enable_voicemail_detection = true;
    body.voicemail_message = config.voicemail_message;
  }

  // Pronunciation dictionary from spec
  if (config.pronunciation_guide && Array.isArray(config.pronunciation_guide) && config.pronunciation_guide.length > 0) {
    body.pronunciation_dictionary = config.pronunciation_guide;
  }

  // Ambient sound
  if (config.ambient_sound) {
    body.ambient_sound = config.ambient_sound;
  }

  // Boosted keywords from knowledge
  if (config.boosted_keywords && Array.isArray(config.boosted_keywords) && config.boosted_keywords.length > 0) {
    body.boosted_keywords = config.boosted_keywords.slice(0, 100);
  }

  // Responsiveness
  if (config.responsiveness != null) {
    body.responsiveness = Number(config.responsiveness);
  }

  // Max call duration
  if (config.max_call_duration_ms) {
    body.max_call_duration_ms = config.max_call_duration_ms;
  }

  // End call after silence
  if (config.end_call_after_silence_ms) {
    body.end_call_after_silence_ms = config.end_call_after_silence_ms;
  }

  return body;
}

/** Build enhanced LLM body */
function buildLlmBody(config: Record<string, any>): Record<string, unknown> {
  const llmBody: Record<string, unknown> = {};

  // Use Custom LLM WebSocket URL for live transcription
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const wsUrl = supabaseUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");
  llmBody.llm_websocket_url = `${wsUrl}/functions/v1/retell-llm-ws`;

  if (config.general_prompt) {
    const trimmedPrompt = config.general_prompt.length > 28000
      ? config.general_prompt.substring(0, 28000) + "\n\n[Trimmed for length]"
      : config.general_prompt;
    llmBody.general_prompt = trimmedPrompt;
  }

  // Opening line → begin_message
  if (config.opening_line) {
    llmBody.begin_message = config.opening_line;
  }

  // Temperature mapping
  if (config.temperature != null) {
    llmBody.model_temperature = Number(config.temperature);
  }

  // Model selection (kept as fallback context, Custom LLM takes priority)
  if (config.llm_model) {
    llmBody.model = config.llm_model;
  }

  // Build general_tools
  const tools: any[] = [];
  tools.push({
    type: "end_call",
    name: "end_call",
    description: "End the call when the conversation is complete, the user requests to end the call, or you've completed your objective.",
  });

  if (config.transfer_required && config.transfer_phone_number) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_agent",
      description: "Transfer the call to a live agent when the lead is qualified and ready.",
      transfer_destination: {
        type: "predefined",
        number: config.transfer_phone_number,
        ignore_e164_validation: false,
      },
      transfer_option: {
        type: "cold_transfer",
        show_transferee_as_caller: false,
      },
    });
  }

  if (tools.length > 0) {
    llmBody.general_tools = tools;
  }

  return llmBody;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RETELL_API_KEY");
    if (!apiKey) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

    const { action, agent_id, config } = await req.json();

    if (action === "create") {
      // Check if an existing agent_id was provided and still exists in Retell
      if (config?.existing_agent_id) {
        try {
          const checkRes = await fetch(`${RETELL_BASE}/get-agent/${config.existing_agent_id}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (checkRes.ok) {
            // Agent exists — update it instead of creating a new one
            console.log(`Agent ${config.existing_agent_id} already exists, updating instead of creating`);
            const body = buildAgentBody(config || {}, webhookUrl);
            const llmBody = buildLlmBody(config || {});
            
            const updateRes = await fetch(`${RETELL_BASE}/update-agent/${config.existing_agent_id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify(body),
            });
            const updateData = await updateRes.json();
            if (!updateRes.ok) throw new Error(updateData.error_message || JSON.stringify(updateData));

            // Also update the LLM
            const llmId = updateData.response_engine?.llm_id;
            if (llmId && Object.keys(llmBody).length > 0) {
              const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(llmBody),
              });
              if (!llmRes.ok) console.error("Failed to update existing LLM:", await llmRes.json());
            }

            return new Response(JSON.stringify(updateData), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (e) {
          console.log(`Existing agent ${config.existing_agent_id} not found, creating new one`);
        }
      }

      // Step 1: Create LLM first
      let llmId = config?.llm_id;
      if (!llmId) {
        const llmBody = buildLlmBody(config || {});
        const llmRes = await fetch(`${RETELL_BASE}/create-retell-llm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(llmBody),
        });
        const llmData = await llmRes.json();
        if (!llmRes.ok) throw new Error(`Failed to create LLM: ${llmData.error_message || JSON.stringify(llmData)}`);
        llmId = llmData.llm_id;
        console.log(`Created Retell LLM: ${llmId}`);
      }

      // Step 2: Create agent with enhanced settings
      const body = buildAgentBody(config || {}, webhookUrl);
      body.response_engine = { type: "retell-llm", llm_id: llmId };
      body.is_transfer_agent = false;

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      // If llm_id was provided (not auto-created), inject prompt into existing LLM
      if (config?.llm_id && config?.general_prompt) {
        const finalLlmId = data.response_engine?.llm_id || config.llm_id;
        const llmBody = buildLlmBody(config);
        try {
          const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${finalLlmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(llmBody),
          });
          const llmData = await llmRes.json();
          if (!llmRes.ok) console.error("Failed to set LLM config:", llmData);
          else console.log(`Configured LLM ${finalLlmId}`);
        } catch (promptErr) {
          console.error("LLM config injection failed:", promptErr);
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!agent_id) throw new Error("agent_id required for update");

      const body: Record<string, unknown> = { webhook_url: webhookUrl };
      if (config?.agent_name) body.agent_name = config.agent_name;
      if (config?.voice_id) {
        body.voice_id = config.voice_id;
      }
      if (config?.language) body.language = config.language;

      // Enhanced settings on update
      if (config?.speaking_speed != null) body.voice_speed = Number(config.speaking_speed);
      if (config?.interruption_threshold != null) {
        body.interruption_sensitivity = Math.min(1, Math.max(0, Number(config.interruption_threshold) / 100));
      }
      if (config?.voicemail_message) {
        body.enable_voicemail_detection = true;
        body.voicemail_message = config.voicemail_message;
      }
      if (config?.pronunciation_guide && Array.isArray(config.pronunciation_guide) && config.pronunciation_guide.length > 0) {
        body.pronunciation_dictionary = config.pronunciation_guide;
      }
      if (config?.boosted_keywords && Array.isArray(config.boosted_keywords)) {
        body.boosted_keywords = config.boosted_keywords.slice(0, 100);
      }
      if (config?.ambient_sound) body.ambient_sound = config.ambient_sound;

      // Always ensure good defaults
      body.normalize_for_speech = true;
      body.enable_backchannel = config?.enable_backchannel !== false;
      body.enable_dynamic_voice_speed = true;

      const res = await fetch(`${RETELL_BASE}/update-agent/${agent_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      // Also update LLM if we have LLM-level config changes
      if (config?.opening_line || config?.temperature != null || config?.transfer_required != null) {
        const llmId = data.response_engine?.llm_id;
        if (llmId) {
          const llmBody = buildLlmBody(config);
          if (Object.keys(llmBody).length > 0) {
            try {
              const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(llmBody),
              });
              if (!llmRes.ok) {
                const llmErr = await llmRes.json();
                console.error("Failed to update LLM:", llmErr);
              }
            } catch (e) {
              console.error("LLM update failed:", e);
            }
          }
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      if (!agent_id) throw new Error("agent_id required for get");
      const res = await fetch(`${RETELL_BASE}/get-agent/${agent_id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "switch_to_outbound") {
      if (!agent_id) throw new Error("agent_id required for switch_to_outbound");

      const agentRes = await fetch(`${RETELL_BASE}/get-agent/${agent_id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const agentData = await agentRes.json();
      if (!agentRes.ok) throw new Error(agentData.error_message || agentData.message || JSON.stringify(agentData));

      const llmId = agentData.response_engine?.llm_id;
      if (!llmId) throw new Error("No LLM ID found on this agent. Cannot switch to outbound.");

      const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ is_transfer_llm: false }),
      });
      const llmData = await llmRes.json();
      if (!llmRes.ok) throw new Error(llmData.error_message || llmData.message || JSON.stringify(llmData));

      const agentPatchRes = await fetch(`${RETELL_BASE}/update-agent/${agent_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ is_transfer_agent: false }),
      });
      const agentPatchData = await agentPatchRes.json();
      if (!agentPatchRes.ok) throw new Error(agentPatchData.error_message || agentPatchData.message || JSON.stringify(agentPatchData));

      const refreshRes = await fetch(`${RETELL_BASE}/get-agent/${agent_id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) throw new Error(refreshData.error_message || refreshData.message || JSON.stringify(refreshData));

      return new Response(JSON.stringify(refreshData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}. Use "create", "update", "get", or "switch_to_outbound".`);
  } catch (err) {
    console.error("manage-retell-agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
