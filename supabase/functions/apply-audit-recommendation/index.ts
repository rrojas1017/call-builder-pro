import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Field classification (mirrors apply-improvement) ──

const TEXT_FIELDS = ["tone_style", "opening_line", "disclosure_text", "success_definition", "transfer_phone_number", "language", "use_case", "mode", "voice_id", "background_track", "from_number", "voice_provider", "retell_agent_id"];
const JSON_FIELDS = ["must_collect_fields", "qualification_rules", "disqualification_rules", "escalation_rules", "business_rules", "retry_policy", "humanization_notes", "research_sources", "business_hours", "pronunciation_guide"];
const BOOL_FIELDS = ["consent_required", "disclosure_required", "transfer_required", "sms_enabled"];
const NUM_FIELDS = ["temperature", "interruption_threshold", "speaking_speed"];
const ARRAY_FIELDS = ["must_collect_fields", "humanization_notes", "research_sources"];
const ALL_KNOWN = [...TEXT_FIELDS, ...JSON_FIELDS, ...BOOL_FIELDS, ...NUM_FIELDS];

// ── Array helpers (from apply-improvement) ──

function coerceToArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const p = JSON.parse(value); if (Array.isArray(p)) return p; } catch {}
    const lines = value.split(/\n|(?:^|\s)(?:\d+[\.\)]\s)|\s*[-•]\s/gm).map(s => s.trim()).filter(s => s.length > 5);
    if (lines.length > 1) return lines;
    return [value.trim()];
  }
  return [String(value)];
}

function mergeArrays(existing: string[], incoming: string[]): string[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const existingNorms = existing.map(normalize);
  const merged = [...existing];
  for (const item of incoming) {
    const norm = normalize(item);
    const isDup = existingNorms.some(en => en.includes(norm) || norm.includes(en));
    if (!isDup) { merged.push(item); existingNorms.push(norm); }
  }
  return merged;
}

// ── Domain guard (from apply-improvement) ──

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  travel: ["hotel", "flight", "resort", "vacation", "itinerary"],
  insurance: ["premium", "deductible", "copay", "enrollment", "medicaid", "medicare", "aca", "marketplace", "fpl", "coverage"],
  solar: ["solar panel", "net metering", "kwh", "inverter", "roof assessment"],
  real_estate: ["listing", "open house", "mortgage rate", "escrow", "appraisal"],
};

function checkDomainMismatch(useCase: string, patch: Record<string, any>): string | null {
  const uc = useCase.toLowerCase();
  let agentDomain: string | null = null;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => uc.includes(kw) || uc.includes(domain))) { agentDomain = domain; break; }
  }
  if (!agentDomain) return null;
  const patchStr = JSON.stringify(patch).toLowerCase();
  for (const [foreignDomain, foreignKeywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (foreignDomain === agentDomain) continue;
    const matches = foreignKeywords.filter(kw => patchStr.includes(kw));
    if (matches.length >= 2) return `Domain mismatch: ${foreignDomain} content (${matches.join(", ")}) for ${useCase} agent`;
  }
  return null;
}

// ── Build patch from mapped recommendation ──

