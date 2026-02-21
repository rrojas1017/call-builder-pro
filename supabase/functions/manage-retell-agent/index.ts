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
      const body: Record<string, unknown> = {
        agent_name: config?.agent_name || "Appendify Agent",
        voice_id: config?.voice_id || undefined,
        language: config?.language || "en-US",
        response_engine: {
          type: "retell-llm",
          llm_id: config?.llm_id || undefined,
        },
        webhook_url: webhookUrl,
        post_call_analysis_data: [
          { description: "Whether the lead was qualified", name: "qualified", type: "boolean" },
          { description: "Brief summary of the call", name: "call_summary", type: "string" },
        ],
      };

      // Remove undefined values
      if (!body.voice_id) delete body.voice_id;
      const responseEngine = body.response_engine as Record<string, unknown>;
      if (!responseEngine.llm_id) delete responseEngine.llm_id;

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
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || data.message || JSON.stringify(data));

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}. Use "create", "update", or "get".`);
  } catch (err) {
    console.error("manage-retell-agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
