import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, answers } = await req.json();
    if (!project_id || !answers) throw new Error("project_id and answers required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save answers to wizard_questions
    for (const ans of answers) {
      await supabase
        .from("wizard_questions")
        .update({ answer: ans.answer })
        .eq("project_id", project_id)
        .eq("order_index", ans.order_index);
    }

    // Map answers to agent_specs using keyword detection on the question text
    const updates: Record<string, any> = {};
    let humanizationNotes: string[] = [];

    for (const ans of answers) {
      const q = (ans.question || "").toLowerCase();
      const a = ans.answer || "";
      if (!a.trim()) continue;

      // Company/product context → business_rules.company_context
      if (q.includes("company") || q.includes("product") || q.includes("service") || q.includes("offer") || q.includes("represent")) {
        updates.business_rules = { ...(updates.business_rules || {}), company_context: a };
      }

      // Target audience → business_rules.target_audience
      if (q.includes("ideal") || q.includes("audience") || q.includes("target") || q.includes("who") || q.includes("customer")) {
        updates.business_rules = { ...(updates.business_rules || {}), target_audience: a };
      }

      // Objections → business_rules.objection_handling
      if (q.includes("objection") || q.includes("pushback") || q.includes("resist")) {
        updates.business_rules = { ...(updates.business_rules || {}), objection_handling: a };
      }

      // Forbidden phrases/topics → humanization_notes
      if (q.includes("never") || q.includes("avoid") || q.includes("forbidden") || q.includes("don't") || q.includes("not say") || q.includes("not do")) {
        humanizationNotes.push(`NEVER say or do: ${a}`);
      }

      // Tone/persona → tone_style
      if (q.includes("tone") || q.includes("persona") || q.includes("personality") || q.includes("style") || q.includes("voice")) {
        updates.tone_style = a;
      }

      // Success definition → success_definition
      if (q.includes("success") || q.includes("true win") || q.includes("outcome") || q.includes("matter")) {
        updates.success_definition = a;
      }

      // Compliance/legal → disclosure_text + business_rules.compliance
      if (q.includes("compliance") || q.includes("legal") || q.includes("regulatory") || q.includes("disclosure") || q.includes("requirement")) {
        updates.disclosure_text = a;
        updates.disclosure_required = true;
        updates.business_rules = { ...(updates.business_rules || {}), compliance_notes: a };
      }

      // Business hours → business_hours
      if (q.includes("hour") || q.includes("time") || q.includes("day") || q.includes("calling hour") || q.includes("timezone")) {
        updates.business_hours = { description: a, timezone: "America/New_York", start: "09:00", end: "18:00", days: ["mon", "tue", "wed", "thu", "fri"] };
      }
    }

    // Merge humanization_notes
    if (humanizationNotes.length > 0) {
      updates.humanization_notes = humanizationNotes;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("agent_specs")
        .update({ ...updates, version: 1 })
        .eq("project_id", project_id);
      if (error) throw error;
    }

    // Return updated spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    return new Response(JSON.stringify({ spec }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("save-wizard-answers error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
