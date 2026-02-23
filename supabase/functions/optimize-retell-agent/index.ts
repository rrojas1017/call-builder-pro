import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RETELL_BASE = "https://api.retellai.com";

// Parameters the AI should NEVER recommend changing
const SKIP_PARAMS = new Set(["voice_id", "voice_provider"]);

const RETELL_BEST_PRACTICES = `
## Retell AI Agent Configuration Best Practices

### Agent-Level Settings
- enable_voicemail_detection: true — Detects answering machines; pair with voicemail_message
- voicemail_message: string — Message to leave on voicemail; requires voicemail detection enabled
- enable_backchannel: true — Adds natural "uh-huh", "I see" responses for human-like conversation
- backchannel_words: ["yeah", "I see", "got it"] — Custom backchannel words
- responsiveness: 0-1 — How quickly agent responds (0.5-0.7 recommended for natural pacing)
- interruption_sensitivity: 0-1 — How easily caller can interrupt (0.5-0.8 recommended)
- ambient_sound: "coffee-shop" | "convention-hall" | "summer-outdoor" | "mountain-outdoor" | "static-noise" | "call-center" — Background ambiance
- normalize_for_speech: true — Converts numbers/dates to spoken form
- enable_dynamic_voice_speed: true — Varies speed based on content
- voice_speed: 0.5-2.0 — Base speaking speed (1.0 = normal)
- pronunciation_dictionary: [{word, alphabet, phoneme}] — Custom pronunciations
- boosted_keywords: string[] — Words to boost in speech recognition
- end_call_after_silence_ms: 30000 — End call after silence (default 30s)
- max_call_duration_ms: 3600000 — Max call duration (default 60min)
- post_call_analysis_data: array — Fields to extract from call

### LLM-Level Settings  
- model: "gpt-4o" | "gpt-4o-mini" | "gpt-4.1" | "gpt-4.1-mini" | "claude-3.5-sonnet" | "claude-3.7-sonnet" | "gemini-2.0-flash" | "gemini-2.5-flash" — LLM model for conversations
- model_temperature: 0-1 — Creativity/randomness
- begin_message: string — First thing agent says (opening line)
- general_prompt: string — System instructions for the agent
- general_tools: array — Built-in tools like end_call, transfer_call, press_digit
- states: array — Multi-step conversation flow with state transitions

### transfer_call Tool Format (REQUIRED — use EXACTLY this structure)
When recommending general_tools that include transfer_call, you MUST use this exact format:
\`\`\`json
{
  "type": "transfer_call",
  "name": "transfer_to_agent",
  "description": "Transfer the call to a live agent when the lead is qualified and ready.",
  "transfer_destination": {
    "type": "predefined",
    "number": "+1XXXXXXXXXX",
    "ignore_e164_validation": false
  },
  "transfer_option": {
    "type": "cold_transfer",
    "show_transferee_as_caller": false
  }
}
\`\`\`
CRITICAL: "transfer_destination" must have "type": "predefined" (NOT "phone_number"). "transfer_option" is REQUIRED.

### Outbound Call Best Practices
- Always set begin_message for outbound calls (agent speaks first)
- Use general_tools with end_call for graceful termination
- Add transfer_call tool if transferring to live agents
- Set voicemail detection + message for outbound campaigns
- Use boosted_keywords for brand names, product names, key terms

### IMPORTANT RESTRICTIONS
- NEVER recommend changing voice_id — voice selection is a user preference, not an optimization target
- NEVER recommend changing voice_provider
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, apply } = await req.json();
    if (!project_id) throw new Error("project_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const retellApiKey = Deno.env.get("RETELL_API_KEY");
    if (!retellApiKey) throw new Error("RETELL_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load agent spec, project info, and knowledge base
    const [specResult, projectResult, knowledgeResult] = await Promise.all([
      supabase.from("agent_specs").select("*").eq("project_id", project_id).single(),
      supabase.from("agent_projects").select("name, description").eq("id", project_id).single(),
      supabase.from("agent_knowledge").select("category, content").eq("project_id", project_id).limit(50),
    ]);

    const spec = specResult.data;
    const project = projectResult.data;
    const knowledge = knowledgeResult.data || [];

    if (!spec) throw new Error("No agent spec found for this project");

    // Fetch current Retell agent config if we have an agent ID
    let retellConfig: any = null;
    let retellLlmConfig: any = null;
    if (spec.retell_agent_id) {
      try {
        const agentRes = await fetch(`${RETELL_BASE}/get-agent/${spec.retell_agent_id}`, {
          headers: { Authorization: `Bearer ${retellApiKey}` },
        });
        if (agentRes.ok) {
          retellConfig = await agentRes.json();
          // Fetch LLM config too
          const llmId = retellConfig?.response_engine?.llm_id;
          if (llmId) {
            const llmRes = await fetch(`${RETELL_BASE}/get-retell-llm/${llmId}`, {
              headers: { Authorization: `Bearer ${retellApiKey}` },
            });
            if (llmRes.ok) retellLlmConfig = await llmRes.json();
          }
        }
      } catch (e) {
        console.error("Failed to fetch Retell config:", e);
      }
    }

    // Extract key terms from knowledge base for boosted_keywords
    const keyTerms = knowledge
      .filter(k => k.category === "product_details" || k.category === "industry_insight")
      .map(k => k.content)
      .join(" ")
      .slice(0, 2000);

    const prompt = `You are a Retell AI integration expert. Analyze this agent configuration and provide specific optimization recommendations.

