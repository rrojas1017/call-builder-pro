import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fields that are expected to be JSON arrays (not objects) */
const ARRAY_FIELDS = ["must_collect_fields", "humanization_notes", "research_sources"];

/**
 * Coerce a value into a proper array.
 * - If already an array, return it.
 * - If a JSON string that parses to an array, return that.
 * - If a prose string, split by newlines/sentences into items.
 * - Otherwise wrap as single-element array.
 */
function coerceToArray(value: any, fieldName: string): string[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON */ }

    // Split by newlines, numbered items, or bullet points
    const lines = value
      .split(/\n|(?:^|\s)(?:\d+[\.\)]\s)|\s*[-•]\s/gm)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5); // skip tiny fragments

    if (lines.length > 1) {
      console.warn(`[apply-improvement] Coerced prose to ${lines.length}-item array for "${fieldName}"`);
      return lines;
    }

    // Can't split meaningfully — wrap as single item
    console.warn(`[apply-improvement] Wrapped prose as single-element array for "${fieldName}"`);
    return [value.trim()];
  }

  // For anything else, wrap
  return [String(value)];
}

/**
 * Merge new array items into existing array, deduplicating by normalized substring match.
 */
function mergeArrays(existing: string[], incoming: string[]): string[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const existingNorms = existing.map(normalize);

  const merged = [...existing];
  for (const item of incoming) {
    const norm = normalize(item);
    // Skip if a substantially similar item already exists
    const isDuplicate = existingNorms.some(en =>
      en.includes(norm) || norm.includes(en) ||
      (norm.length > 10 && en.length > 10 && levenshteinSimilarity(en, norm) > 0.75)
    );
    if (!isDuplicate) {
      merged.push(item);
      existingNorms.push(norm);
    }
  }
  return merged;
}

