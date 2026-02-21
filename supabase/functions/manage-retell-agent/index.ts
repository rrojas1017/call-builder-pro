import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETELL_BASE = "https://api.retellai.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RETELL_API_KEY");
    if (!apiKey) throw new Error("RETELL_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/receive-retell-webhook`;

    const { action, agent_id, config } = await req.json();

    if (action === "create") {
      // Step 1: Ensure we have an llm_id. If not provided, create a Retell LLM first.
      let llmId = config?.llm_id;
      if (!llmId) {
        const llmBody: Record<string, unknown> = {};
        if (config?.general_prompt) {
          const trimmedPrompt = config.general_prompt.length > 28000
            ? config.general_prompt.substring(0, 28000) + "\n\n[Trimmed for length]"
            : config.general_prompt;
          llmBody.general_prompt = trimmedPrompt;
        }
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

      // Step 2: Create the agent with the llm_id
      const body: Record<string, unknown> = {
        agent_name: config?.agent_name || "Appendify Agent",
        voice_id: config?.voice_id || undefined,
        language: config?.language || "en-US",
        webhook_url: webhookUrl,
        response_engine: { type: "retell-llm", llm_id: llmId },
        post_call_analysis_data: [
          { description: "Whether the lead was qualified", name: "qualified", type: "boolean" },
          { description: "Brief summary of the call", name: "call_summary", type: "string" },
        ],
      };

      // Remove undefined values
      if (!body.voice_id) delete body.voice_id;

      const res = await fetch(`${RETELL_BASE}/create-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      // If llm_id was provided (not auto-created), inject prompt into existing LLM
      if (config?.llm_id && config?.general_prompt) {
        const finalLlmId = data.response_engine?.llm_id || config.llm_id;
        const trimmedPrompt = config.general_prompt.length > 28000
          ? config.general_prompt.substring(0, 28000) + "\n\n[Trimmed for length]"
          : config.general_prompt;
        try {
          const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${finalLlmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ general_prompt: trimmedPrompt }),
          });
          const llmData = await llmRes.json();
          if (!llmRes.ok) console.error("Failed to set LLM prompt:", llmData);
          else console.log(`Injected prompt into LLM ${finalLlmId} (${trimmedPrompt.length} chars)`);
        } catch (promptErr) {
          console.error("LLM prompt injection failed:", promptErr);
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!agent_id) throw new Error("agent_id required for update");

      const body: Record<string, unknown> = {};
      if (config?.agent_name) body.agent_name = config.agent_name;
      // Only send voice_id if it looks like a Retell voice ID (contains a dash or starts with known prefixes)
      if (config?.voice_id && (config.voice_id.includes("-") || config.voice_id.startsWith("eleven_"))) {
        body.voice_id = config.voice_id;
      }
      if (config?.language) body.language = config.language;
      // Always ensure webhook is set correctly
      body.webhook_url = webhookUrl;

      const res = await fetch(`${RETELL_BASE}/update-agent/${agent_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

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

      // 1. Get agent to find LLM ID
      const agentRes = await fetch(`${RETELL_BASE}/get-agent/${agent_id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const agentData = await agentRes.json();
      if (!agentRes.ok) throw new Error(agentData.error_message || agentData.message || JSON.stringify(agentData));

      const llmId = agentData.response_engine?.llm_id;
      if (!llmId) throw new Error("No LLM ID found on this agent. Cannot switch to outbound.");

      // 2. Patch LLM to disable transfer mode
      const llmRes = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ is_transfer_llm: false }),
      });
      const llmData = await llmRes.json();
      if (!llmRes.ok) throw new Error(llmData.error_message || llmData.message || JSON.stringify(llmData));

      // 2b. Patch agent-level transfer flag
      const agentPatchRes = await fetch(`${RETELL_BASE}/update-agent/${agent_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ is_transfer_agent: false }),
      });
      const agentPatchData = await agentPatchRes.json();
      if (!agentPatchRes.ok) throw new Error(agentPatchData.error_message || agentPatchData.message || JSON.stringify(agentPatchData));

      // 3. Re-fetch agent to return updated config
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
