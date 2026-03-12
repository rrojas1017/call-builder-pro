import { supabase } from "@/integrations/supabase/client";

/**
 * Appends a business rule string to agent_specs.business_rules.rules[].
 * Deduplicates and returns success/failure.
 */
export async function addBusinessRule(projectId: string, rule: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: spec, error: fetchErr } = await supabase
      .from("agent_specs")
      .select("business_rules")
      .eq("project_id", projectId)
      .single();

    if (fetchErr) throw fetchErr;

    let existing = (spec?.business_rules as any) || {};
    // Normalize legacy string format to object
    if (typeof existing === "string") {
      existing = { rules: existing.trim() ? [existing.trim()] : [] };
    }
    const rules: string[] = Array.isArray(existing.rules) ? existing.rules : [];

    // Deduplicate
    const normalized = rule.trim().toLowerCase();
    if (rules.some(r => r.trim().toLowerCase() === normalized)) {
      return { success: true }; // Already exists
    }

    rules.push(rule.trim());

    const { error: updateErr } = await supabase
      .from("agent_specs")
      .update({ business_rules: { ...existing, rules } })
      .eq("project_id", projectId);

    if (updateErr) throw updateErr;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to add business rule" };
  }
}
