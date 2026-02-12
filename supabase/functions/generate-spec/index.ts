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
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get project
    const { data: project, error: projErr } = await supabase
      .from("agent_projects")
      .select("*")
      .eq("id", project_id)
      .single();
    if (projErr) throw projErr;

    // Generate default ACA prequal spec
    const spec = {
      project_id,
      use_case: "aca_prequal",
      tone_style: "Friendly, professional, empathetic",
      disclosure_text: "This call is being recorded for quality and compliance purposes. I'm calling on behalf of a licensed insurance agency to help determine if you may qualify for affordable health coverage through the ACA marketplace.",
      consent_required: true,
      qualification_rules: {
        income_range: "100-400% FPL",
        eligible_coverage: ["uninsured", "private"],
      },
      disqualification_rules: {
        coverage_types: ["employer", "medicare"],
        tag_only: ["medicaid"],
      },
      must_collect_fields: ["consent", "state", "age", "household_size", "income_est_annual", "coverage_type"],
      transfer_phone_number: "",
      business_hours: { timezone: "America/New_York", start: "09:00", end: "17:00", days: ["mon", "tue", "wed", "thu", "fri"] },
      retry_policy: { max_attempts: 3, spacing_minutes: 60 },
      language: "en",
    };

    // Upsert spec
    const { error: specErr } = await supabase.from("agent_specs").upsert(spec, { onConflict: "project_id" });
    if (specErr) throw specErr;

    // Generate wizard questions
    const questions = [
      { project_id, question: "What is the transfer phone number for the licensed agent?", answer: "", order_index: 0 },
      { project_id, question: "What disclosure text should be read verbatim at the start of each call?", answer: spec.disclosure_text, order_index: 1 },
      { project_id, question: "What income threshold rule should be used? (e.g., 100-400% FPL)", answer: "100-400% FPL", order_index: 2 },
      { project_id, question: "What are the business hours and timezone? (e.g., 9am-5pm ET, Mon-Fri)", answer: "9:00 AM - 5:00 PM ET, Monday through Friday", order_index: 3 },
      { project_id, question: "How should ESI, Medicare, Medicaid, and uninsured leads be handled?", answer: "ESI/Medicare = disqualify, Medicaid = tag only (no transfer), Uninsured/Private = qualify for transfer", order_index: 4 },
    ];

    // Delete old questions and insert new
    await supabase.from("wizard_questions").delete().eq("project_id", project_id);
    const { error: qErr } = await supabase.from("wizard_questions").insert(questions);
    if (qErr) throw qErr;

    return new Response(JSON.stringify({ spec, questions }), {
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
