import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { call_id, test_run_contact_id } = await req.json();
    if (!call_id) throw new Error("call_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load call
    const { data: call, error: callErr } = await supabase
      .from("calls")
      .select("*")
      .eq("id", call_id)
      .single();
    if (callErr) throw callErr;

    if (!call.transcript) {
      return new Response(JSON.stringify({ message: "No transcript to evaluate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load agent spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", call.project_id)
      .single();
    if (specErr) throw specErr;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a Call Performance Auditor.
Evaluate the following call transcript against the Agent Specification provided.
Return JSON only with this exact structure:
{
  "compliance_score": 0-100,
  "objective_score": 0-100,
  "overall_score": 0-100,
  "issues_detected": [],
  "missed_fields": [],
  "incorrect_logic": [],
  "hallucination_detected": true/false,
  "recommended_improvements": []
}

Each recommended_improvement should be an object with:
- "field": the agent_spec field to change
- "current_value": what it is now
- "suggested_value": what it should be
- "reason": why this change would help`;

    const userPrompt = `AGENT SPECIFICATION:
${JSON.stringify(spec, null, 2)}

CALL TRANSCRIPT:
${call.transcript}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "evaluate_call",
            description: "Return the call evaluation results.",
            parameters: {
              type: "object",
              properties: {
                compliance_score: { type: "number" },
                objective_score: { type: "number" },
                overall_score: { type: "number" },
                issues_detected: { type: "array", items: { type: "string" } },
                missed_fields: { type: "array", items: { type: "string" } },
                incorrect_logic: { type: "array", items: { type: "string" } },
                hallucination_detected: { type: "boolean" },
                recommended_improvements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      current_value: { type: "string" },
                      suggested_value: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["field", "suggested_value", "reason"],
                  },
                },
              },
              required: ["compliance_score", "objective_score", "overall_score", "issues_detected", "missed_fields", "incorrect_logic", "hallucination_detected", "recommended_improvements"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "evaluate_call" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      throw new Error("AI evaluation failed");
    }

    const aiData = await aiResp.json();
    let evaluation: any;

    // Extract from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      evaluation = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      // Fallback: try parsing content
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
      else throw new Error("Could not parse evaluation from AI response");
    }

    // Store in calls.evaluation
    await supabase
      .from("calls")
      .update({ evaluation })
      .eq("id", call_id);

    // Upsert into evaluations table
    await supabase.from("evaluations").upsert({
      call_id,
      overall_score: evaluation.overall_score,
      issues: evaluation.issues_detected,
      recommended_fixes: evaluation.recommended_improvements,
      rubric: {
        compliance_score: evaluation.compliance_score,
        objective_score: evaluation.objective_score,
        missed_fields: evaluation.missed_fields,
        incorrect_logic: evaluation.incorrect_logic,
        hallucination_detected: evaluation.hallucination_detected,
      },
    }, { onConflict: "call_id" });

    // If this is a test lab call, store evaluation in test_run_contacts
    if (test_run_contact_id) {
      await supabase
        .from("test_run_contacts")
        .update({ evaluation })
        .eq("id", test_run_contact_id);
    }

    return new Response(JSON.stringify({ evaluation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("evaluate-call error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
