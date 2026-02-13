import { shouldIncludeFplTable } from "./fplThresholds";

interface AgentSpec {
  disclosure_text?: string | null;
  consent_required?: boolean;
  must_collect_fields?: string[] | null;
  qualification_rules?: Record<string, any> | null;
  disqualification_rules?: Record<string, any> | null;
  transfer_phone_number?: string | null;
  tone_style?: string | null;
  language?: string | null;
  use_case?: string | null;
}

/** Compact FPL + SEP rules (~800 chars instead of ~3,000) */
export function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2025): Income must be 100-400% of Federal Poverty Level. Reference: Single=$14.6k-$58.3k; Family of 4=$30k-$120k. Add $5.1k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

export function buildTaskPrompt(spec: AgentSpec): string {
  const discl = spec.disclosure_text || "This call may be recorded for quality and compliance purposes.";
  const isHealth = shouldIncludeFplTable(spec.use_case);
  const baseFields = ["consent", "confirm_name", "state", "zip_code", "age", "household_size", "income_est_annual", "coverage_type"];
  const healthFields = isHealth ? [...baseFields, "qualifying_life_event"] : baseFields;
  const fields = (spec.must_collect_fields as string[]) || healthFields;
  const transferNum = spec.transfer_phone_number || "";

  return `You are a REAL PERSON on a phone call — not AI, not a robot.

DISCLOSURE (read verbatim at the start):
"${discl}"

RULES:
- Obtain verbal consent before screening. If declined, end politely.
- NEVER give insurance advice. Say: "A licensed agent can explain after transfer."
- Tone: ${spec.tone_style || "Friendly, professional, empathetic"}

COLLECT (in order):
${fields.map((f, i) => `${i + 1}. ${formatField(f)}`).join("\n")}

${isHealth ? buildCompactFplSep() + "\n\n" : ""}QUALIFICATION:
- ESI or Medicare → DISQUALIFY.
- Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.
- Outside Open Enrollment, caller MUST have a QLE. No QLE = next Open Enrollment.
- If qualified: "That sounds really promising -- let me connect you now."
- TRANSFER: ONE short sentence before transferring.
${transferNum ? `- Transfer to: ${transferNum}` : "- No transfer number configured."}

FALLBACK: After 2 failed attempts, end politely.
SUMMARY: After call, JSON with: consent, caller_name, state, zip_code, age, household_size, income_est_annual, coverage_type, qualifying_life_event, qualified, disqual_reason, transfer_attempted, transfer_completed.`;
}

function formatField(field: string): string {
  const labels: Record<string, string> = {
    consent: "Obtain verbal consent for screening",
    confirm_name: "Confirm full name",
    state: "What state do you live in?",
    zip_code: "Zip code? (must be 5 digits)",
    age: "How old are you?",
    household_size: "How many in your household?",
    income_est_annual: "Estimated annual household income?",
    coverage_type: "Current health insurance? (uninsured, private, employer, Medicare, Medicaid)",
    qualifying_life_event: "Any recent life changes? (lost coverage, marriage, baby, move)",
  };
  return labels[field] || field;
}
