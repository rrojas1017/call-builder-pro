import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      type,
      persona_name,
      use_case,
      language,
      tone_style,
      must_collect_fields,
      current_opening_line,
      user_prompt,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an expert call center script designer specializing in AI voice agent conversations. You follow these best practices:

1. OPENING LINES: Keep them under 30 words. Use the prospect's first name. State who you are and why you're calling within the first sentence. Sound human, not robotic.
2. DISCLOSURE: Recording consent should come naturally, not as the first thing said.
3. FIELD COLLECTION: Don't rapid-fire questions. Weave data collection into natural conversation. Confirm understanding before moving on.
4. OBJECTION HANDLING: Anticipate common objections and have natural pivot responses.
5. PACING: Use filler words sparingly (um, well) for naturalness. Pause after important information.
6. TRANSFER: Warm-transfer by summarizing what was discussed before handing off.
7. Use {{first_name}} and {{agent_name}} as template variables in opening lines.

Current agent config:
- Persona: ${persona_name || "Not set"}
- Use case: ${use_case || "general"}
- Language: ${language || "en"}
- Tone: ${tone_style || "friendly, professional"}
- Fields to collect: ${(must_collect_fields || []).join(", ") || "none specified"}
- Current opening line: ${current_opening_line || "none"}`;

    const userMessage =
      type === "opening_line"
        ? `Generate an optimized opening line for this agent. ${user_prompt || ""}`
        : `Generate a complete conversation flow script for this agent including: opening line, disclosure timing, field collection sequence, objection handling, qualification check, and closing/transfer. ${user_prompt || ""}`;

    const tools = [
      {
        type: "function",
        function: {
          name: "return_script",
          description: "Return the generated script components",
          parameters: {
            type: "object",
            properties: {
              opening_line: {
                type: "string",
                description: "The optimized opening line using {{first_name}} and {{agent_name}} placeholders",
              },
              tone_style: {
                type: "string",
                description: "Recommended tone description (e.g. 'warm, conversational, empathetic')",
              },
              conversation_flow: {
                type: "string",
                description:
                  "Full conversation flow guide with numbered steps. Only populated for full_script type.",
              },
              tips: {
                type: "array",
                items: { type: "string" },
                description: "3-5 best practice tips specific to this agent's use case",
              },
            },
            required: ["opening_line", "tone_style", "tips"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "return_script" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-script error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
