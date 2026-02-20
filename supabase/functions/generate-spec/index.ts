import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, language } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const lang = language || "en";
    const LANGUAGE_LABELS: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      pt: "Portuguese",
      de: "German",
      it: "Italian",
    };
    const languageLabel = LANGUAGE_LABELS[lang] || "English";

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
      const systemPrompt = `You are an expert AI Call Agent Architect with deep knowledge of outbound sales, compliance, and voice AI.
Convert the user's description into a structured Call Agent Specification.

CRITICAL LANGUAGE REQUIREMENT:
- The agent will operate in ${languageLabel}. You MUST write ALL questions, suggested_default answers, opening_line, tone_style, success_definition, and all text fields in ${languageLabel}. NOT in English (unless ${languageLabel} is English).
- The opening_line MUST be a natural-sounding TEMPLATE — NOT a verbatim script. It must use the placeholder {{agent_name}} where the agent introduces itself, and {{first_name}} where the caller's name is used.
- Example English opening_line: "Hey {{first_name}}, this is {{agent_name}} calling on behalf of [Company] — you got a quick second?"
- Example Spanish opening_line: "Hola {{first_name}}, mi nombre es {{agent_name}} y le llamo de parte de [Empresa] — ¿tiene un momento?"
- The opening_line is a STARTING POINT GUIDE the agent should adapt naturally — not a teleprompter script to read verbatim.
- The suggested_default answers must be written in ${languageLabel} so the user can read and understand them.
- Every question must be phrased in ${languageLabel}.

Rules:
- Ask 6-8 clarification questions that will help build a better, more personalized agent.
- Questions MUST cover: company/product context, target audience, common caller objections, phrases the agent should NEVER say, tone/persona style, what defines a truly successful call, compliance or legal requirements, and business hours/callback preferences.
- Do NOT ask for a transfer phone number — that is captured separately in the UI.
- Do NOT ask about what data to collect — infer sensible defaults from the use case.
- For compliance-sensitive industries (insurance, finance, healthcare, legal), include a question about disclosures or regulatory constraints.
- Each question must have a clear rationale explaining why it improves the agent.
- Provide a suggested_default that is specific and actionable, not just "N/A" or vague.
- If outbound, set consent_required=true.
- If compliance-sensitive, set disclosure_required=true.
- Be specific and actionable in your specification — infer reasonable defaults where possible.`;

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
      const fallbackOpeningLine = lang === "es"
        ? "Hola {{first_name}}, mi nombre es {{agent_name}} y le llamo para ayudarle — ¿tiene un minuto?"
        : "Hey {{first_name}}, this is {{agent_name}} calling — do you have a quick moment?";
      spec = {
        use_case: "general_outbound",
        mode: "outbound",
        tone_style: "Friendly, professional, empathetic",
        opening_line: fallbackOpeningLine,
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
        {
          question: "Describe your company and what product or service this agent will be representing.",
          rationale: "Understanding your company and offer helps the agent speak accurately and confidently about what you provide.",
          suggested_default: "We help individuals find affordable health insurance plans that fit their budget and needs.",
        },
        {
          question: "Who is the ideal person this agent should be talking to? What are their key characteristics?",
          rationale: "Knowing the target audience allows the agent to tailor its language, empathy, and qualification questions appropriately.",
          suggested_default: "Adults 26-64 who are currently uninsured or paying too much for health coverage.",
        },
        {
          question: "What are the most common objections or pushbacks callers give, and how should the agent respond?",
          rationale: "Pre-programming objection handling makes the agent far more effective and reduces hang-ups.",
          suggested_default: "\"I already have insurance\" — agent should ask what they're currently paying and if they'd like a free comparison.",
        },
        {
          question: "What should the agent NEVER say, do, or promise? Are there any forbidden phrases or topics?",
          rationale: "Defining hard boundaries prevents compliance violations and protects your brand reputation.",
          suggested_default: "Never guarantee specific premium amounts, never mention specific plan names without verification, never pressure the caller.",
        },
        {
          question: "What tone and persona should the agent have? Describe the personality you want callers to experience.",
          rationale: "A consistent, well-defined persona builds caller trust and makes the agent feel more human.",
          suggested_default: "Warm, calm, and knowledgeable — like a helpful neighbor who happens to be an insurance expert.",
        },
        {
          question: "What makes a call a TRUE success beyond just completing it? What outcome matters most?",
          rationale: "Defining real success criteria allows the agent to be optimized for what actually drives business value.",
          suggested_default: "A qualified lead who agrees to be transferred to a licensed agent for a full consultation.",
        },
        {
          question: "Are there any compliance, legal, or regulatory requirements this agent must follow?",
          rationale: "Embedding compliance rules from the start prevents legal exposure and ensures proper disclosures.",
          suggested_default: "Must state that we are not a licensed insurer, calls may be recorded, and caller can opt-out at any time.",
        },
        {
          question: "What are the preferred calling hours and days? Any geographic or timezone considerations?",
          rationale: "Restricting calls to acceptable hours ensures compliance with TCPA regulations and maximizes contact rates.",
          suggested_default: "Monday–Friday, 9 AM to 6 PM in the caller's local time zone.",
        },
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
      language: lang,
    };

    const { error: specErr } = await supabase.from("agent_specs").upsert(specRow, { onConflict: "project_id" });
    if (specErr) throw specErr;

    // Build wizard questions with rationale — up to 8
    const questions = clarificationQuestions.slice(0, 8).map((cq: any, i: number) => ({
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
