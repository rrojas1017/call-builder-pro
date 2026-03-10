import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, updated_fields } = await req.json();
    if (!project_id || !updated_fields) throw new Error("project_id and updated_fields required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data: spec, error: specErr } = await sb
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    // Build current config summary
    const currentConfig = {
      business_rules: spec.business_rules,
      qualification_rules: spec.qualification_rules,
      disqualification_rules: spec.disqualification_rules,
      must_collect_fields: spec.must_collect_fields,
      opening_line: spec.opening_line,
      tone_style: spec.tone_style,
      disclosure_text: spec.disclosure_text,
      language: spec.language,
      success_definition: spec.success_definition,
    };

    const changedFields = Object.keys(updated_fields);
    const changedSummary = changedFields.map(f => `${f}: ${JSON.stringify(updated_fields[f])}`).join("\n");
    const currentSummary = Object.entries(currentConfig)
      .filter(([k]) => !changedFields.includes(k))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");

    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a configuration conflict detector for an AI phone agent. Detect internal contradictions between proposed edits and existing configuration. Only flag real conflicts, not minor style differences.`,
        },
        {
          role: "user",
          content: `CURRENT CONFIG (unchanged fields):\n${currentSummary}\n\nPROPOSED CHANGES:\n${changedSummary}\n\nFind contradictions between proposed changes and existing config. Return results.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_conflicts",
            description: "Report any detected conflicts between proposed changes and existing config",
            parameters: {
              type: "object",
              properties: {
                conflicts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      description: { type: "string" },
                      severity: { type: "string", enum: ["blocking", "warning", "info"] },
                      suggestion: { type: "string" },
                    },
                    required: ["field", "description", "severity"],
                  },
                },
              },
              required: ["conflicts"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_conflicts" } },
      temperature: 0.1,
      max_tokens: 1024,
    });

    const conflicts = aiResponse.tool_calls?.[0]?.arguments?.conflicts || [];

    return new Response(JSON.stringify({ conflicts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("check-spec-conflicts error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
