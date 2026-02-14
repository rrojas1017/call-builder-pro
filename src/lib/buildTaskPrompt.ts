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
  success_definition?: string | null;
  humanization_notes?: string[] | null;
  mode?: string | null;
}

interface KnowledgeEntry {
  category: string;
  content: string;
}

/** Compact FPL + SEP rules (~800 chars instead of ~3,000) */
export function buildCompactFplSep(): string {
  return `FPL QUALIFICATION (2025): Income must be 100-400% of Federal Poverty Level. Reference: Single=$14.6k-$58.3k; Family of 4=$30k-$120k. Add $5.1k per person beyond 8 for 100% FPL; multiply by 4 for 400%.
- ESI or Medicare → disqualify. Medicaid → tag, no transfer.
- Uninsured/private + income in FPL range → qualified for transfer.

ENROLLMENT TIMING: Outside Open Enrollment (Nov 1 - Dec 15), caller MUST have a Qualifying Life Event (lost coverage, marriage, baby, move, citizenship, divorce w/ coverage loss) within 60 days. No QLE = next Open Enrollment. Income alone does NOT qualify for SEP.`;
}

function buildCompactKnowledge(entries: KnowledgeEntry[]): string {
  if (!entries.length) return "";
  const grouped: Record<string, string[]> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    if (grouped[e.category].length >= 4) continue;
    const text = e.content.length > 150 ? e.content.substring(0, 147) + "..." : e.content;
    grouped[e.category].push(text);
  }
  const labels: Record<string, string> = {
    product_knowledge: "PRODUCT KNOWLEDGE",
    objection_handling: "OBJECTION HANDLING",
    industry_insight: "INDUSTRY INSIGHTS",
    competitor_info: "COMPETITOR AWARENESS",
  };
  const parts: string[] = [];
  for (const [cat, items] of Object.entries(grouped)) {
    const label = labels[cat] || cat.toUpperCase();
    parts.push(`${label}: ${items.join(". ")}`);
  }
  return parts.join("\n");
}

function buildCompactStyle(notes: string[]): string {
  if (!notes.length) return "Be naturally warm and conversational.";
  const condensed = notes.slice(0, 10).map(n => {
    const clean = n.replace(/^\d+\.\s*/, "").trim();
    return clean.length > 80 ? clean.substring(0, 77) + "..." : clean;
  });
  return condensed.join(". ") + ".";
}

export function buildTaskPrompt(spec: AgentSpec, knowledge: KnowledgeEntry[] = [], knowledgeBriefing?: string): string {
  const purpose = spec.use_case || spec.success_definition || "Conduct a professional outbound call.";
  const discl = spec.disclosure_text || "";
  const tone = spec.tone_style || "Friendly, professional, empathetic";
  const transferNum = spec.transfer_phone_number || "";
  const transferDigits = transferNum.replace(/\D/g, "");
  const isHealth = shouldIncludeFplTable(spec.use_case);

  const humanNotes = Array.isArray(spec.humanization_notes) ? spec.humanization_notes : [];
  const styleGuide = buildCompactStyle(humanNotes);

  // Parse fields
  const rawFields = spec.must_collect_fields;
  let fields: string[] = [];
  if (Array.isArray(rawFields)) {
    fields = [...rawFields];
  } else if (typeof rawFields === "string") {
    try { const p = JSON.parse(rawFields); if (Array.isArray(p)) fields = p; } catch { /* skip */ }
  }

  // Inject name confirmation after consent if not already present
  if (fields.length > 0 && !fields.some(f => f.toLowerCase().includes('confirm') && f.toLowerCase().includes('name'))) {
    const consentIdx = fields.findIndex(f => f.toLowerCase().includes('consent'));
    if (consentIdx >= 0) {
      fields.splice(consentIdx + 1, 0, "Can I confirm your full name?");
    } else {
      fields.unshift("Can I confirm your full name?");
    }
  }

  const qualRules = spec.qualification_rules
    ? (typeof spec.qualification_rules === "string" ? spec.qualification_rules : JSON.stringify(spec.qualification_rules, null, 2))
    : null;
  const disqualRules = spec.disqualification_rules
    ? (typeof spec.disqualification_rules === "string" ? spec.disqualification_rules : JSON.stringify(spec.disqualification_rules, null, 2))
    : null;

  let prompt = `You are a REAL PERSON on a phone call — not AI, not a robot.

INTERACTION STYLE: ${styleGuide}

PURPOSE: ${purpose}

RULES:
- Tone: ${tone}
- Sound natural: vary sentence length, react genuinely, use casual transitions ("Gotcha", "Makes sense").
- Use caller's name occasionally. Acknowledge each answer before the next question.
- Never guess or assume answers.`;

  if (knowledgeBriefing) {
    prompt += `\n\nKNOWLEDGE BRIEFING:\n${knowledgeBriefing}`;
  } else {
    const knowledgeSection = buildCompactKnowledge(knowledge);
    if (knowledgeSection) {
      prompt += `\n\nDOMAIN KNOWLEDGE:\n${knowledgeSection}`;
    }
  }

  if (discl) {
    prompt += `\n\nDISCLOSURE (read at start): "${discl}"`;
  }

  if (fields.length > 0) {
    prompt += `\n\nCOLLECT (in order):\n${fields.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;
    prompt += `\nZIP: Must be exactly 5 digits.`;
  }

  if (isHealth) {
    prompt += `\n\n${buildCompactFplSep()}`;
    if (fields.length > 0 && !fields.some(f => f.toLowerCase().includes('life event') || f.toLowerCase().includes('qle'))) {
      prompt += `\nASK: "Have you recently had any life changes like losing coverage, marriage, baby, or moving?"`;
    }
  }

  if (qualRules) prompt += `\n\nQUALIFICATION:\n${qualRules}`;
  if (disqualRules) prompt += `\n\nDISQUALIFICATION:\n${disqualRules}`;

  if (transferDigits.length >= 10) {
    const formatted = transferDigits.startsWith("1") ? `+${transferDigits}` : `+1${transferDigits}`;
    prompt += `\n\nTRANSFER: If qualified, confirm the transfer CLEARLY and COMPLETELY before initiating. Say something like "Great news, you qualify! I'm going to connect you with a specialist now." WAIT for the sentence to finish — do NOT start the transfer mid-sentence. Then transfer to ${formatted}. Never cut off your own confirmation.`;
  }

  prompt += `\n\nFALLBACK: After 2 failed attempts to collect info, end politely.`;
  prompt += `\nSUMMARY: After call, JSON with all collected fields + caller_name.`;

  return prompt;
}
