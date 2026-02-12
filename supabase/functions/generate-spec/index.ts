import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project
    const { data: project, error: projErr } = await supabase
      .from("agent_projects")
      .select("*")
      .eq("id", project_id)
      .single();
    if (projErr) throw projErr;

    const sourceText = project.source_text || project.description || "General outbound calling agent";

    let spec: any;
    let clarificationQuestions: any[] = [];

    if (LOVABLE_API_KEY) {
      // AI-powered spec generation
      const systemPrompt = `You are an AI Agent Architect.
Convert the user's description into a structured Call Agent Specification.

Rules:
- Ask maximum 5 clarification_questions, each with a "question", "rationale" (why this matters), and "suggested_default".
- If compliance-sensitive topic (insurance, finance, healthcare), set disclosure_required=true.
- If outbound, set consent_required=true.
- Infer reasonable defaults when possible.
- Be specific and actionable in your specification.`;

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
            { role: "user", content: `Create a call agent specification for:\n\n${sourceText}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "create_agent_spec",
              description: "Create a structured call agent specification with clarification questions.",
              parameters: {
                type: "object",
                properties: {
                  use_case: { type: "string" },
                  mode: { type: "string", enum: ["outbound", "inbound", "hybrid"] },
                  tone_style: { type: "string" },
                  opening_line: { type: "string" },
                  disclosure_required: { type: "boolean" },
                  disclosure_text: { type: "string" },
                  consent_required: { type: "boolean" },
                  must_collect_fields: { type: "array", items: { type: "string" } },
                  qualification_logic: { type: "object" },
                  disqualification_logic: { type: "object" },
                  success_definition: { type: "string" },
                  transfer_required: { type: "boolean" },
                  transfer_phone_number: { type: "string" },
                  business_rules: { type: "object" },
                  retry_policy: { type: "object" },
                  clarification_questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        rationale: { type: "string" },
                        suggested_default: { type: "string" },
                      },
                      required: ["question", "rationale", "suggested_default"],
                    },
                  },
                },
                required: ["use_case", "mode", "tone_style", "opening_line", "disclosure_required", "consent_required", "must_collect_fields", "success_definition", "clarification_questions"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "create_agent_spec" } },
        }),
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
          
          clarificationQuestions = parsed.clarification_questions || [];
          spec = { ...parsed };
          delete spec.clarification_questions;
        }
      } else {
        const errText = await aiResp.text();
        console.error("AI gateway error, falling back to defaults:", aiResp.status, errText);
      }
    }

    // Fallback to sensible defaults if AI didn't work
    if (!spec) {
      spec = {
        use_case: "general_outbound",
        mode: "outbound",
        tone_style: "Friendly, professional, empathetic",
        opening_line: "Hi, I'm calling on behalf of our team to help you with some quick questions.",
        disclosure_required: true,
        disclosure_text: "This call is being recorded for quality and compliance purposes.",
        consent_required: true,
        must_collect_fields: ["consent", "name", "phone"],
        qualification_logic: {},
        disqualification_logic: {},
        success_definition: "Successfully collect required information and determine next steps.",
        transfer_required: false,
        transfer_phone_number: "",
        business_rules: {},
        retry_policy: { max_attempts: 3, spacing_minutes: 60 },
      };
      clarificationQuestions = [
        { question: "What is the primary goal of each call?", rationale: "Defines the success criteria for the agent.", suggested_default: "Collect information and qualify leads" },
        { question: "What phone number should qualified leads be transferred to?", rationale: "Required for live transfer functionality.", suggested_default: "" },
        { question: "What information must be collected on every call?", rationale: "Ensures the agent asks the right questions.", suggested_default: "Name, phone, eligibility status" },
        { question: "What should disqualify a lead?", rationale: "Prevents wasting time on ineligible contacts.", suggested_default: "Already has coverage through employer" },
        { question: "What hours should calls be made?", rationale: "Ensures compliance with calling regulations.", suggested_default: "9:00 AM - 5:00 PM ET, Monday through Friday" },
      ];
    }

    // Upsert spec
    const specRow = {
      project_id,
      use_case: spec.use_case,
      mode: spec.mode || "outbound",
      tone_style: spec.tone_style,
      opening_line: spec.opening_line,
      disclosure_required: spec.disclosure_required ?? true,
      disclosure_text: spec.disclosure_text || "",
      consent_required: spec.consent_required ?? true,
      must_collect_fields: spec.must_collect_fields,
      qualification_rules: spec.qualification_logic || spec.qualification_rules,
      disqualification_rules: spec.disqualification_logic || spec.disqualification_rules,
      success_definition: spec.success_definition,
      transfer_required: spec.transfer_required ?? false,
      transfer_phone_number: spec.transfer_phone_number || "",
      business_rules: spec.business_rules,
      retry_policy: spec.retry_policy || { max_attempts: 3, spacing_minutes: 60 },
      language: "en",
    };

    const { error: specErr } = await supabase.from("agent_specs").upsert(specRow, { onConflict: "project_id" });
    if (specErr) throw specErr;

    // Build wizard questions with rationale
    const questions = clarificationQuestions.slice(0, 5).map((cq: any, i: number) => ({
      project_id,
      question: cq.question,
      rationale: cq.rationale,
      answer: cq.suggested_default || "",
      order_index: i,
    }));

    // Delete old questions and insert new
    await supabase.from("wizard_questions").delete().eq("project_id", project_id);
    if (questions.length > 0) {
      const { error: qErr } = await supabase.from("wizard_questions").insert(questions);
      if (qErr) throw qErr;
    }

    return new Response(JSON.stringify({ spec: specRow, questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-spec error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