/** Simple similarity check (Jaccard on words) */
function levenshteinSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

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

    // ── Deduplication caution ──
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

    // Build patch
    const rawField = (improvement.field as string).trim();
    const field = rawField.replace(/\s*\(.*\)$/, "").replace(/\//g, ".").trim();
    const patch: Record<string, any> = {};

    const TEXT_FIELDS = ["tone_style", "opening_line", "disclosure_text", "success_definition", "transfer_phone_number", "language", "use_case", "mode", "voice_id", "background_track", "from_number", "voice_provider", "retell_agent_id"];
    const JSON_FIELDS = ["must_collect_fields", "qualification_logic", "disqualification_logic", "escalation_rules", "business_rules", "retry_policy", "qualification_rules", "disqualification_rules", "humanization_notes", "research_sources", "business_hours", "pronunciation_guide"];
    const BOOL_FIELDS = ["consent_required", "disclosure_required", "transfer_required", "sms_enabled"];
    const NUM_FIELDS = ["temperature", "interruption_threshold", "speaking_speed"];
    const ALL_KNOWN = [...TEXT_FIELDS, ...JSON_FIELDS, ...BOOL_FIELDS, ...NUM_FIELDS];

    // Handle dot-notation fields
    if (field.includes(".")) {
      const [parentCol, ...rest] = field.split(".");
      if (!ALL_KNOWN.includes(parentCol)) {
        const currentBR = spec.business_rules || {};
        let brObj: any;
        try { brObj = typeof currentBR === "string" ? JSON.parse(currentBR) : { ...currentBR }; } catch { brObj = { notes: currentBR }; }
        brObj[field.replace(/\./g, "_")] = improvement.suggested_value;
        patch.business_rules = brObj;
      } else {
        const nestedKey = rest.join(".");
        const currentParentValue = spec[parentCol] || {};
        let parentObj: any;
        try { parentObj = typeof currentParentValue === "string" ? JSON.parse(currentParentValue) : { ...currentParentValue }; } catch { parentObj = {}; }
        parentObj[nestedKey] = improvement.suggested_value;
        patch[parentCol] = parentObj;
      }
    } else if (TEXT_FIELDS.includes(field)) {
      patch[field] = improvement.suggested_value;
    } else if (JSON_FIELDS.includes(field)) {
      let parsedValue: any;
      try {
        parsedValue = typeof improvement.suggested_value === "string"
          ? JSON.parse(improvement.suggested_value)
          : improvement.suggested_value;
      } catch {
        parsedValue = improvement.suggested_value;
      }

      // ── Array field validation & merge ──
      if (ARRAY_FIELDS.includes(field)) {
        const incomingArray = coerceToArray(parsedValue, field);
        const replaceMode = improvement.replace_mode === true;

        if (replaceMode) {
          // Replace mode: use incoming array as-is (for reordering, etc.)
          patch[field] = incomingArray;
          console.log(`[apply-improvement] Replaced ${field} with ${incomingArray.length} items (replace_mode)`);
        } else {
          const existingValue = spec[field];
          const existingArray = Array.isArray(existingValue)
            ? existingValue
            : (typeof existingValue === "string" ? coerceToArray(existingValue, field) : []);

          // Merge instead of replace
          const merged = mergeArrays(existingArray, incomingArray);
          // Cap humanization_notes to prevent unbounded growth
          if (ARRAY_FIELDS.includes(field) && field === "humanization_notes" && merged.length > 15) {
            console.warn(`[apply-improvement] Capping ${field} from ${merged.length} to 15 entries`);
            patch[field] = merged.slice(0, 15);
          } else {
            patch[field] = merged;
          }
          console.log(`[apply-improvement] Merged ${field}: ${existingArray.length} existing + ${incomingArray.length} incoming → ${(patch[field] as string[]).length} total`);
        }
      } else if (field === "business_rules") {
        // ── Deep-merge business_rules.rules array instead of replacing ──
        const replaceMode = improvement.replace_mode === true;
        const existingBR = spec[field] || {};
        let existingObj: any;
        try { existingObj = typeof existingBR === "string" ? JSON.parse(existingBR) : { ...existingBR }; } catch { existingObj = { notes: existingBR }; }
        const existingRules: string[] = Array.isArray(existingObj.rules) ? existingObj.rules : [];

        let incomingObj: any;
        if (typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
          incomingObj = parsedValue;
        } else if (Array.isArray(parsedValue)) {
          incomingObj = { rules: parsedValue };
        } else {
          incomingObj = { rules: [String(parsedValue)] };
        }
        const incomingRules: string[] = Array.isArray(incomingObj.rules) ? incomingObj.rules : [];

        if (replaceMode) {
          patch[field] = { ...existingObj, ...incomingObj };
          console.log(`[apply-improvement] Replaced business_rules (replace_mode)`);
        } else {
          // Merge rules array, keeping all existing + adding new non-duplicates
          const mergedRules = mergeArrays(existingRules, incomingRules);
          // Merge other keys from incoming (non-rules)
          const mergedObj = { ...existingObj, ...incomingObj, rules: mergedRules };
          patch[field] = mergedObj;
          console.log(`[apply-improvement] Merged business_rules: ${existingRules.length} existing + ${incomingRules.length} incoming → ${mergedRules.length} total rules`);
        }
      } else {
        patch[field] = parsedValue;
      }
    } else if (BOOL_FIELDS.includes(field)) {
      patch[field] = improvement.suggested_value === "true" || improvement.suggested_value === true;
    } else if (NUM_FIELDS.includes(field)) {
      patch[field] = Number(improvement.suggested_value);
    } else {
      console.warn(`Unknown field "${field}", storing in business_rules`);
      const currentBR = spec.business_rules || {};
      let brObj: any;
      try { brObj = typeof currentBR === "string" ? JSON.parse(currentBR) : { ...currentBR }; } catch { brObj = { notes: currentBR }; }
      brObj[field.replace(/\s+/g, "_").toLowerCase()] = improvement.suggested_value;
      patch.business_rules = brObj;
    }

    patch.version = toVersion;

    // ── Domain-relevance guard ──
    const guardedFields = ["business_rules", "humanization_notes"];
    const patchKeys = Object.keys(patch).filter(k => k !== "version");
    const useCase = (spec.use_case || "").toLowerCase();

    if (useCase && patchKeys.some(k => guardedFields.includes(k))) {
      const DOMAIN_KEYWORDS: Record<string, string[]> = {
        travel: ["hotel", "flight", "resort", "vacation", "itinerary", "luggage", "boarding pass", "cruise", "tourist", "sightseeing"],
        insurance: ["premium", "deductible", "copay", "enrollment", "medicaid", "medicare", "aca", "marketplace", "fpl", "coverage"],
        solar: ["solar panel", "net metering", "kwh", "inverter", "roof assessment", "photovoltaic"],
        real_estate: ["listing", "open house", "mortgage rate", "escrow", "appraisal", "closing cost"],
      };

      let agentDomain: string | null = null;
      for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        if (keywords.some(kw => useCase.includes(kw) || useCase.includes(domain))) {
          agentDomain = domain;
          break;
        }
      }

      if (agentDomain) {
        const otherDomains = Object.entries(DOMAIN_KEYWORDS).filter(([d]) => d !== agentDomain);
        const patchStr = JSON.stringify(patch).toLowerCase();

        for (const [foreignDomain, foreignKeywords] of otherDomains) {
          const matches = foreignKeywords.filter(kw => patchStr.includes(kw));
          if (matches.length >= 2) {
            console.warn(`Domain mismatch: agent is "${useCase}" (${agentDomain}) but improvement contains ${foreignDomain} keywords: ${matches.join(", ")}. Skipping.`);
            return new Response(JSON.stringify({
              success: false,
              skipped: true,
              reason: `Domain mismatch: improvement contains ${foreignDomain}-related content (${matches.join(", ")}) but agent use case is "${spec.use_case}".`,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // Update spec
    const { error: updateErr } = await supabase
      .from("agent_specs")
      .update(patch)
      .eq("project_id", project_id);
    if (updateErr) throw updateErr;

    // Record improvement
    let auditWarning: string | null = null;
    const { error: impErr } = await supabase.from("improvements").insert({
      project_id,
      from_version: fromVersion,
      to_version: toVersion,
      change_summary: improvement.reason || `Updated ${field}`,
      patch,
      source_recommendation: improvement.original_key || null,
    });
    if (impErr) {
      console.error("Error recording improvement:", impErr);
      auditWarning = `Spec was updated but audit trail insert failed: ${impErr.message}`;
    }

    return new Response(JSON.stringify({
      success: true,
      from_version: fromVersion,
      to_version: toVersion,
      change_summary: improvement.reason,
      patch,
      ...(caution ? { caution } : {}),
      ...(auditWarning ? { audit_warning: auditWarning } : {}),
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
