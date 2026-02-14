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

    // ── Deduplication caution: check if same field was changed recently without improvement ──
    let caution: string | null = null;
    try {
      const rawField = (improvement.field as string).trim();
      const fieldNorm = rawField.replace(/\s*\(.*\)$/, "").replace(/\//g, ".").trim();

      const { data: recentPatches } = await supabase
        .from("improvements")
        .select("from_version, to_version, patch, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(5);

      const recentFieldChanges = (recentPatches || []).filter((p: any) => {
        if (!p.patch || typeof p.patch !== "object") return false;
        return Object.keys(p.patch).some(k => k !== "version" && k === fieldNorm);
      });

      if (recentFieldChanges.length >= 2) {
        // Check if scores improved between the last two changes
        const { data: snapshots } = await supabase
          .from("score_snapshots")
          .select("spec_version, avg_overall")
          .eq("project_id", project_id)
          .order("spec_version", { ascending: false })
          .limit(5);

        const lastChange = recentFieldChanges[0];
        const beforeSnap = (snapshots || []).find((s: any) => s.spec_version === lastChange.from_version);
        const afterSnap = (snapshots || []).find((s: any) => s.spec_version === lastChange.to_version);

        if (beforeSnap && afterSnap && (afterSnap.avg_overall || 0) <= (beforeSnap.avg_overall || 0)) {
          caution = `Field "${fieldNorm}" was changed ${recentFieldChanges.length} times recently without score improvement. Consider a different approach.`;
          console.warn(caution);
        }
      }
    } catch (e) {
      console.error("Dedup check failed:", e);
    }

    // Build patch — strip parenthetical descriptions from field names
    const rawField = (improvement.field as string).trim();
    const field = rawField.replace(/\s*\(.*\)$/, "").replace(/\//g, ".").trim();
    const patch: Record<string, any> = {};

    // Known columns on agent_specs that are safe to update directly
    const TEXT_FIELDS = ["tone_style", "opening_line", "disclosure_text", "success_definition", "transfer_phone_number", "language", "use_case", "mode", "voice_id", "background_track", "from_number", "voice_provider", "retell_agent_id"];
    const JSON_FIELDS = ["must_collect_fields", "qualification_logic", "disqualification_logic", "escalation_rules", "business_rules", "retry_policy", "qualification_rules", "disqualification_rules", "humanization_notes", "research_sources", "business_hours", "pronunciation_guide"];
    const BOOL_FIELDS = ["consent_required", "disclosure_required", "transfer_required", "sms_enabled"];
    const NUM_FIELDS = ["temperature", "interruption_threshold", "speaking_speed"];
    const ALL_KNOWN = [...TEXT_FIELDS, ...JSON_FIELDS, ...BOOL_FIELDS, ...NUM_FIELDS];

    // Handle dot-notation fields (e.g. "qualification_rules.income_range")
    if (field.includes(".")) {
      const [parentCol, ...rest] = field.split(".");
      if (!ALL_KNOWN.includes(parentCol)) {
        const currentBR = spec.business_rules || {};
        const brObj = typeof currentBR === "string" ? JSON.parse(currentBR) : { ...currentBR };
        brObj[field.replace(/\./g, "_")] = improvement.suggested_value;
        patch.business_rules = brObj;
      } else {
        const nestedKey = rest.join(".");
        const currentParentValue = spec[parentCol] || {};
        const parentObj = typeof currentParentValue === "string"
          ? JSON.parse(currentParentValue)
          : { ...currentParentValue };
        parentObj[nestedKey] = improvement.suggested_value;
        patch[parentCol] = parentObj;
      }
    } else if (TEXT_FIELDS.includes(field)) {
      patch[field] = improvement.suggested_value;
    } else if (JSON_FIELDS.includes(field)) {
      try {
        patch[field] = typeof improvement.suggested_value === "string"
          ? JSON.parse(improvement.suggested_value)
          : improvement.suggested_value;
      } catch {
        patch[field] = improvement.suggested_value;
      }
    } else if (BOOL_FIELDS.includes(field)) {
      patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
    } else if (NUM_FIELDS.includes(field)) {
      patch[field] = Number(improvement.suggested_value);
    } else {
      console.warn(`Unknown field "${field}", storing in business_rules`);
      const currentBR = spec.business_rules || {};
      const brObj = typeof currentBR === "string" ? JSON.parse(currentBR) : { ...currentBR };
      brObj[field.replace(/\s+/g, "_").toLowerCase()] = improvement.suggested_value;
      patch.business_rules = brObj;
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
      ...(caution ? { caution } : {}),
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
