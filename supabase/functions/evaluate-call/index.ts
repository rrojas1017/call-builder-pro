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

    const { data: call, error: callErr } = await supabase
      .from("calls").select("*").eq("id", call_id).single();
    if (callErr) throw callErr;

    if (!call.transcript) {
      return new Response(JSON.stringify({ message: "No transcript to evaluate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: spec, error: specErr } = await supabase
      .from("agent_specs").select("*").eq("project_id", call.project_id).single();
    if (specErr) throw specErr;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a Call Performance Auditor.
Evaluate the following call transcript against the Agent Specification provided.

HUMANNESS SCORING (0-100) -- THIS IS THE MOST IMPORTANT METRIC:
This scores conversational behavior (separate from naturalness which measures voice/delivery quality):
- Did the agent acknowledge what the caller said before asking the next question?
- Did it use the caller's name naturally (not robotically every sentence)?
- Were there moments of genuine warmth, humor, or empathy?
- Did it vary sentence structure or repeat the same patterns?
- Did transitions between topics feel natural or abrupt?
- Was there any small talk or rapport-building?
- Did the agent react to personal details the caller shared (kids, job, location)?
- Did it sound like a real person or a survey bot?
Score 90-100: Indistinguishable from a warm, skilled human caller
Score 70-89: Mostly human with occasional robotic moments
Score 40-69: Noticeably scripted, minimal rapport
Score 0-39: Full robot -- survey-style interrogation

For "humanness_suggestions", provide specific, actionable conversation techniques the agent should learn.

KNOWLEDGE GAP DETECTION:
Analyze the transcript for moments where the agent:
- Couldn't answer a question the caller asked about the product/service
- Gave vague or incorrect information about industry-specific topics
- Missed an opportunity to provide helpful domain knowledge
- Didn't know competitor details when asked
List each gap as a specific topic in "knowledge_gaps" (e.g., "couldn't explain net metering", "didn't know about federal tax credit eligibility").

NATURALNESS SCORING (0-100):
Analyze the transcript for signs of AI voice quality problems:
- Mispronounced or garbled words
- Repeated words or phrases
- Cut-off or incomplete sentences
- Robotic cadence
Score 90-100: Sounds completely natural
Score 70-89: Mostly natural with minor issues
Score 40-69: Noticeable AI artifacts
Score 0-39: Very robotic

List specific delivery problems in "delivery_issues".

Each recommended_improvement should be an object with:
- "field": the agent_spec field to change
- "current_value": what it is now
- "suggested_value": what it should be
- "reason": why this change would help

VOICE TUNING RECOMMENDATIONS:
- If repeated words detected → suggest lowering "temperature"
- If rushed pacing → suggest lowering "speaking_speed"
- If AI interrupts too quickly → suggest raising "interruption_threshold"
- If words mispronounced → suggest "pronunciation_guide" entries`;

    const userPrompt = `AGENT SPECIFICATION:\n${JSON.stringify(spec, null, 2)}\n\nCALL TRANSCRIPT:\n${call.transcript}`;

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
                naturalness_score: { type: "number" },
                humanness_score: { type: "number" },
                humanness_suggestions: { type: "array", items: { type: "string" } },
                knowledge_gaps: { type: "array", items: { type: "string" }, description: "Specific topics the agent lacked knowledge about during the call" },
                issues_detected: { type: "array", items: { type: "string" } },
                delivery_issues: { type: "array", items: { type: "string" } },
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
              required: ["compliance_score", "objective_score", "overall_score", "naturalness_score", "humanness_score", "humanness_suggestions", "knowledge_gaps", "issues_detected", "delivery_issues", "missed_fields", "incorrect_logic", "hallucination_detected", "recommended_improvements"],
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

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      evaluation = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
      else throw new Error("Could not parse evaluation from AI response");
    }

    // Store in calls.evaluation
    await supabase.from("calls").update({ evaluation }).eq("id", call_id);

    // Upsert into evaluations table
    await supabase.from("evaluations").upsert({
      call_id,
      overall_score: evaluation.overall_score,
      issues: evaluation.issues_detected,
      recommended_fixes: evaluation.recommended_improvements,
      rubric: {
        compliance_score: evaluation.compliance_score,
        objective_score: evaluation.objective_score,
        naturalness_score: evaluation.naturalness_score,
        humanness_score: evaluation.humanness_score,
        humanness_suggestions: evaluation.humanness_suggestions,
        knowledge_gaps: evaluation.knowledge_gaps,
        missed_fields: evaluation.missed_fields,
        incorrect_logic: evaluation.incorrect_logic,
        hallucination_detected: evaluation.hallucination_detected,
        delivery_issues: evaluation.delivery_issues,
      },
    }, { onConflict: "call_id" });

    // If test lab call, store evaluation
    if (test_run_contact_id) {
      await supabase.from("test_run_contacts").update({ evaluation }).eq("id", test_run_contact_id);
    }

    // Auto-apply humanness learnings
    if (evaluation.humanness_suggestions?.length > 0) {
      try {
        const currentNotes: string[] = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
        const newSuggestions = evaluation.humanness_suggestions.filter(
          (s: string) => !currentNotes.some((existing: string) => existing.toLowerCase() === s.toLowerCase())
        );
        if (newSuggestions.length > 0) {
          const merged = [...currentNotes, ...newSuggestions].slice(-20);
          await supabase.from("agent_specs").update({ humanization_notes: merged }).eq("id", spec.id);
          console.log(`Auto-applied ${newSuggestions.length} humanness suggestions`);
        }

        // Also save to global_human_behaviors for cross-agent learning
        const { data: existingGlobal } = await supabase
          .from("global_human_behaviors").select("content");
        const existingGlobalSet = new Set((existingGlobal || []).map((g: any) => g.content.toLowerCase().trim()));
        const globalNew = evaluation.humanness_suggestions.filter(
          (s: string) => !existingGlobalSet.has(s.toLowerCase().trim())
        );
        if (globalNew.length > 0) {
          await supabase.from("global_human_behaviors").insert(
            globalNew.map((s: string) => ({
              content: s,
              source_type: "auto_learned",
              source_agent_id: call.project_id,
            }))
          );
          console.log(`Saved ${globalNew.length} behaviors to global library`);
        }
      } catch (e) {
        console.error("Failed to auto-apply humanness notes:", e);
      }
    }

    // Trigger auto-research when gaps are significant
    const shouldResearch =
      (evaluation.humanness_score != null && evaluation.humanness_score < 80) ||
      (evaluation.issues_detected?.length >= 2) ||
      (evaluation.humanness_suggestions?.length >= 2) ||
      (evaluation.knowledge_gaps?.length >= 1);

    if (shouldResearch) {
      try {
        console.log("Triggering research-and-improve for project:", call.project_id);
        const researchResp = await fetch(`${supabaseUrl}/functions/v1/research-and-improve`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project_id: call.project_id, evaluation, spec }),
        });
        if (researchResp.ok) {
          const researchData = await researchResp.json();
          console.log(`Research complete: ${researchData.entries_saved || 0} entries saved`);
        } else {
          console.error("Research failed:", researchResp.status, await researchResp.text());
        }
      } catch (e) {
        console.error("Failed to trigger research:", e);
      }
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