## Current Agent Spec (from our platform)
${JSON.stringify({
  persona_name: spec.persona_name,
  opening_line: spec.opening_line,
  tone_style: spec.tone_style,
  voice_id: spec.voice_id,
  speaking_speed: spec.speaking_speed,
  interruption_threshold: spec.interruption_threshold,
  temperature: spec.temperature,
  voicemail_message: spec.voicemail_message,
  transfer_required: spec.transfer_required,
  transfer_phone_number: spec.transfer_phone_number,
  pronunciation_guide: spec.pronunciation_guide,
  language: spec.language,
  mode: spec.mode,
  use_case: spec.use_case,
}, null, 2)}

## Current Retell Agent Config (live on Retell)
${retellConfig ? JSON.stringify(retellConfig, null, 2) : "No Retell agent provisioned yet"}

## Current Retell LLM Config
${retellLlmConfig ? JSON.stringify(retellLlmConfig, null, 2) : "No LLM config available"}

## Agent Project
Name: ${project?.name || "Unknown"}
Description: ${project?.description || "N/A"}

## Key Terms from Knowledge Base
${keyTerms || "No knowledge base entries"}

${RETELL_BEST_PRACTICES}

Analyze the gap between current config and best practices. Return optimization recommendations.`;

    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-3-pro-preview",
      messages: [
        { role: "system", content: "You are a Retell AI configuration expert. Analyze agent configs and provide actionable optimization recommendations. Use the suggest_optimizations tool to return structured results.\n\nCRITICAL RULES:\n1. NEVER recommend changing voice_id or voice_provider — these are user preferences.\n2. When recommending general_tools with transfer_call, you MUST use the EXACT format from the best practices document including transfer_destination (type: predefined) and transfer_option (type: cold_transfer). Missing either field will cause Retell API rejection." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_optimizations",
            description: "Return structured optimization recommendations for the Retell agent",
            parameters: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string", enum: ["agent_settings", "llm_settings", "voice_tuning", "call_flow", "knowledge"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      current_value: { type: "string" },
                      recommended_value: { type: "string" },
                      retell_param: { type: "string" },
                      auto_apply: { type: "boolean" },
                    },
                    required: ["category", "title", "description", "priority", "recommended_value", "retell_param", "auto_apply"],
                  },
                },
                overall_score: { type: "number", description: "Current optimization score 0-100" },
                summary: { type: "string" },
              },
              required: ["recommendations", "overall_score", "summary"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_optimizations" } },
      temperature: 0.3,
      max_tokens: 4096,
    });

    let result: any = null;
    if (aiResponse.tool_calls.length > 0) {
      result = aiResponse.tool_calls[0].arguments;
    } else {
      result = { recommendations: [], overall_score: 0, summary: aiResponse.content || "No recommendations generated" };
    }

    // Filter out skip-listed params from recommendations
    if (result.recommendations) {
      result.recommendations = result.recommendations.filter((r: any) => !SKIP_PARAMS.has(r.retell_param));
    }

    // Auto-apply if requested
    if (apply && result.recommendations?.length > 0) {
      const autoRecs = result.recommendations.filter((r: any) => r.auto_apply);

      if (spec.retell_agent_id) {
        // Apply to live Retell agent
        const agentPatch: Record<string, unknown> = {};
        const llmPatch: Record<string, unknown> = {};

        for (const rec of autoRecs) {
          const param = rec.retell_param;
          if (SKIP_PARAMS.has(param)) continue;

          const value = rec.recommended_value;
          let parsedValue: unknown;
          try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }

          // Validate and fix general_tools transfer_call entries
          if (param === "general_tools" && Array.isArray(parsedValue)) {
            parsedValue = (parsedValue as any[]).map((tool: any) => {
              if (tool.type === "transfer_call") {
                // Force correct transfer_destination format
                tool.transfer_destination = {
                  type: "predefined",
                  number: spec.transfer_phone_number || tool.transfer_destination?.number || "",
                  ignore_e164_validation: false,
                };
                // Force required transfer_option
                tool.transfer_option = tool.transfer_option || {
                  type: "cold_transfer",
                  show_transferee_as_caller: false,
                };
                if (!tool.transfer_option.type) tool.transfer_option.type = "cold_transfer";
              }
              return tool;
            });
          }

          const llmParams = ["model", "model_temperature", "begin_message", "general_tools", "states"];
          if (llmParams.includes(param)) {
            llmPatch[param] = parsedValue;
          } else {
            agentPatch[param] = parsedValue;
          }
        }

        if (Object.keys(agentPatch).length > 0) {
          const res = await fetch(`${RETELL_BASE}/update-agent/${spec.retell_agent_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
            body: JSON.stringify(agentPatch),
          });
          if (!res.ok) {
            const err = await res.text();
            console.error("Failed to apply agent patches:", err);
            result.apply_errors = result.apply_errors || [];
            result.apply_errors.push(`Agent patch failed: ${err}`);
          } else {
            result.applied_agent_patches = agentPatch;
          }
        }

        const llmId = retellConfig?.response_engine?.llm_id;
        if (llmId && Object.keys(llmPatch).length > 0) {
          const res = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${retellApiKey}` },
            body: JSON.stringify(llmPatch),
          });
          if (!res.ok) {
            const err = await res.text();
            console.error("Failed to apply LLM patches:", err);
            result.apply_errors = result.apply_errors || [];
            result.apply_errors.push(`LLM patch failed: ${err}`);
          } else {
            result.applied_llm_patches = llmPatch;
          }
        }
      } else {
        // No Retell agent provisioned — save optimizations to local agent_specs
        const PARAM_TO_SPEC: Record<string, { col: string; transform?: (v: any) => any }> = {
          interruption_sensitivity: { col: "interruption_threshold", transform: (v: number) => Math.round(Number(v) * 100) },
          voice_speed: { col: "speaking_speed", transform: (v: any) => Number(v) },
          model_temperature: { col: "temperature", transform: (v: any) => Number(v) },
          begin_message: { col: "opening_line" },
          responsiveness: { col: "speaking_speed", transform: (v: any) => Number(v) },
        };

        const specPatch: Record<string, unknown> = {};

        for (const rec of autoRecs) {
          const mapping = PARAM_TO_SPEC[rec.retell_param];
          if (mapping) {
            let parsedValue: unknown;
            try { parsedValue = JSON.parse(rec.recommended_value); } catch { parsedValue = rec.recommended_value; }
            specPatch[mapping.col] = mapping.transform ? mapping.transform(parsedValue) : parsedValue;
          }
        }

        if (Object.keys(specPatch).length > 0) {
          const { error: specErr } = await supabase
            .from("agent_specs")
            .update(specPatch)
            .eq("project_id", project_id);

          if (specErr) {
            console.error("Failed to apply spec patches:", specErr);
            result.apply_errors = result.apply_errors || [];
            result.apply_errors.push(`Spec patch failed: ${specErr.message}`);
          } else {
            result.applied_spec_patches = specPatch;
            result.no_retell_agent = true;
          }
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("optimize-retell-agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
