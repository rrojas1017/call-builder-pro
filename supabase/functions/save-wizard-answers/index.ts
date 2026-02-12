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

    // Update agent_specs based on answers
    const updates: Record<string, any> = {};
    for (const ans of answers) {
      if (ans.order_index === 0 && ans.answer) {
        // Only store as transfer_phone_number if it looks like a phone number
        const digits = ans.answer.replace(/\D/g, "");
        if (digits.length >= 10) {
          updates.transfer_phone_number = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
          updates.transfer_required = true;
        } else {
          // It's descriptive text, not a phone number — store as a qualification rule
          updates.qualification_rules = { description: ans.answer };
        }
      }
      if (ans.order_index === 1 && ans.answer) updates.disclosure_text = ans.answer;
      if (ans.order_index === 2 && ans.answer) {
        updates.qualification_rules = { income_range: ans.answer, eligible_coverage: ["uninsured", "private"] };
      }
      if (ans.order_index === 3 && ans.answer) {
        updates.business_hours = { description: ans.answer, timezone: "America/New_York", start: "09:00", end: "17:00", days: ["mon", "tue", "wed", "thu", "fri"] };
      }
      if (ans.order_index === 4 && ans.answer) {
        updates.disqualification_rules = { description: ans.answer, coverage_types: ["employer", "medicare"], tag_only: ["medicaid"] };
      }
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
