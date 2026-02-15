import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_id, campaign_name } = await req.json();
    if (!agent_id) throw new Error("agent_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch agent details
    const { data: project } = await supabase
      .from("agent_projects")
      .select("name, description")
      .eq("id", agent_id)
      .single();

    const { data: spec } = await supabase
      .from("agent_specs")
      .select("opening_line, tone_style, use_case")
      .eq("project_id", agent_id)
      .single();

    const agentName = project?.name || "the agent";
    const description = project?.description || "";
    const tone = spec?.tone_style || "professional and friendly";
    const useCase = spec?.use_case || "";
    const campaignContext = campaign_name ? ` for a campaign called "${campaign_name}"` : "";

    const prompt = `Write a concise voicemail message (under 30 seconds when spoken aloud) for an AI calling agent named "${agentName}"${campaignContext}.

Agent context:
- Description: ${description}
- Use case: ${useCase}
- Tone: ${tone}

Requirements:
- Sound natural and human, not robotic
- Match the specified tone
- Include a brief reason for calling
- Ask them to call back
- Do NOT include placeholder brackets or variables — write the final message ready to be spoken
- Keep it under 60 words

Return ONLY the voicemail message text, nothing else.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write short, natural-sounding voicemail messages for AI calling agents." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const message = aiData.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-voicemail-message error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