function buildPatch(spec: any, field: string, suggestedValue: any): Record<string, any> {
  const patch: Record<string, any> = {};
  const f = field.replace(/\s*\(.*\)$/, "").replace(/\//g, ".").trim();

  if (f.includes(".")) {
    const [parentCol, ...rest] = f.split(".");
    if (!ALL_KNOWN.includes(parentCol)) {
      const br = typeof spec.business_rules === "string" ? JSON.parse(spec.business_rules) : { ...(spec.business_rules || {}) };
      br[f.replace(/\./g, "_")] = suggestedValue;
      patch.business_rules = br;
    } else {
      const cur = spec[parentCol] || {};
      const obj = typeof cur === "string" ? JSON.parse(cur) : { ...cur };
      obj[rest.join(".")] = suggestedValue;
      patch[parentCol] = obj;
    }
  } else if (TEXT_FIELDS.includes(f)) {
    patch[f] = suggestedValue;
  } else if (JSON_FIELDS.includes(f)) {
    let parsed: any;
    try { parsed = typeof suggestedValue === "string" ? JSON.parse(suggestedValue) : suggestedValue; } catch { parsed = suggestedValue; }
    if (ARRAY_FIELDS.includes(f)) {
      const incoming = coerceToArray(parsed);
      const existing = Array.isArray(spec[f]) ? spec[f] : (typeof spec[f] === "string" ? coerceToArray(spec[f]) : []);
      patch[f] = mergeArrays(existing, incoming);
    } else {
      patch[f] = parsed;
    }
  } else if (BOOL_FIELDS.includes(f)) {
    patch[f] = suggestedValue === "true" || suggestedValue === true;
  } else if (NUM_FIELDS.includes(f)) {
    patch[f] = Number(suggestedValue);
  } else {
    const br = typeof spec.business_rules === "string" ? JSON.parse(spec.business_rules) : { ...(spec.business_rules || {}) };
    br[f.replace(/\s+/g, "_").toLowerCase()] = suggestedValue;
    patch.business_rules = br;
  }
  return patch;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_id, recommendation, category } = await req.json();
    if (!project_id || !recommendation) throw new Error("project_id and recommendation required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current spec
    const { data: spec, error: specErr } = await supabase
      .from("agent_specs")
      .select("*")
      .eq("project_id", project_id)
      .single();
    if (specErr) throw specErr;

    // Build a summary of the current spec for the AI
    const specSummary = {
      use_case: spec.use_case,
      tone_style: spec.tone_style,
      opening_line: spec.opening_line,
      temperature: spec.temperature,
      interruption_threshold: spec.interruption_threshold,
      speaking_speed: spec.speaking_speed,
      consent_required: spec.consent_required,
      disclosure_required: spec.disclosure_required,
      transfer_required: spec.transfer_required,
      sms_enabled: spec.sms_enabled,
      must_collect_fields: spec.must_collect_fields,
      humanization_notes: spec.humanization_notes,
      business_rules: spec.business_rules,
      qualification_rules: spec.qualification_rules,
      disqualification_rules: spec.disqualification_rules,
      escalation_rules: spec.escalation_rules,
      success_definition: spec.success_definition,
      disclosure_text: spec.disclosure_text,
      version: spec.version,
    };

    const allFieldsList = ALL_KNOWN.join(", ");

    // Ask AI to map the recommendation to a concrete patch
    const aiResponse = await callAI({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are an expert AI agent configuration specialist. Your job is to translate a natural-language audit recommendation into a concrete configuration change.

The agent spec has these fields: ${allFieldsList}

Current spec: ${JSON.stringify(specSummary)}

Rules:
- If the recommendation maps to a specific spec field change, use action "patch_spec" and provide the field name and new value.
- If the recommendation is about adding knowledge/information the agent should know, use action "add_knowledge".
- If the recommendation requires manual human intervention (e.g., "hire more agents", "review legal compliance"), use action "manual".
- For array fields (must_collect_fields, humanization_notes, research_sources), provide the new items as a JSON array of strings.
- For JSON object fields (business_rules, qualification_rules, etc.), provide the complete updated object.
- Be precise with field names — they must exactly match one of the known fields.`,
        },
        {
          role: "user",
          content: `Audit category: ${category || "general"}\n\nRecommendation: "${recommendation}"\n\nMap this to a concrete change.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "map_recommendation",
            description: "Map an audit recommendation to a concrete agent configuration change",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["patch_spec", "add_knowledge", "manual"],
                  description: "The type of action to take",
                },
                field: {
                  type: "string",
                  description: "The spec field to update (for patch_spec action)",
                },
                suggested_value: {
                  description: "The new value for the field. Use appropriate types: string for text, number for numeric, boolean for flags, array/object for JSON fields.",
                },
                reason: {
                  type: "string",
                  description: "Brief explanation of what this change does",
                },
                knowledge_content: {
                  type: "string",
                  description: "Content to add to agent knowledge (for add_knowledge action)",
                },
                knowledge_category: {
                  type: "string",
                  description: "Category for knowledge entry (for add_knowledge action)",
                },
                manual_note: {
                  type: "string",
                  description: "Explanation of why manual intervention is needed (for manual action)",
                },
              },
              required: ["action", "reason"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "map_recommendation" } },
      temperature: 0.2,
      max_tokens: 2048,
    });

    if (!aiResponse.tool_calls.length) {
      return new Response(JSON.stringify({ success: false, manual: true, note: "AI could not map this recommendation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mapping = aiResponse.tool_calls[0].arguments as {
      action: string;
      field?: string;
      suggested_value?: any;
      reason?: string;
      knowledge_content?: string;
      knowledge_category?: string;
      manual_note?: string;
    };

    // ── Handle manual action ──
    if (mapping.action === "manual") {
      return new Response(JSON.stringify({
        success: false,
        manual: true,
        note: mapping.manual_note || mapping.reason || "This recommendation requires manual review",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Handle add_knowledge ──
    if (mapping.action === "add_knowledge") {
      const { error: kErr } = await supabase.from("agent_knowledge").insert({
        project_id,
        content: mapping.knowledge_content || recommendation,
        category: mapping.knowledge_category || "audit_recommendation",
        source_type: "audit",
      });
      if (kErr) throw kErr;
      return new Response(JSON.stringify({
        success: true,
        action: "add_knowledge",
        reason: mapping.reason,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Handle patch_spec ──
    if (!mapping.field || mapping.suggested_value === undefined) {
      return new Response(JSON.stringify({
        success: false,
        manual: true,
        note: "AI mapped to patch_spec but didn't provide field/value",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patch = buildPatch(spec, mapping.field, mapping.suggested_value);

    // Domain guard
    const domainIssue = checkDomainMismatch(spec.use_case || "", patch);
    if (domainIssue) {
      return new Response(JSON.stringify({ success: false, skipped: true, reason: domainIssue }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Version bump
    const fromVersion = spec.version;
    const toVersion = fromVersion + 1;
    patch.version = toVersion;

    // Apply
    const { error: updateErr } = await supabase
      .from("agent_specs")
      .update(patch)
      .eq("project_id", project_id);
    if (updateErr) throw updateErr;

    // Record improvement
    await supabase.from("improvements").insert({
      project_id,
      from_version: fromVersion,
      to_version: toVersion,
      change_summary: mapping.reason || `Applied audit recommendation: ${recommendation.slice(0, 100)}`,
      patch,
      source_recommendation: recommendation,
    });

    return new Response(JSON.stringify({
      success: true,
      action: "patch_spec",
      field: mapping.field,
      from_version: fromVersion,
      to_version: toVersion,
      reason: mapping.reason,
      patch,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("apply-audit-recommendation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
