import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, improvement } = await req.json();
    if (!project_id || !improvement) throw new Error("project_id and improvement required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    const fromVersion = spec.version;
    const toVersion = fromVersion + 1;

    // Build patch — strip parenthetical descriptions from field names
    // e.g. "must_collect_fields (household_size prompt)" → "must_collect_fields"
    const rawField = (improvement.field as string).trim();
    const field = rawField.replace(/\s*\(.*\)$/, "").trim();
    const patch: Record<string, any> = {};

    // Handle dot-notation fields (e.g. "qualification_rules.income_range")
    if (field.includes(".")) {
      const [parentCol, ...rest] = field.split(".");
      const nestedKey = rest.join(".");

      // Fetch current value of the parent JSON column
      const currentParentValue = spec[parentCol] || {};
      const parentObj = typeof currentParentValue === "string"
        ? JSON.parse(currentParentValue)
        : { ...currentParentValue };

      // Set the nested key
      parentObj[nestedKey] = improvement.suggested_value;
      patch[parentCol] = parentObj;
    } else if (["tone_style", "opening_line", "disclosure_text", "success_definition", "transfer_phone_number", "language", "use_case", "mode"].includes(field)) {
      patch[field] = improvement.suggested_value;
    } else if (["must_collect_fields", "qualification_logic", "disqualification_logic", "escalation_rules", "business_rules", "retry_policy", "qualification_rules", "disqualification_rules"].includes(field)) {
      try {
        patch[field] = typeof improvement.suggested_value === "string"
          ? JSON.parse(improvement.suggested_value)
          : improvement.suggested_value;
      } catch {
        patch[field] = improvement.suggested_value;
      }
    } else if (["consent_required", "disclosure_required", "transfer_required"].includes(field)) {
      patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
    } else {
      patch[field] = improvement.suggested_value;
    }

    patch.version = toVersion;

    // Update spec
    const { error: updateErr } = await supabase
      .from("agent_specs")
      .update(patch)
      .eq("project_id", project_id);
    if (updateErr) throw updateErr;

    // Record improvement
    const { error: impErr } = await supabase.from("improvements").insert({
      project_id,
      from_version: fromVersion,
      to_version: toVersion,
      change_summary: improvement.reason || `Updated ${field}`,
      patch,
    });
    if (impErr) console.error("Error recording improvement:", impErr);

    return new Response(JSON.stringify({
      success: true,
      from_version: fromVersion,
      to_version: toVersion,
      change_summary: improvement.reason,
      patch,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("apply-improvement error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
